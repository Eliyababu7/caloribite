import { randomUUID } from "expo-crypto";
import { foodLogStorage } from "../services/foodLogs/localFoodLogStorage";
import { visibleFoodLogs, type FoodLogEnvelope } from "../services/foodLogs/foodLogStorage";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAuth } from "./AuthContext";
import type { FoodLog, NewFoodLog } from "../types/food";
import {
  getLocalDateKey,
  parseLocalDateKey,
} from "../utils/date";

export type { FoodLog, MealType } from "../types/food";

type FoodLogContextType = {
  foodLogs: FoodLog[];
  foodStorageHydrationState: FoodStorageHydrationState;
  foodStorageError: string | null;
  isFoodLogMutationPending: boolean;
  retryFoodStorageHydration: () => void;
  addFoodLog: (foodLog: NewFoodLog, loggedDate?: string) => Promise<boolean>;
  deleteFoodLog: (id: string) => Promise<boolean>;
  clearFoodLogsForDate: (loggedDate: string) => Promise<boolean>;
};

export type FoodStorageHydrationState =
  | "signed-out"
  | "loading"
  | "ready"
  | "error";

const FOOD_STORAGE_ERROR_MESSAGE = "Your food logs could not be loaded. Please try again.";
const FoodLogContext = createContext<FoodLogContextType | undefined>(undefined);

