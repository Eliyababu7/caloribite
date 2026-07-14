import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import type { FoodLog, MealType, NewFoodLog } from "../types/food";
import {
  getLocalDateKey,
  getLocalDateKeyFromIso,
  parseLocalDateKey,
} from "../utils/date";

export type { FoodLog, MealType } from "../types/food";

type FoodLogContextType = {
  foodLogs: FoodLog[];
  addFoodLog: (foodLog: NewFoodLog, loggedDate?: string) => void;
  deleteFoodLog: (id: string) => void;
  clearFoodLogsForDate: (loggedDate: string) => void;
};

const STORAGE_KEY = "caloribite_food_logs";

const MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

const FoodLogContext = createContext<FoodLogContextType | undefined>(undefined);

function isMealType(value: unknown): value is MealType {
  return MEAL_TYPES.includes(value as MealType);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inferMealType(createdAt: string): MealType {
  const createdDate = new Date(createdAt);

  if (Number.isNaN(createdDate.getTime())) {
    return "Snack";
  }

  const hour = createdDate.getHours();

  if (hour < 11) {
    return "Breakfast";
  }

  if (hour < 15) {
    return "Lunch";
  }

  if (hour < 21) {
    return "Dinner";
  }

  return "Snack";
}

function migrateStoredFoodLog(storedFood: unknown): FoodLog | null {
  if (typeof storedFood !== "object" || storedFood === null) {
    return null;
  }

  const food = storedFood as Record<string, unknown>;

  if (
    typeof food.id !== "string" ||
    typeof food.foodName !== "string" ||
    typeof food.createdAt !== "string" ||
    !isFiniteNumber(food.calories) ||
    !isFiniteNumber(food.protein) ||
    !isFiniteNumber(food.carbs) ||
    !isFiniteNumber(food.fat)
  ) {
    return null;
  }

  const mealType = isMealType(food.mealType)
    ? food.mealType
    : inferMealType(food.createdAt);

  const todayDateKey = getLocalDateKey();

  const storedLoggedDate =
    typeof food.loggedDate === "string" ? food.loggedDate : null;

  const loggedDate =
    storedLoggedDate !== null &&
    parseLocalDateKey(storedLoggedDate) !== null &&
    storedLoggedDate <= todayDateKey
      ? storedLoggedDate
      : (getLocalDateKeyFromIso(food.createdAt) ?? todayDateKey);

  return {
    id: food.id,
    foodName: food.foodName,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    mealType,
    createdAt: food.createdAt,
    loggedDate,
  };
}

export function FoodLogProvider({ children }: { children: ReactNode }) {
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);

  useEffect(() => {
    const loadSavedFoodLogs = async () => {
      try {
        const savedFoodLogs = await AsyncStorage.getItem(STORAGE_KEY);

        if (savedFoodLogs) {
          const parsedFoodLogs: unknown = JSON.parse(savedFoodLogs);

          if (Array.isArray(parsedFoodLogs)) {
            const migratedFoodLogs = parsedFoodLogs
              .map(migrateStoredFoodLog)
              .filter((food): food is FoodLog => food !== null);

            setFoodLogs(migratedFoodLogs);
          }
        }
      } catch (error) {
        console.log("Failed to load food logs:", error);
      } finally {
        setHasLoadedStorage(true);
      }
    };

    loadSavedFoodLogs();
  }, []);

  useEffect(() => {
    const saveFoodLogs = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(foodLogs));
      } catch (error) {
        console.log("Failed to save food logs:", error);
      }
    };

    if (hasLoadedStorage) {
      saveFoodLogs();
    }
  }, [foodLogs, hasLoadedStorage]);

  const addFoodLog = (foodLog: NewFoodLog, requestedLoggedDate?: string) => {
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

    setFoodLogs((currentLogs) => [newFoodLog, ...currentLogs]);
  };

  const deleteFoodLog = (id: string) => {
    setFoodLogs((currentLogs) => currentLogs.filter((food) => food.id !== id));
  };

  const clearFoodLogsForDate = (loggedDate: string) => {
    setFoodLogs((currentLogs) =>
      currentLogs.filter((food) => food.loggedDate !== loggedDate),
    );
  };

  return (
    <FoodLogContext.Provider
      value={{
        foodLogs,
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
