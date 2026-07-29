import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { type AuthIdentity, useAuth } from "./AuthContext";
import {
  ACTIVITY_LEVELS,
  CALCULATION_SEX_OPTIONS,
  HEALTH_PROFILE_LIMITS,
  NUTRITION_GOALS,
  type HealthProfile,
} from "../types/healthProfile";

type HydrationState = "signed-out" | "loading" | "ready" | "error";
export type HealthOnboardingStatus =
  | "required"
  | "completed"
  | "skipped"
  | null;
type ResolvedOnboardingStatus = Exclude<HealthOnboardingStatus, null>;
type OwnedHealthState = {
  owner: AuthIdentity;
  profile: HealthProfile | null;
  onboardingStatus: ResolvedOnboardingStatus;
};
type OwnedOperation = { id: number; owner: AuthIdentity };
type StoredHealthProfile = { version: 1; profile: HealthProfile };
type StoredOnboarding = {
  version: 1;
  status: "completed" | "skipped";
};

type HealthProfileContextValue = {
  healthProfile: HealthProfile | null;
  onboardingStatus: HealthOnboardingStatus;
  hydrationState: HydrationState;
  hydrationError: string | null;
  isSaving: boolean;
  isDeleting: boolean;
  isOnboardingMutationPending: boolean;
  saveHealthProfile: (
    profile: HealthProfile,
    expectedOwner: AuthIdentity,
  ) => Promise<boolean>;
  completeHealthOnboarding: (
    expectedOwner: AuthIdentity,
  ) => Promise<boolean>;
  skipHealthOnboarding: (expectedOwner: AuthIdentity) => Promise<boolean>;
  deleteHealthProfile: (expectedOwner: AuthIdentity) => Promise<boolean>;
  retryHydration: () => void;
};

const PROFILE_KEY_PREFIX = "caloribite_health_profile:user:";
const ONBOARDING_KEY_PREFIX = "caloribite_health_onboarding:user:";
const STORAGE_VERSION = 1;
const STORAGE_ERROR =
  "Your health profile could not be loaded. Please try again.";
const writeQueues = new Map<string, Promise<void>>();

const HealthProfileContext = createContext<
  HealthProfileContextValue | undefined
>(undefined);

function identitiesMatch(
  first: AuthIdentity | null,
  second: AuthIdentity | null,
) {
  return (
    first !== null &&
    second !== null &&
    first.userId === second.userId &&
    first.generation === second.generation
  );
}

function operationsMatch(
  first: OwnedOperation | null,
  second: OwnedOperation,
) {
  return (
    first?.id === second.id &&
    identitiesMatch(first.owner, second.owner)
  );
}

function isHealthProfile(value: unknown): value is HealthProfile {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.age === "number" &&
    Number.isInteger(profile.age) &&
    profile.age >= HEALTH_PROFILE_LIMITS.age.min &&
    profile.age <= HEALTH_PROFILE_LIMITS.age.max &&
    typeof profile.heightCm === "number" &&
    Number.isFinite(profile.heightCm) &&
    profile.heightCm >= HEALTH_PROFILE_LIMITS.heightCm.min &&
    profile.heightCm <= HEALTH_PROFILE_LIMITS.heightCm.max &&
    typeof profile.weightKg === "number" &&
    Number.isFinite(profile.weightKg) &&
    profile.weightKg >= HEALTH_PROFILE_LIMITS.weightKg.min &&
    profile.weightKg <= HEALTH_PROFILE_LIMITS.weightKg.max &&
    CALCULATION_SEX_OPTIONS.some(
      ({ value: option }) => option === profile.calculationSex,
    ) &&
    ACTIVITY_LEVELS.some(
      ({ value: option }) => option === profile.activityLevel,
    ) &&
    NUTRITION_GOALS.some(({ value: option }) => option === profile.goal)
  );
}

function parseStoredProfile(value: string | null): HealthProfile | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Partial<StoredHealthProfile>;
    return record.version === STORAGE_VERSION && isHealthProfile(record.profile)
      ? record.profile
      : null;
  } catch {
    return null;
  }
}

