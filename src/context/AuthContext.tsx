import type {
  AuthChangeEvent,
  AuthOtpResponse,
  AuthResponse,
  AuthTokenResponsePassword,
  Session,
  User,
} from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";

import {
  clearRecoveryMarker,
  loadRecoveryMarker,
  saveRecoveryMarker,
  type RecoveryMarker,
} from "../services/auth/recoveryMarker";
import {
  createPasswordRecoveryRedirectUrl,
  fingerprintRecoveryCode,
  parsePasswordRecoveryCallback,
  removeRecoveryParametersFromVisibleUrl,
} from "../services/auth/recoveryRedirect";
import { supabase } from "../services/supabase/supabaseClient";

export type RecoveryState =
  | "idle"
  | "processing"
  | "ready"
  | "invalid"
  | "completing"
  | "completion-error"
  | "completed";

export type PasswordResetRequestResult =
  | { status: "sent" }
  | { status: "rate-limit" | "network" | "service" };

export type RecoveryPasswordResult =
  | { status: "completed" }
  | { status: "same-password" | "weak-password" | "failed" | "sign-out-failed" };

type AuthContextType = {
  session: Session | null;
  user: User | null;
  authIdentity: AuthIdentity | null;
  isLoading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<AuthTokenResponsePassword>;
  signUp: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<AuthResponse>;
  verifySignupCode: (email: string, token: string) => Promise<AuthResponse>;
  resendSignupCode: (email: string) => Promise<AuthOtpResponse>;
  requestPasswordReset: (email: string) => Promise<PasswordResetRequestResult>;
  recoveryState: RecoveryState;
  updateRecoveryPassword: (
    password: string,
    onPasswordUpdated?: () => void,
  ) => Promise<RecoveryPasswordResult>;
  finishRecoverySession: () => Promise<boolean>;
  cancelRecovery: () => Promise<void>;
  signOut: () => Promise<boolean>;
  isSigningOut: boolean;
};

export type AuthIdentity = Readonly<{
  userId: string;
  generation: number;
}>;

type SignOutOperation = {
  id: symbol;
  owner: AuthIdentity;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function identitiesMatch(
  first: AuthIdentity | null,
  second: AuthIdentity | null,
) {
  return (
    first?.userId === second?.userId &&
    first?.generation === second?.generation
  );
}

function classifyResetRequestError(code: string | undefined) {
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit"
  ) {
    return "rate-limit" as const;
  }

  if (
    code === "request_timeout" ||
    code === "network_error" ||
    code === "fetch_error"
  ) {
    return "network" as const;
  }

  return "service" as const;
}

