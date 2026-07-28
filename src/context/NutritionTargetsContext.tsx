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
  DEFAULT_NUTRITION_TARGETS,
  NUTRITION_TARGET_LIMITS,
  type NutritionTargets,
} from "../types/nutrition";

type NutritionTargetsHydrationState =
  | "signed-out"
  | "loading"
  | "ready"
  | "error";

type OwnedTargets = {
  owner: AuthIdentity;
  targets: NutritionTargets;
};

type SaveOperation = {
  id: symbol;
  owner: AuthIdentity;
};

type StoredNutritionTargets = {
  version: 1;
  targets: NutritionTargets;
};

type NutritionTargetsContextType = {
  nutritionTargets: NutritionTargets | null;
  hydrationState: NutritionTargetsHydrationState;
  hydrationError: string | null;
  isSaving: boolean;
  saveTargets: (
    targets: NutritionTargets,
    expectedOwner: AuthIdentity,
  ) => Promise<boolean>;
  retryHydration: () => void;
};

const STORAGE_KEY_PREFIX = "caloribite_nutrition_targets:user:";
const STORAGE_VERSION = 1;
const HYDRATION_ERROR_MESSAGE =
  "Your nutrition targets could not be loaded. Please try again.";

const storageWriteQueues = new Map<string, Promise<void>>();

const NutritionTargetsContext = createContext<
  NutritionTargetsContextType | undefined
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

function isValidTargetValue(
  value: unknown,
  limits: Readonly<{ min: number; max: number }>,
) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= limits.min &&
    value <= limits.max
  );
}

function isNutritionTargets(value: unknown): value is NutritionTargets {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const targets = value as Record<string, unknown>;

  return (
    isValidTargetValue(targets.calories, NUTRITION_TARGET_LIMITS.calories) &&
    isValidTargetValue(targets.protein, NUTRITION_TARGET_LIMITS.protein) &&
    isValidTargetValue(targets.carbs, NUTRITION_TARGET_LIMITS.carbs) &&
    isValidTargetValue(targets.fat, NUTRITION_TARGET_LIMITS.fat)
  );
}

function parseStoredTargets(savedTargets: string): NutritionTargets {
  try {
    const parsed: unknown = JSON.parse(savedTargets);

    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_NUTRITION_TARGETS };
    }

    const record = parsed as Partial<StoredNutritionTargets>;

    return record.version === STORAGE_VERSION &&
      isNutritionTargets(record.targets)
      ? record.targets
      : { ...DEFAULT_NUTRITION_TARGETS };
  } catch {
    return { ...DEFAULT_NUTRITION_TARGETS };
  }
}

function enqueueStorageWrite(
  storageKey: string,
  targets: NutritionTargets,
) {
  const previousWrite = storageWriteQueues.get(storageKey) ?? Promise.resolve();
  const storedValue: StoredNutritionTargets = {
    version: STORAGE_VERSION,
    targets,
  };
  const write = previousWrite
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(storageKey, JSON.stringify(storedValue)));

  storageWriteQueues.set(storageKey, write);

  const removeCompletedWrite = () => {
    if (storageWriteQueues.get(storageKey) === write) {
      storageWriteQueues.delete(storageKey);
    }
  };

  void write.then(removeCompletedWrite, removeCompletedWrite);
  return write;
}

async function waitForQueuedStorageWrite(storageKey: string) {
  const queuedWrite = storageWriteQueues.get(storageKey);

  if (queuedWrite) {
    await queuedWrite.catch(() => undefined);
  }
}