function parseStoredOnboarding(
  value: string | null,
): StoredOnboarding["status"] | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Partial<StoredOnboarding>;
    return record.version === STORAGE_VERSION &&
      (record.status === "completed" || record.status === "skipped")
      ? record.status
      : null;
  } catch {
    return null;
  }
}

function enqueueWrite(storageKey: string, operation: () => Promise<void>) {
  const previous = writeQueues.get(storageKey) ?? Promise.resolve();
  const write = previous.catch(() => undefined).then(operation);
  writeQueues.set(storageKey, write);
  const clear = () => {
    if (writeQueues.get(storageKey) === write) writeQueues.delete(storageKey);
  };
  void write.then(clear, clear);
  return write;
}

async function waitForWrite(storageKey: string) {
  await writeQueues.get(storageKey)?.catch(() => undefined);
}

function storedOnboarding(status: StoredOnboarding["status"]) {
  return JSON.stringify({ version: STORAGE_VERSION, status } satisfies StoredOnboarding);
}

export function HealthProfileProvider({ children }: { children: ReactNode }) {
  const { authIdentity } = useAuth();
  const authIdentityRef = useRef(authIdentity);
  authIdentityRef.current = authIdentity;
  const [ownedState, setOwnedState] = useState<OwnedHealthState | null>(null);
  const ownedStateRef = useRef(ownedState);
  ownedStateRef.current = ownedState;
  const [failedOwner, setFailedOwner] = useState<AuthIdentity | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [, refreshOperationState] = useState(0);
  const readyIdentityRef = useRef<AuthIdentity | null>(null);
  const loadRef = useRef<symbol | null>(null);
  const saveRef = useRef<OwnedOperation | null>(null);
  const deleteRef = useRef<OwnedOperation | null>(null);
  const onboardingRef = useRef<OwnedOperation | null>(null);
  const operationCounterRef = useRef(0);

  const detachOwnerMismatch = (
    operationRef: { current: OwnedOperation | null },
  ) => {
    if (
      operationRef.current &&
      !identitiesMatch(operationRef.current.owner, authIdentity)
    ) {
      operationRef.current = null;
    }
  };
  detachOwnerMismatch(saveRef);
  detachOwnerMismatch(deleteRef);
  detachOwnerMismatch(onboardingRef);

  const createOperation = (owner: AuthIdentity): OwnedOperation => {
    operationCounterRef.current += 1;
    return { id: operationCounterRef.current, owner };
  };

  useEffect(() => {
    const loadId = Symbol("healthProfileLoad");
    loadRef.current = loadId;
    readyIdentityRef.current = null;
    setOwnedState(null);
    setFailedOwner(null);
    if (!authIdentity) return;

    const owner = authIdentity;
    const profileKey = `${PROFILE_KEY_PREFIX}${owner.userId}`;
    const onboardingKey = `${ONBOARDING_KEY_PREFIX}${owner.userId}`;
    const load = async () => {
      try {
        if (!identitiesMatch(authIdentityRef.current, owner)) return;
        await Promise.all([
          waitForWrite(profileKey),
          waitForWrite(onboardingKey),
        ]);
        if (
          loadRef.current !== loadId ||
          !identitiesMatch(authIdentityRef.current, owner)
        ) return;

        const [profileValue, onboardingValue] = await Promise.all([
          AsyncStorage.getItem(profileKey),
          AsyncStorage.getItem(onboardingKey),
        ]);
        if (
          loadRef.current !== loadId ||
          !identitiesMatch(authIdentityRef.current, owner)
        ) return;

        const profile = parseStoredProfile(profileValue);
        let onboardingStatus = parseStoredOnboarding(onboardingValue);
        if (!onboardingStatus && profile) {
          setOwnedState({
            owner,
            profile,
            onboardingStatus: "completed",
          });
          await enqueueWrite(onboardingKey, () =>
            AsyncStorage.setItem(
              onboardingKey,
              storedOnboarding("completed"),
            ),
          );
          if (
            loadRef.current !== loadId ||
            !identitiesMatch(authIdentityRef.current, owner)
          ) return;
          onboardingStatus = "completed";
        }

        readyIdentityRef.current = owner;
        setOwnedState({
          owner,
          profile,
          onboardingStatus: onboardingStatus ?? "required",
        });
      } catch {
        if (
          loadRef.current === loadId &&
          identitiesMatch(authIdentityRef.current, owner)
        ) {
          readyIdentityRef.current = null;
          setFailedOwner(owner);
        }
      }
    };
    void load();
    return () => {
      if (loadRef.current === loadId) loadRef.current = null;
    };
  }, [authIdentity, retryCount]);

  const ownsState = identitiesMatch(ownedState?.owner ?? null, authIdentity);
  const hydrationState: HydrationState =
    authIdentity === null
      ? "signed-out"
      : identitiesMatch(failedOwner, authIdentity)
        ? "error"
        : ownsState && identitiesMatch(readyIdentityRef.current, authIdentity)
          ? "ready"
          : "loading";
  const activeSave = saveRef.current;
  const activeDelete = deleteRef.current;
  const activeOnboarding = onboardingRef.current;

  const canMutate = (expectedOwner: AuthIdentity) =>
    identitiesMatch(authIdentityRef.current, expectedOwner) &&
    identitiesMatch(readyIdentityRef.current, expectedOwner) &&
    !identitiesMatch(saveRef.current?.owner ?? null, expectedOwner) &&
    !identitiesMatch(deleteRef.current?.owner ?? null, expectedOwner) &&
    !identitiesMatch(onboardingRef.current?.owner ?? null, expectedOwner);

  const saveHealthProfile = useCallback(async (
    profile: HealthProfile,
    expectedOwner: AuthIdentity,
  ) => {
    if (!canMutate(expectedOwner) || !isHealthProfile(profile)) return false;

    const operation = createOperation(expectedOwner);
    const profileKey = `${PROFILE_KEY_PREFIX}${expectedOwner.userId}`;
    const onboardingKey = `${ONBOARDING_KEY_PREFIX}${expectedOwner.userId}`;
    const stored: StoredHealthProfile = { version: STORAGE_VERSION, profile };
    saveRef.current = operation;
    refreshOperationState((value) => value + 1);
    try {
      if (!identitiesMatch(authIdentityRef.current, expectedOwner)) return false;
      await enqueueWrite(profileKey, () =>
        AsyncStorage.setItem(profileKey, JSON.stringify(stored)),
      );
      if (
        !operationsMatch(saveRef.current, operation) ||
        !identitiesMatch(authIdentityRef.current, expectedOwner)
      ) return false;
      setOwnedState((current) =>
        identitiesMatch(current?.owner ?? null, expectedOwner)
          ? { ...current!, profile }
          : current,
      );
      await enqueueWrite(onboardingKey, () =>
        AsyncStorage.setItem(onboardingKey, storedOnboarding("completed")),
      );
      if (
        !operationsMatch(saveRef.current, operation) ||
        !identitiesMatch(authIdentityRef.current, expectedOwner)
      ) return false;
      setOwnedState({
        owner: expectedOwner,
        profile,
        onboardingStatus: "completed",
      });
      setFailedOwner(null);
      return true;
    } catch {
      return false;
    } finally {
      if (operationsMatch(saveRef.current, operation)) {
        saveRef.current = null;
        if (identitiesMatch(authIdentityRef.current, expectedOwner)) {
          refreshOperationState((value) => value + 1);
        }
      }
    }
  }, []);

  const persistOnboarding = useCallback(async (
    status: StoredOnboarding["status"],
    expectedOwner: AuthIdentity,
  ) => {
    if (!canMutate(expectedOwner)) return false;
    const operation = createOperation(expectedOwner);
    const onboardingKey = `${ONBOARDING_KEY_PREFIX}${expectedOwner.userId}`;
    onboardingRef.current = operation;
    refreshOperationState((value) => value + 1);
    try {
      if (!identitiesMatch(authIdentityRef.current, expectedOwner)) return false;
      await enqueueWrite(onboardingKey, () =>
        AsyncStorage.setItem(onboardingKey, storedOnboarding(status)),
      );
      if (
        !operationsMatch(onboardingRef.current, operation) ||
        !identitiesMatch(authIdentityRef.current, expectedOwner)
      ) return false;
      setOwnedState((current) =>
        identitiesMatch(current?.owner ?? null, expectedOwner)
          ? { ...current!, onboardingStatus: status }
          : current,
      );
      setFailedOwner(null);
      return true;
    } catch {
      return false;
    } finally {
      if (operationsMatch(onboardingRef.current, operation)) {
        onboardingRef.current = null;
        if (identitiesMatch(authIdentityRef.current, expectedOwner)) {
          refreshOperationState((value) => value + 1);
        }
      }
    }
  }, []);

  const completeHealthOnboarding = useCallback(
    (expectedOwner: AuthIdentity) => {
      const current = ownedStateRef.current;
      if (
        !identitiesMatch(current?.owner ?? null, expectedOwner) ||
        !current?.profile
      ) return Promise.resolve(false);
      return persistOnboarding("completed", expectedOwner);
    },
    [persistOnboarding],
  );
  const skipHealthOnboarding = useCallback(
    (expectedOwner: AuthIdentity) =>
      persistOnboarding("skipped", expectedOwner),
    [persistOnboarding],
  );

  const deleteHealthProfile = useCallback(async (
    expectedOwner: AuthIdentity,
  ) => {
    if (!canMutate(expectedOwner)) return false;

    const operation = createOperation(expectedOwner);
    const profileKey = `${PROFILE_KEY_PREFIX}${expectedOwner.userId}`;
    deleteRef.current = operation;
    refreshOperationState((value) => value + 1);
    try {
      if (!identitiesMatch(authIdentityRef.current, expectedOwner)) return false;
      await enqueueWrite(profileKey, () => AsyncStorage.removeItem(profileKey));
      if (
        !operationsMatch(deleteRef.current, operation) ||
        !identitiesMatch(authIdentityRef.current, expectedOwner)
      ) return false;
      setOwnedState((current) =>
        identitiesMatch(current?.owner ?? null, expectedOwner)
          ? { ...current!, profile: null }
          : current,
      );
      setFailedOwner(null);
      return true;
    } catch {
      return false;
    } finally {
      if (operationsMatch(deleteRef.current, operation)) {
        deleteRef.current = null;
        if (identitiesMatch(authIdentityRef.current, expectedOwner)) {
          refreshOperationState((value) => value + 1);
        }
      }
    }
  }, []);

  const retryHydration = useCallback(() => {
    if (identitiesMatch(failedOwner, authIdentityRef.current)) {
      setRetryCount((value) => value + 1);
    }
  }, [failedOwner]);

  return (
    <HealthProfileContext.Provider
      value={{
        healthProfile: ownsState ? ownedState!.profile : null,
        onboardingStatus:
          hydrationState === "ready" && ownsState
            ? ownedState!.onboardingStatus
            : null,
        hydrationState,
        hydrationError: hydrationState === "error" ? STORAGE_ERROR : null,
        isSaving:
          activeSave !== null &&
          identitiesMatch(activeSave.owner, authIdentity),
        isDeleting:
          activeDelete !== null &&
          identitiesMatch(activeDelete.owner, authIdentity),
        isOnboardingMutationPending:
          activeOnboarding !== null &&
          identitiesMatch(activeOnboarding.owner, authIdentity),
        saveHealthProfile,
        completeHealthOnboarding,
        skipHealthOnboarding,
        deleteHealthProfile,
        retryHydration,
      }}
    >
      {children}
    </HealthProfileContext.Provider>
  );
}

export function useHealthProfile() {
  const context = useContext(HealthProfileContext);
  if (!context) {
    throw new Error("useHealthProfile must be used inside HealthProfileProvider");
  }
  return context;
}