function markerMatches(
  marker: RecoveryMarker,
  session: Session,
  sessionId: string,
) {
  return (
    marker.userId === session.user.id &&
    marker.sessionId === sessionId &&
    marker.expiresAt > Date.now()
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [rawSession, setRawSession] = useState<Session | null>(null);
  const [authIdentity, setAuthIdentity] = useState<AuthIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [recoveryState, setRecoveryState] =
    useState<RecoveryState>("processing");
  const rawSessionRef = useRef<Session | null>(null);
  const authIdentityRef = useRef<AuthIdentity | null>(null);
  const authGenerationRef = useRef(0);
  const signOutOperationRef = useRef<SignOutOperation | null>(null);
  const recoveryStateRef = useRef<RecoveryState>("processing");
  const recoveryEventSessionRef = useRef<Session | null>(null);
  const processedRecoveryCodesRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  const publishRecoveryState = useCallback((state: RecoveryState) => {
    recoveryStateRef.current = state;
    setRecoveryState(state);
  }, []);

  const publishSession = useCallback((nextSession: Session | null) => {
    const previousUserId = rawSessionRef.current?.user.id ?? null;
    const nextUserId = nextSession?.user.id ?? null;

    if (previousUserId !== nextUserId) {
      authGenerationRef.current += 1;

      const nextIdentity = nextUserId
        ? { userId: nextUserId, generation: authGenerationRef.current }
        : null;

      authIdentityRef.current = nextIdentity;
      signOutOperationRef.current = null;
      setAuthIdentity(nextIdentity);
      setIsSigningOut(false);
    }

    rawSessionRef.current = nextSession;
    setRawSession(nextSession);
  }, []);

  const getVerifiedSessionDescriptor = useCallback(async (session: Session) => {
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data) return null;

    const { session_id: sessionId, sub, exp } = data.claims;

    if (
      typeof sessionId !== "string" ||
      !sessionId ||
      sub !== session.user.id ||
      typeof exp !== "number" ||
      exp * 1000 <= Date.now()
    ) {
      return null;
    }

    return { sessionId, expiresAt: exp * 1000 };
  }, []);

  const establishRecoverySession = useCallback(
    async (session: Session) => {
      const descriptor = await getVerifiedSessionDescriptor(session);

      if (
        !mountedRef.current ||
        recoveryEventSessionRef.current !== session ||
        rawSessionRef.current?.user.id !== session.user.id
      ) {
        return;
      }

      if (!descriptor) {
        await clearRecoveryMarker();
        publishRecoveryState("invalid");
        return;
      }

      try {
        await saveRecoveryMarker({
          version: 1,
          userId: session.user.id,
          sessionId: descriptor.sessionId,
          expiresAt: descriptor.expiresAt,
        });
      } catch {
        publishRecoveryState("invalid");
        return;
      }

      if (
        mountedRef.current &&
        recoveryEventSessionRef.current === session &&
        rawSessionRef.current?.user.id === session.user.id
      ) {
        publishRecoveryState("ready");
      }
    },
    [getVerifiedSessionDescriptor, publishRecoveryState],
  );

  useEffect(() => {
    mountedRef.current = true;
    let authSubscription: { unsubscribe: () => void } | null = null;
    let urlSubscription: { remove: () => void } | null = null;
    let initializationFinished = false;

    const handleAuthChange = (
      event: AuthChangeEvent,
      nextSession: Session | null,
    ) => {
      if (!mountedRef.current) return;

      if (event === "PASSWORD_RECOVERY" && nextSession) {
        recoveryEventSessionRef.current = nextSession;
        publishRecoveryState("processing");
        publishSession(nextSession);
        setTimeout(() => {
          void establishRecoverySession(nextSession);
        }, 0);
        return;
      }

      if (event === "SIGNED_OUT") {
        publishSession(null);
        void clearRecoveryMarker();

        if (
          recoveryStateRef.current !== "completing" &&
          recoveryStateRef.current !== "completed"
        ) {
          recoveryEventSessionRef.current = null;
          publishRecoveryState("idle");
        }
        return;
      }

      if (
        recoveryStateRef.current !== "idle" &&
        nextSession &&
        recoveryEventSessionRef.current &&
        nextSession.user.id !== recoveryEventSessionRef.current.user.id
      ) {
        recoveryEventSessionRef.current = null;
        void clearRecoveryMarker();
        publishSession(nextSession);
        publishRecoveryState("invalid");
        return;
      }

      if (
        event === "SIGNED_IN" &&
        nextSession &&
        recoveryStateRef.current === "completed"
      ) {
        publishSession(nextSession);
        publishRecoveryState("idle");
        return;
      }

      if (recoveryStateRef.current === "idle") {
        publishSession(nextSession);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handleAuthChange);
    authSubscription = subscription;

    const invalidateRecovery = async () => {
      recoveryEventSessionRef.current = null;
      await clearRecoveryMarker();
      publishRecoveryState("invalid");
      setIsLoading(false);
    };

    const processRecoveryUrl = async (url: string | null) => {
      const callback = parsePasswordRecoveryCallback(url);

      if (callback.kind === "none") return false;

      if (callback.kind === "direct") {
        publishRecoveryState("processing");
        removeRecoveryParametersFromVisibleUrl();
        try {
          await restoreOrdinaryOrRecoverySession(true);
          setIsLoading(false);
        } catch {
          await invalidateRecovery();
        }
        return true;
      }

      if (callback.kind !== "code") {
        publishRecoveryState("processing");
        removeRecoveryParametersFromVisibleUrl();
        await invalidateRecovery();
        return true;
      }

      const fingerprint = await fingerprintRecoveryCode(callback.code);

      if (processedRecoveryCodesRef.current.has(fingerprint)) return true;
      processedRecoveryCodesRef.current.add(fingerprint);
      publishRecoveryState("processing");
      removeRecoveryParametersFromVisibleUrl();

      const { error } = await supabase.auth.exchangeCodeForSession(
        callback.code,
      );

      if (
        error ||
        !recoveryEventSessionRef.current ||
        recoveryStateRef.current === "idle"
      ) {
        await invalidateRecovery();
      }

      setIsLoading(false);
      return true;
    };

    const restoreOrdinaryOrRecoverySession = async (requireRecovery = false) => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) throw error;

      const marker = await loadRecoveryMarker();

      if (!marker || !session) {
        if (requireRecovery) {
          await invalidateRecovery();
          return;
        }
        if (marker) await clearRecoveryMarker();
        publishSession(session);
        publishRecoveryState("idle");
        return;
      }

      const descriptor = await getVerifiedSessionDescriptor(session);

      if (
        descriptor &&
        markerMatches(marker, session, descriptor.sessionId)
      ) {
        recoveryEventSessionRef.current = session;
        publishSession(session);
        publishRecoveryState("ready");
        return;
      }

      if (requireRecovery) {
        await invalidateRecovery();
        return;
      }

      await clearRecoveryMarker();
      publishSession(session);
      publishRecoveryState("idle");
    };

    const initialize = async () => {
      let isRecoveryRequest = false;
      try {
        const initialUrl = await Linking.getInitialURL();
        const initialCallback = parsePasswordRecoveryCallback(initialUrl);
        isRecoveryRequest = initialCallback.kind !== "none";

        if (initialCallback.kind !== "none") {
          publishRecoveryState("processing");
        }

        urlSubscription = Linking.addEventListener("url", ({ url }) => {
          void processRecoveryUrl(url);
        });

        const handledRecovery = await processRecoveryUrl(initialUrl);

        if (!handledRecovery) {
          await restoreOrdinaryOrRecoverySession();
          setIsLoading(false);
        }
      } catch {
        if (isRecoveryRequest) {
          await invalidateRecovery();
          return;
        }
        await clearRecoveryMarker();
        publishSession(null);
        publishRecoveryState("idle");
        setIsLoading(false);
      } finally {
        initializationFinished = true;
      }
    };

    void initialize();

    return () => {
      mountedRef.current = false;
      authSubscription?.unsubscribe();
      urlSubscription?.remove();

      if (!initializationFinished) {
        recoveryEventSessionRef.current = null;
      }
    };
  }, [
    establishRecoverySession,
    getVerifiedSessionDescriptor,
    publishRecoveryState,
    publishSession,
  ]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const updateAutoRefresh = (state: string) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };

    updateAutoRefresh(AppState.currentState);
    const subscription = AppState.addEventListener("change", updateAutoRefresh);

    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  const recoveryActive = recoveryState !== "idle";
  const session = recoveryActive ? null : rawSession;
  const user = session?.user ?? null;
  const visibleAuthIdentity = recoveryActive ? null : authIdentity;

  const signIn = useCallback((email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signUp = useCallback(
    (fullName: string, email: string, password: string) => {
      return supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
    },
    [],
  );

  const verifySignupCode = useCallback((email: string, token: string) => {
    return supabase.auth.verifyOtp({ email, token, type: "email" });
  }, []);

  const resendSignupCode = useCallback((email: string) => {
    return supabase.auth.resend({ email, type: "signup" });
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: createPasswordRecoveryRedirectUrl(),
      });

      if (!error) return { status: "sent" } as const;

      if (
        error.code === "user_not_found" ||
        error.code === "identity_not_found"
      ) {
        return { status: "sent" } as const;
      }

      return { status: classifyResetRequestError(error.code) };
    } catch {
      return { status: "network" } as const;
    }
  }, []);

  const finishRecoverySession = useCallback(async () => {
    publishRecoveryState("completing");
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      publishRecoveryState("completion-error");
      return false;
    }

    await clearRecoveryMarker();
    recoveryEventSessionRef.current = null;
    publishSession(null);
    publishRecoveryState("completed");
    return true;
  }, [publishRecoveryState, publishSession]);

  const updateRecoveryPassword = useCallback(
    async (
      password: string,
      onPasswordUpdated?: () => void,
    ): Promise<RecoveryPasswordResult> => {
      if (
        recoveryStateRef.current !== "ready" ||
        !recoveryEventSessionRef.current
      ) {
        return { status: "failed" };
      }

      publishRecoveryState("completing");

      try {
        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
          publishRecoveryState("ready");
          if (error.code === "same_password") {
            return { status: "same-password" };
          }
          return {
            status: error.code === "weak_password" ? "weak-password" : "failed",
          };
        }

        onPasswordUpdated?.();
        const signedOut = await finishRecoverySession();
        return signedOut
          ? { status: "completed" }
          : { status: "sign-out-failed" };
      } catch {
        publishRecoveryState("ready");
        return { status: "failed" };
      }
    },
    [finishRecoverySession, publishRecoveryState],
  );

  const cancelRecovery = useCallback(async () => {
    await clearRecoveryMarker();
    recoveryEventSessionRef.current = null;
    await supabase.auth.signOut({ scope: "local" });
    publishSession(null);
    publishRecoveryState("idle");
  }, [publishRecoveryState, publishSession]);

  const signOut = useCallback(async () => {
    const owner = authIdentityRef.current;

    if (!rawSessionRef.current || !owner || signOutOperationRef.current) {
      return false;
    }

    const operation: SignOutOperation = { id: Symbol("signOut"), owner };
    signOutOperationRef.current = operation;
    setIsSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      return !error;
    } catch {
      return false;
    } finally {
      const activeOperation = signOutOperationRef.current;
      const currentIdentity = authIdentityRef.current;

      if (
        activeOperation?.id === operation.id &&
        identitiesMatch(activeOperation.owner, operation.owner) &&
        identitiesMatch(currentIdentity, operation.owner)
      ) {
        signOutOperationRef.current = null;
        setIsSigningOut(false);
      }
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user,
      authIdentity: visibleAuthIdentity,
      isLoading,
      isSigningOut,
      signIn,
      signUp,
      verifySignupCode,
      resendSignupCode,
      requestPasswordReset,
      recoveryState,
      updateRecoveryPassword,
      finishRecoverySession,
      cancelRecovery,
      signOut,
    }),
    [
      cancelRecovery,
      finishRecoverySession,
      isLoading,
      isSigningOut,
      recoveryState,
      requestPasswordReset,
      resendSignupCode,
      session,
      signIn,
      signOut,
      signUp,
      updateRecoveryPassword,
      user,
      verifySignupCode,
      visibleAuthIdentity,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