export function NutritionTargetsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { authIdentity } = useAuth();
  const authIdentityRef = useRef(authIdentity);
  authIdentityRef.current = authIdentity;

  const [ownedTargets, setOwnedTargets] = useState<OwnedTargets | null>(null);
  const [failedOwner, setFailedOwner] = useState<AuthIdentity | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [, setSaveStateVersion] = useState(0);
  const loadOperationRef = useRef<symbol | null>(null);
  const saveOperationRef = useRef<SaveOperation | null>(null);
  const readyIdentityRef = useRef<AuthIdentity | null>(null);

  useEffect(() => {
    const loadId = Symbol("nutritionTargetsLoad");
    loadOperationRef.current = loadId;
    readyIdentityRef.current = null;
    setOwnedTargets(null);
    setFailedOwner(null);

    if (authIdentity === null) {
      return;
    }

    const owner = authIdentity;
    const storageKey = `${STORAGE_KEY_PREFIX}${owner.userId}`;

    const loadTargets = async () => {
      try {
        await waitForQueuedStorageWrite(storageKey);
        const savedTargets = await AsyncStorage.getItem(storageKey);
        const targets =
          savedTargets === null
            ? { ...DEFAULT_NUTRITION_TARGETS }
            : parseStoredTargets(savedTargets);

        if (
          loadOperationRef.current === loadId &&
          identitiesMatch(authIdentityRef.current, owner)
        ) {
          readyIdentityRef.current = owner;
          setOwnedTargets({ owner, targets });
        }
      } catch {
        if (
          loadOperationRef.current === loadId &&
          identitiesMatch(authIdentityRef.current, owner)
        ) {
          readyIdentityRef.current = null;
          setFailedOwner(owner);
        }
      }
    };

    void loadTargets();

    return () => {
      if (loadOperationRef.current === loadId) {
        loadOperationRef.current = null;
      }
    };
  }, [authIdentity, retryCount]);

  const targetsBelongToCurrentIdentity = identitiesMatch(
    ownedTargets?.owner ?? null,
    authIdentity,
  );
  const nutritionTargets = targetsBelongToCurrentIdentity
    ? ownedTargets!.targets
    : null;

  const hydrationState: NutritionTargetsHydrationState =
    authIdentity === null
      ? "signed-out"
      : identitiesMatch(failedOwner, authIdentity)
        ? "error"
        : targetsBelongToCurrentIdentity
          ? "ready"
          : "loading";

  const hydrationError =
    hydrationState === "error" ? HYDRATION_ERROR_MESSAGE : null;

  const activeSave = saveOperationRef.current;
  const isSaving =
    activeSave !== null && identitiesMatch(activeSave.owner, authIdentity);

  const retryHydration = useCallback(() => {
    if (
      authIdentityRef.current !== null &&
      identitiesMatch(failedOwner, authIdentityRef.current)
    ) {
      setRetryCount((count) => count + 1);
    }
  }, [failedOwner]);

  const saveTargets = useCallback(async (
    targets: NutritionTargets,
    expectedOwner: AuthIdentity,
  ) => {
    const activeIdentity = authIdentityRef.current;
    const currentSave = saveOperationRef.current;

    if (
      !identitiesMatch(activeIdentity, expectedOwner) ||
      !identitiesMatch(readyIdentityRef.current, expectedOwner) ||
      !isNutritionTargets(targets) ||
      (currentSave !== null &&
        identitiesMatch(currentSave.owner, expectedOwner))
    ) {
      return false;
    }

    const operation: SaveOperation = {
      id: Symbol("nutritionTargetsSave"),
      owner: expectedOwner,
    };
    const storageKey = `${STORAGE_KEY_PREFIX}${expectedOwner.userId}`;
    saveOperationRef.current = operation;
    setSaveStateVersion((version) => version + 1);

    try {
      await enqueueStorageWrite(storageKey, targets);

      if (
        saveOperationRef.current?.id !== operation.id ||
        !identitiesMatch(authIdentityRef.current, expectedOwner)
      ) {
        return false;
      }

      setOwnedTargets({ owner: expectedOwner, targets });
      setFailedOwner(null);
      return true;
    } catch {
      return false;
    } finally {
      if (saveOperationRef.current?.id === operation.id) {
        saveOperationRef.current = null;

        if (identitiesMatch(authIdentityRef.current, expectedOwner)) {
          setSaveStateVersion((version) => version + 1);
        }
      }
    }
  }, []);

  return (
    <NutritionTargetsContext.Provider
      value={{
        nutritionTargets,
        hydrationState,
        hydrationError,
        isSaving,
        saveTargets,
        retryHydration,
      }}
    >
      {children}
    </NutritionTargetsContext.Provider>
  );
}

export function useNutritionTargets() {
  const context = useContext(NutritionTargetsContext);

  if (!context) {
    throw new Error(
      "useNutritionTargets must be used inside NutritionTargetsProvider",
    );
  }

  return context;
}
