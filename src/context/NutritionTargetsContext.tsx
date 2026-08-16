import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
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
  createPendingStoredTargets,
  createStoredTargets,
  parseStoredTargets,
  synchronizeNutritionTargets,
  type StoredNutritionTargets,
} from "../services/nutrition/nutritionTargetsSync";
import {
  areValidNutritionTargets,
  createNutritionTargetsRepository,
  type NutritionTargetsRepository,
} from "../services/supabase/nutritionTargetsRepository";
import {
  DEFAULT_NUTRITION_TARGETS,
  type NutritionTargets,
} from "../types/nutrition";

type NutritionTargetsHydrationState =
  | "signed-out"
  | "loading"
  | "ready"
  | "error";

type OwnedTargets = {
  owner: AuthIdentity;
  stored: StoredNutritionTargets;
};

type SaveOperation = {
  id: symbol;
  owner: AuthIdentity;
};

type ReplayOperation = {
  id: symbol;
  owner: AuthIdentity;
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

function enqueueStorageWrite(
  storageKey: string,
  stored: StoredNutritionTargets,
) {
  const previousWrite = storageWriteQueues.get(storageKey) ?? Promise.resolve();
  const write = previousWrite
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(storageKey, JSON.stringify(stored)));

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
  if (queuedWrite) await queuedWrite.catch(() => undefined);
}

