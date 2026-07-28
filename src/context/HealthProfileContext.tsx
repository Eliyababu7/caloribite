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
type OwnedProfile = { owner: AuthIdentity; profile: HealthProfile | null };
type OwnedOperation = { id: symbol; owner: AuthIdentity };
type StoredHealthProfile = { version: 1; profile: HealthProfile };

type HealthProfileContextValue = {
  healthProfile: HealthProfile | null;
  hydrationState: HydrationState;
  hydrationError: string | null;
  isSaving: boolean;
  isDeleting: boolean;
  saveHealthProfile: (
    profile: HealthProfile,
    expectedOwner: AuthIdentity,
  ) => Promise<boolean>;
  deleteHealthProfile: (expectedOwner: AuthIdentity) => Promise<boolean>;
  retryHydration: () => void;
};

const STORAGE_KEY_PREFIX = "caloribite_health_profile:user:";
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

function parseStoredProfile(value: string): HealthProfile | null {
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

export function HealthProfileProvider({ children }: { children: ReactNode }) {
  const { authIdentity } = useAuth();
  const authIdentityRef = useRef(authIdentity);
  authIdentityRef.current = authIdentity;
  const [ownedProfile, setOwnedProfile] = useState<OwnedProfile | null>(null);
  const [failedOwner, setFailedOwner] = useState<AuthIdentity | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [, refreshOperationState] = useState(0);
  const readyIdentityRef = useRef<AuthIdentity | null>(null);
  const loadRef = useRef<symbol | null>(null);
  const saveRef = useRef<OwnedOperation | null>(null);
  const deleteRef = useRef<OwnedOperation | null>(null);

  useEffect(() => {
    const loadId = Symbol("healthProfileLoad");
    loadRef.current = loadId;
    readyIdentityRef.current = null;
    setOwnedProfile(null);
    setFailedOwner(null);
    if (!authIdentity) return;

    const owner = authIdentity;
    const storageKey = `${STORAGE_KEY_PREFIX}${owner.userId}`;
    const load = async () => {
      try {
        if (!identitiesMatch(authIdentityRef.current, owner)) return;
        await waitForWrite(storageKey);
        if (
          loadRef.current !== loadId ||
          !identitiesMatch(authIdentityRef.current, owner)
        ) return;
        const stored = await AsyncStorage.getItem(storageKey);
        if (
          loadRef.current === loadId &&
          identitiesMatch(authIdentityRef.current, owner)
        ) {
          readyIdentityRef.current = owner;
          setOwnedProfile({
            owner,
            profile: stored === null ? null : parseStoredProfile(stored),
          });
        }
      } catch {
        if (
          loadRef.current === loadId &&
          identitiesMatch(authIdentityRef.current, owner)
        ) {
          setFailedOwner(owner);
        }
      }
    };
    void load();
    return () => {
      if (loadRef.current === loadId) loadRef.current = null;
    };
  }, [authIdentity, retryCount]);

  const ownsProfile = identitiesMatch(ownedProfile?.owner ?? null, authIdentity);
  const hydrationState: HydrationState =
    authIdentity === null
      ? "signed-out"
      : identitiesMatch(failedOwner, authIdentity)
        ? "error"
        : ownsProfile
          ? "ready"
          : "loading";
  const activeSave = saveRef.current;
  const activeDelete = deleteRef.current;

  const saveHealthProfile = useCallback(async (
    profile: HealthProfile,
    expectedOwner: AuthIdentity,
  ) => {
    if (
      !identitiesMatch(authIdentityRef.current, expectedOwner) ||
      !identitiesMatch(readyIdentityRef.current, expectedOwner) ||
      !isHealthProfile(profile) ||
      saveRef.current !== null ||
      deleteRef.current !== null
    ) return false;

    const operation = { id: Symbol("healthProfileSave"), owner: expectedOwner };
    const storageKey = `${STORAGE_KEY_PREFIX}${expectedOwner.userId}`;
    const stored: StoredHealthProfile = { version: STORAGE_VERSION, profile };
    saveRef.current = operation;
    refreshOperationState((value) => value + 1);
    try {
      if (!identitiesMatch(authIdentityRef.current, expectedOwner)) return false;
      await enqueueWrite(storageKey, () =>
        AsyncStorage.setItem(storageKey, JSON.stringify(stored)),
      );
      if (
        saveRef.current?.id !== operation.id ||
        !identitiesMatch(authIdentityRef.current, expectedOwner)
      ) return false;
      setOwnedProfile({ owner: expectedOwner, profile });
      setFailedOwner(null);
      return true;
    } catch {
      return false;
    } finally {
      if (saveRef.current?.id === operation.id) {
        saveRef.current = null;
        if (identitiesMatch(authIdentityRef.current, expectedOwner)) {
          refreshOperationState((value) => value + 1);
        }
      }
    }
  }, []);

  const deleteHealthProfile = useCallback(async (
    expectedOwner: AuthIdentity,
  ) => {
    if (
      !identitiesMatch(authIdentityRef.current, expectedOwner) ||
      !identitiesMatch(readyIdentityRef.current, expectedOwner) ||
      saveRef.current !== null ||
      deleteRef.current !== null
    ) return false;

    const operation = { id: Symbol("healthProfileDelete"), owner: expectedOwner };
    const storageKey = `${STORAGE_KEY_PREFIX}${expectedOwner.userId}`;
    deleteRef.current = operation;
    refreshOperationState((value) => value + 1);
    try {
      if (!identitiesMatch(authIdentityRef.current, expectedOwner)) return false;
      await enqueueWrite(storageKey, () => AsyncStorage.removeItem(storageKey));
      if (
        deleteRef.current?.id !== operation.id ||
        !identitiesMatch(authIdentityRef.current, expectedOwner)
      ) return false;
      setOwnedProfile({ owner: expectedOwner, profile: null });
      setFailedOwner(null);
      return true;
    } catch {
      return false;
    } finally {
      if (deleteRef.current?.id === operation.id) {
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
        healthProfile: ownsProfile ? ownedProfile!.profile : null,
        hydrationState,
        hydrationError: hydrationState === "error" ? STORAGE_ERROR : null,
        isSaving:
          activeSave !== null &&
          identitiesMatch(activeSave.owner, authIdentity),
        isDeleting:
          activeDelete !== null &&
          identitiesMatch(activeDelete.owner, authIdentity),
        saveHealthProfile,
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