export function FoodLogProvider({ children }: { children: ReactNode }) {
  const { authIdentity } = useAuth();
  const userId = authIdentity?.userId ?? null;
  const currentIdentity = useRef(authIdentity);
  currentIdentity.current = authIdentity;
  const [storedFoodLogs, setStoredFoodLogs] = useState<FoodLog[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [failedUserId, setFailedUserId] = useState<string | null>(null);
  const [, setMutationStateVersion] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const loadGeneration = useRef(0);
  const currentUserId = useRef<string | null>(userId);
  const readyIdentity = useRef(authIdentity);
  const readyUserId = useRef<string | null>(null);
  const currentFoodLogs = useRef<FoodLog[]>([]);
  const activeMutations = useRef(new Map<string, symbol>());

  currentUserId.current = userId;

  useEffect(() => {
    const generation = ++loadGeneration.current;

    setStoredFoodLogs([]);
    setLoadedUserId(null);
    setFailedUserId(null);
    readyUserId.current = null;
    currentFoodLogs.current = [];

    if (userId === null) {
      return;
    }

    const owner = authIdentity;
    const isCurrent = () => currentIdentity.current === owner && loadGeneration.current === generation;

    const unsubscribe = foodLogStorage.subscribe(userId, envelope => {
      if (!isCurrent() || readyUserId.current !== userId || readyIdentity.current !== authIdentity) return;
      const logs = visibleFoodLogs(envelope);
      currentFoodLogs.current = logs;
      setStoredFoodLogs(logs);
    });
    const loadSavedFoodLogs = async () => {
      try {
        const envelope = await foodLogStorage.update(userId, isCurrent);
        const loadedFoodLogs = visibleFoodLogs(envelope);

        if (isCurrent()) {
          currentFoodLogs.current = loadedFoodLogs;
          readyUserId.current = userId;
          readyIdentity.current = authIdentity;
          setStoredFoodLogs(loadedFoodLogs);
          setLoadedUserId(userId);
        }
      } catch (error) {
        console.log("Failed to load food logs:", error);

        if (isCurrent()) {
          currentFoodLogs.current = [];
          readyUserId.current = null;
          setStoredFoodLogs([]);
          setLoadedUserId(null);
          setFailedUserId(userId);
        }
      }
    };

    void loadSavedFoodLogs();

    return () => {
      unsubscribe();
      if (loadGeneration.current === generation) {
        loadGeneration.current += 1;
      }
    };
  }, [retryCount, authIdentity, userId]);

  const canAccessFoodLogs = userId !== null && loadedUserId === userId && readyIdentity.current === authIdentity;
  const foodLogs = canAccessFoodLogs ? storedFoodLogs : [];

  const foodStorageHydrationState: FoodStorageHydrationState =
    userId === null
      ? "signed-out"
      : failedUserId === userId
        ? "error"
        : canAccessFoodLogs
          ? "ready"
          : "loading";

  const foodStorageError =
    foodStorageHydrationState === "error"
      ? FOOD_STORAGE_ERROR_MESSAGE
      : null;

  const currentStorageKey =
    userId === null ? null : userId;
  const isFoodLogMutationPending =
    currentStorageKey !== null &&
    activeMutations.current.has(currentStorageKey);

  const retryFoodStorageHydration = () => {
    if (userId !== null && failedUserId === userId) {
      setRetryCount((currentCount) => currentCount + 1);
    }
  };

  const persistFoodLogs = async (
    mutationUserId: string,
    mutationGeneration: number,
    operation: (isCurrent: () => boolean) => Promise<FoodLogEnvelope>,
  ) => {
    const storageKey = mutationUserId;
    const owner = authIdentity;
    const isCurrent = () => currentIdentity.current === owner && loadGeneration.current === mutationGeneration;

    if (
      !isCurrent() || readyIdentity.current !== owner ||
      activeMutations.current.has(storageKey) ||
      currentUserId.current !== mutationUserId ||
      readyUserId.current !== mutationUserId
    ) {
      return false;
    }

    const mutationIdentity = Symbol(storageKey);
    activeMutations.current.set(storageKey, mutationIdentity);
    setMutationStateVersion((version) => version + 1);

    try {
      await operation(isCurrent);

      if (
        !isCurrent() || currentUserId.current !== mutationUserId ||
        readyUserId.current !== mutationUserId ||
        loadGeneration.current !== mutationGeneration
      ) {
        return false;
      }

      // The scoped storage observer publishes the latest durable envelope.
      return true;
    } catch (error) {
      console.log("Failed to save food logs:", error);
      return false;
    } finally {
      if (activeMutations.current.get(storageKey) === mutationIdentity) {
        activeMutations.current.delete(storageKey);
        setMutationStateVersion((version) => version + 1);
      }
    }
  };

  const addFoodLog = async (
    foodLog: NewFoodLog,
    requestedLoggedDate?: string,
  ) => {
    if (userId === null || readyUserId.current !== userId) {
      return false;
    }

    const now = new Date();
    const todayDateKey = getLocalDateKey(now);

    const canUseRequestedDate =
      requestedLoggedDate !== undefined &&
      parseLocalDateKey(requestedLoggedDate) !== null &&
      requestedLoggedDate <= todayDateKey;

    const newFoodLog: FoodLog = {
      ...foodLog,
      id: randomUUID(),
      createdAt: now.toISOString(),
      loggedDate: canUseRequestedDate ? requestedLoggedDate : todayDateKey,
    };

    return persistFoodLogs(
      userId,
      loadGeneration.current,
      isCurrent => foodLogStorage.add(userId, isCurrent, newFoodLog),
    );
  };

  const deleteFoodLog = async (id: string) => {
    if (userId === null || readyUserId.current !== userId) {
      return false;
    }

    return persistFoodLogs(
      userId,
      loadGeneration.current,
      isCurrent => foodLogStorage.remove(userId, isCurrent, [id]),
    );
  };

  const clearFoodLogsForDate = async (loggedDate: string) => {
    if (userId === null || readyUserId.current !== userId) {
      return false;
    }

    const ids = currentFoodLogs.current.filter(food => food.loggedDate === loggedDate).map(food => food.id);
    return persistFoodLogs(userId, loadGeneration.current,
      isCurrent => foodLogStorage.remove(userId, isCurrent, ids));
  };

  return (
    <FoodLogContext.Provider
      value={{
        foodLogs,
        foodStorageHydrationState,
        foodStorageError,
        isFoodLogMutationPending,
        retryFoodStorageHydration,
        addFoodLog,
        deleteFoodLog,
        clearFoodLogsForDate,
      }}
    >
      {children}
    </FoodLogContext.Provider>
  );
}

export function useFoodLogs() {
  const context = useContext(FoodLogContext);

  if (!context) {
    throw new Error("useFoodLogs must be used inside FoodLogProvider");
  }

  return context;
}
