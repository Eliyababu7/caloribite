import type {
  AuthResponse,
  AuthTokenResponsePassword,
  Session,
  User,
} from "@supabase/supabase-js";
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

import { supabase } from "../services/supabase/supabaseClient";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authIdentity, setAuthIdentity] = useState<AuthIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const authIdentityRef = useRef<AuthIdentity | null>(null);
  const authGenerationRef = useRef(0);
  const signOutOperationRef = useRef<SignOutOperation | null>(null);

  useEffect(() => {
    let isMounted = true;

    const publishSession = (nextSession: Session | null) => {
      const previousUserId = sessionRef.current?.user.id ?? null;
      const nextUserId = nextSession?.user.id ?? null;

      if (previousUserId !== nextUserId) {
        authGenerationRef.current += 1;

        const nextIdentity = nextUserId
          ? {
              userId: nextUserId,
              generation: authGenerationRef.current,
            }
          : null;

        authIdentityRef.current = nextIdentity;
        signOutOperationRef.current = null;
        setAuthIdentity(nextIdentity);
        setIsSigningOut(false);
      }

      sessionRef.current = nextSession;
      setSession(nextSession);
    };

    const restoreSession = async () => {
      try {
        const {
          data: { session: restoredSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (isMounted) {
          publishSession(restoredSession);
        }
      } catch (error) {
        console.error("Failed to restore Supabase session:", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isMounted) {
        publishSession(nextSession);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    const updateAutoRefresh = (state: string) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };

    updateAutoRefresh(AppState.currentState);

    const subscription = AppState.addEventListener(
      "change",
      updateAutoRefresh,
    );

    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  const signIn = useCallback((email: string, password: string) => {
    return supabase.auth.signInWithPassword({
      email,
      password,
    });
  }, []);

  const signUp = useCallback(
    (fullName: string, email: string, password: string) => {
      return supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });
    },
    [],
  );

  const signOut = useCallback(async () => {
    const owner = authIdentityRef.current;

    if (!sessionRef.current || !owner || signOutOperationRef.current) {
      return false;
    }

    const operation: SignOutOperation = {
      id: Symbol("signOut"),
      owner,
    };
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
        activeOperation.owner.userId === operation.owner.userId &&
        activeOperation.owner.generation === operation.owner.generation &&
        currentIdentity?.userId === operation.owner.userId &&
        currentIdentity.generation === operation.owner.generation
      ) {
        signOutOperationRef.current = null;
        setIsSigningOut(false);
      }
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user: session?.user ?? null,
      authIdentity,
      isLoading,
      isSigningOut,
      signIn,
      signUp,
      signOut,
    }),
    [
      authIdentity,
      isLoading,
      isSigningOut,
      session,
      signIn,
      signOut,
      signUp,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