export function NutritionTargetsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { authIdentity, session } = useAuth();
  const authIdentityRef = useRef(authIdentity);
  authIdentityRef.current = authIdentity;

  const [ownedTargets, setOwnedTargets] = useState<OwnedTargets | null>(null);
  const [failedOwner, setFailedOwner] = useState<AuthIdentity | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [, setSaveStateVersion] = useState(0);
  const loadOperationRef = useRef<symbol | null>(null);
  const hydrationInFlightRef = useRef<symbol | null>(null);
  const saveOperationRef = useRef<SaveOperation | null>(null);
  const replayOperationRef = useRef<ReplayOperation | null>(null);
  const replayRequestedRef = useRef(false);
  const reconnectReplayRef = useRef<() => Promise<void>>(async () => undefined);
  const networkReachabilityRef = useRef<
    "unknown" | "unreachable" | "reachable"
  >("unknown");
  const readyIdentityRef = useRef<AuthIdentity | null>(null);
  const storedTargetsRef = useRef<StoredNutritionTargets | null>(null);
  const repositoryRef = useRef<{
    owner: AuthIdentity;
    repository: NutritionTargetsRepository;
  } | null>(null);

  const runDeferredReplay = () => {
    if (replayRequestedRef.current) {
      void reconnectReplayRef.current();
    }
  };

  reconnectReplayRef.current = async () => {
    const owner = authIdentityRef.current;
    const stored = storedTargetsRef.current;
    const ownedRepository = repositoryRef.current;

    if (
      owner === null ||
      stored === null ||
      stored.pendingMutation === null ||
      !identitiesMatch(readyIdentityRef.current, owner) ||
      !identitiesMatch(ownedRepository?.owner ?? null, owner)
    ) {
      replayRequestedRef.current = false;
      return;
    }

    if (
      hydrationInFlightRef.current !== null ||
      identitiesMatch(saveOperationRef.current?.owner ?? null, owner) ||
      identitiesMatch(replayOperationRef.current?.owner ?? null, owner)
    ) {
      return;
    }

    const operation: ReplayOperation = {
      id: Symbol("nutritionTargetsReconnectReplay"),
      owner,
    };
    const storageKey = `${STORAGE_KEY_PREFIX}${owner.userId}`;
    const isOwnerCurrent = () =>
      replayOperationRef.current?.id === operation.id &&
      identitiesMatch(authIdentityRef.current, owner) &&
      identitiesMatch(readyIdentityRef.current, owner) &&
      identitiesMatch(repositoryRef.current?.owner ?? null, owner);
    const persist = (nextStored: StoredNutritionTargets) =>
      enqueueStorageWrite(storageKey, nextStored);

    replayRequestedRef.current = false;
    replayOperationRef.current = operation;
    setSaveStateVersion((version) => version + 1);

    try {
      const result = await synchronizeNutritionTargets(
        ownedRepository!.repository,
        stored,
        isOwnerCurrent,
        persist,
      );
      if (!isOwnerCurrent() || result.status === "stale") return;

      storedTargetsRef.current = result.stored;
      setOwnedTargets({ owner, stored: result.stored });
      if (result.status === "failure") {
        setFailedOwner(owner);
      } else if (result.status === "synced") {
        setFailedOwner(null);
      }
    } catch {
      // The durable pending mutation remains available for a later transition.
    } finally {
      if (replayOperationRef.current?.id === operation.id) {
        replayOperationRef.current = null;
        if (identitiesMatch(authIdentityRef.current, owner)) {
          setSaveStateVersion((version) => version + 1);
        }
      }
    }
  };

  useEffect(() => {
    let subscription: ReturnType<typeof Network.addNetworkStateListener> | null =
      null;

    try {
      subscription = Network.addNetworkStateListener((state) => {
        const previousReachability = networkReachabilityRef.current;
        const isReachable =
          state.isConnected === true && state.isInternetReachable !== false;
        const isUnreachable =
          state.isConnected === false || state.isInternetReachable === false;

        if (isReachable) {
          networkReachabilityRef.current = "reachable";
          if (previousReachability === "unreachable") {
            replayRequestedRef.current = true;
            void reconnectReplayRef.current();
          }
        } else if (isUnreachable) {
          networkReachabilityRef.current = "unreachable";
        }
      });
    } catch {
      subscription = null;
    }

    return () => {
      try {
        subscription?.remove();
      } catch {
        // Listener cleanup failures must not affect retained target state.
      }
    };
  }, []);

  useEffect(() => {
    const loadId = Symbol("nutritionTargetsLoad");
    loadOperationRef.current = loadId;
    hydrationInFlightRef.current = loadId;
    replayOperationRef.current = null;
    replayRequestedRef.current = false;
    readyIdentityRef.current = null;
    storedTargetsRef.current = null;
    repositoryRef.current = null;
    setOwnedTargets(null);
    setFailedOwner(null);

    if (authIdentity === null || session === null) {
      hydrationInFlightRef.current = null;
      return;
    }
    const owner = authIdentity;
    const repository = createNutritionTargetsRepository(session.access_token);
    const storageKey = `${STORAGE_KEY_PREFIX}${owner.userId}`;
    const isOwnerCurrent = () =>
      loadOperationRef.current === loadId &&
      identitiesMatch(authIdentityRef.current, owner);
    const persist = (stored: StoredNutritionTargets) =>
      enqueueStorageWrite(storageKey, stored);

    const publishReady = (stored: StoredNutritionTargets) => {
      if (!isOwnerCurrent()) return;
      readyIdentityRef.current = owner;
      storedTargetsRef.current = stored;
      repositoryRef.current = { owner, repository };
      setOwnedTargets({ owner, stored });
    };

    const loadTargets = async () => {
      try {
        await waitForQueuedStorageWrite(storageKey);
        const savedTargets = await AsyncStorage.getItem(storageKey);
        let stored = createStoredTargets();

        if (savedTargets !== null) {
          try {
            stored = parseStoredTargets(savedTargets);
          } catch {
            stored = createStoredTargets();
          }
        }

        publishReady(stored);
        const result = await synchronizeNutritionTargets(
          repository,
          stored,
          isOwnerCurrent,
          persist,
        );
        if (!isOwnerCurrent() || result.status === "stale") return;

        publishReady(result.stored);
        if (result.status === "failure") {
          setFailedOwner(owner);
        } else {
          setFailedOwner(null);
        }
      } catch {
        if (isOwnerCurrent()) {
          readyIdentityRef.current = null;
          storedTargetsRef.current = null;
          setOwnedTargets(null);
          setFailedOwner(owner);
        }
      } finally {
        if (hydrationInFlightRef.current === loadId) {
          hydrationInFlightRef.current = null;
          runDeferredReplay();
        }
      }
    };

    void loadTargets();
    return () => {
      if (loadOperationRef.current === loadId) {
        loadOperationRef.current = null;
      }
    };
  }, [authIdentity, retryCount, session]);

  const targetsBelongToCurrentIdentity = identitiesMatch(
    ownedTargets?.owner ?? null,
    authIdentity,
  );
  const nutritionTargets =
    authIdentity === null
      ? { ...DEFAULT_NUTRITION_TARGETS }
      : targetsBelongToCurrentIdentity
        ? ownedTargets!.stored.targets
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
  const activeReplay = replayOperationRef.current;
  const isSaving =
    (activeSave !== null && identitiesMatch(activeSave.owner, authIdentity)) ||
    (activeReplay !== null && identitiesMatch(activeReplay.owner, authIdentity));

  const retryHydration = useCallback(() => {
    if (
      authIdentityRef.current !== null &&
      identitiesMatch(failedOwner, authIdentityRef.current)
    ) {
      setRetryCount((count) => count + 1);
    }
  }, [failedOwner]);

  const saveTargets = useCallback(
    async (targets: NutritionTargets, expectedOwner: AuthIdentity) => {
      const currentSave = saveOperationRef.current;
      const currentReplay = replayOperationRef.current;
      const currentStored = storedTargetsRef.current;
      const ownedRepository = repositoryRef.current;
      if (
        !identitiesMatch(authIdentityRef.current, expectedOwner) ||
        !identitiesMatch(readyIdentityRef.current, expectedOwner) ||
        !areValidNutritionTargets(targets) ||
        currentStored === null ||
        !identitiesMatch(ownedRepository?.owner ?? null, expectedOwner) ||
        (currentReplay !== null &&
          identitiesMatch(currentReplay.owner, expectedOwner)) ||
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
      const pendingStored = createPendingStoredTargets(currentStored, targets);
      const isOwnerCurrent = () =>
        saveOperationRef.current?.id === operation.id &&
        identitiesMatch(authIdentityRef.current, expectedOwner);
      const persist = (stored: StoredNutritionTargets) =>
        enqueueStorageWrite(storageKey, stored);

      loadOperationRef.current = null;
      saveOperationRef.current = operation;
      setSaveStateVersion((version) => version + 1);

      try {
        await persist(pendingStored);
        if (!isOwnerCurrent()) return false;

        storedTargetsRef.current = pendingStored;
        setOwnedTargets({ owner: expectedOwner, stored: pendingStored });
        const result = await synchronizeNutritionTargets(
          ownedRepository!.repository,
          pendingStored,
          isOwnerCurrent,
          persist,
        );
        if (!isOwnerCurrent() || result.status === "stale") return false;

        storedTargetsRef.current = result.stored;
        setOwnedTargets({ owner: expectedOwner, stored: result.stored });
        if (result.status === "failure") {
          setFailedOwner(expectedOwner);
          return false;
        }

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
        runDeferredReplay();
      }
    },
    [],
  );

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
