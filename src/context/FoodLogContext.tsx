import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAuth } from "./AuthContext";
import type { FoodLog, MealType, NewFoodLog } from "../types/food";
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

const USER_STORAGE_KEY_PREFIX = "caloribite_food_logs:user:";
const FOOD_STORAGE_ERROR_MESSAGE =
  "Your food logs could not be loaded. Please try again.";

const storageWriteQueues = new Map<string, Promise<void>>();

const MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

const FoodLogContext = createContext<FoodLogContextType | undefined>(undefined);

function isMealType(value: unknown): value is MealType {
  return MEAL_TYPES.includes(value as MealType);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function migrateStoredFoodLog(storedFood: unknown): FoodLog | null {
  if (typeof storedFood !== "object" || storedFood === null) {
    return null;
  }

  const food = storedFood as Record<string, unknown>;

  if (
    typeof food.id !== "string" ||
    food.id.trim().length === 0 ||
    typeof food.foodName !== "string" ||
    food.foodName.trim().length === 0 ||
    typeof food.createdAt !== "string" ||
    Number.isNaN(new Date(food.createdAt).getTime()) ||
    !isFiniteNumber(food.calories) ||
    !isFiniteNumber(food.protein) ||
    !isFiniteNumber(food.carbs) ||
    !isFiniteNumber(food.fat) ||
    !isMealType(food.mealType) ||
    typeof food.loggedDate !== "string" ||
    parseLocalDateKey(food.loggedDate) === null
  ) {
    return null;
  }

  return {
    id: food.id,
    foodName: food.foodName,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    mealType: food.mealType,
    createdAt: food.createdAt,
    loggedDate: food.loggedDate,
  };
}

function parseStoredFoodLogs(savedFoodLogs: string): FoodLog[] {
  const parsedFoodLogs: unknown = JSON.parse(savedFoodLogs);

  if (!Array.isArray(parsedFoodLogs)) {
    throw new Error("Stored food logs are not an array");
  }

  const foodLogs: FoodLog[] = [];

  for (const storedFoodLog of parsedFoodLogs) {
    const foodLog = migrateStoredFoodLog(storedFoodLog);

    if (foodLog === null) {
      throw new Error("Stored food logs contain an invalid record");
    }

    foodLogs.push(foodLog);
  }

  return foodLogs;
}

function enqueueStorageWrite(storageKey: string, foodLogs: FoodLog[]) {
  const previousWrite = storageWriteQueues.get(storageKey) ?? Promise.resolve();
  const write = previousWrite
    .catch(() => undefined)
    .then(() =>
      AsyncStorage.setItem(storageKey, JSON.stringify(foodLogs)),
    );

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

export function FoodLogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [storedFoodLogs, setStoredFoodLogs] = useState<FoodLog[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [failedUserId, setFailedUserId] = useState<string | null>(null);
  const [, setMutationStateVersion] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const loadGeneration = useRef(0);
  const currentUserId = useRef<string | null>(userId);
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

    const storageKey = `${USER_STORAGE_KEY_PREFIX}${userId}`;

    const loadSavedFoodLogs = async () => {
      try {
        await waitForQueuedStorageWrite(storageKey);

        if (loadGeneration.current !== generation) {
          return;
        }

        const scopedFoodLogs = await AsyncStorage.getItem(storageKey);
        const loadedFoodLogs =
          scopedFoodLogs === null ? [] : parseStoredFoodLogs(scopedFoodLogs);

        if (loadGeneration.current === generation) {
          currentFoodLogs.current = loadedFoodLogs;
          readyUserId.current = userId;
          setStoredFoodLogs(loadedFoodLogs);
          setLoadedUserId(userId);
        }
      } catch (error) {
        console.log("Failed to load food logs:", error);

        if (loadGeneration.current === generation) {
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
      if (loadGeneration.current === generation) {
        loadGeneration.current += 1;
      }
    };
  }, [retryCount, userId]);

  const canAccessFoodLogs = userId !== null && loadedUserId === userId;
  const foodLogs = canAccessFoodLogs ? storedFoodLogs : [];

  const foodStorageHydrationState: FoodStorageHydrationState =
    userId === null
      ? "signed-out"
      : failedUserId === userId
        ? "error"
        : loadedUserId === userId
          ? "ready"
          : "loading";

  const foodStorageError =
    foodStorageHydrationState === "error"
      ? FOOD_STORAGE_ERROR_MESSAGE
      : null;

  const currentStorageKey =
    userId === null ? null : `${USER_STORAGE_KEY_PREFIX}${userId}`;
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
    nextFoodLogs: FoodLog[],
  ) => {
    const storageKey = `${USER_STORAGE_KEY_PREFIX}${mutationUserId}`;

    if (
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
      await enqueueStorageWrite(storageKey, nextFoodLogs);

      if (
        currentUserId.current !== mutationUserId ||
        readyUserId.current !== mutationUserId ||
        loadGeneration.current !== mutationGeneration
      ) {
        return false;
      }

      currentFoodLogs.current = nextFoodLogs;
      setStoredFoodLogs(nextFoodLogs);
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
      id: Date.now().toString(),
      createdAt: now.toISOString(),
      loggedDate: canUseRequestedDate ? requestedLoggedDate : todayDateKey,
      ...foodLog,
    };

    return persistFoodLogs(
      userId,
      loadGeneration.current,
      [newFoodLog, ...currentFoodLogs.current],
    );
  };

  const deleteFoodLog = async (id: string) => {
    if (userId === null || readyUserId.current !== userId) {
      return false;
    }

    return persistFoodLogs(
      userId,
      loadGeneration.current,
      currentFoodLogs.current.filter((food) => food.id !== id),
    );
  };

  const clearFoodLogsForDate = async (loggedDate: string) => {
    if (userId === null || readyUserId.current !== userId) {
      return false;
    }

    return persistFoodLogs(
      userId,
      loadGeneration.current,
      currentFoodLogs.current.filter(
        (food) => food.loggedDate !== loggedDate,
      ),
    );
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
