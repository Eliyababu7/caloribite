import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { FoodLog, MealType, NewFoodLog } from "../types/food";

export type { FoodLog, MealType } from "../types/food";

const MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

function isMealType(value: unknown): value is MealType {
  return MEAL_TYPES.includes(value as MealType);
}

function inferMealType(createdAt: unknown): MealType {
  if (typeof createdAt !== "string") {
    return "Snack";
  }

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

type FoodLogContextType = {
  foodLogs: FoodLog[];
  addFoodLog: (foodLog: NewFoodLog) => void;
  deleteFoodLog: (id: string) => void;
  clearFoodLogs: () => void;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
};

const STORAGE_KEY = "caloribite_food_logs";

const FoodLogContext = createContext<FoodLogContextType | undefined>(undefined);

export function FoodLogProvider({ children }: { children: ReactNode }) {
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);

  useEffect(() => {
    const loadSavedFoodLogs = async () => {
      try {
        const savedFoodLogs = await AsyncStorage.getItem(STORAGE_KEY);

        if (savedFoodLogs) {
          const parsedFoodLogs: unknown = JSON.parse(savedFoodLogs);

          if (!Array.isArray(parsedFoodLogs)) {
            setFoodLogs([]);
            return;
          }

          const migratedFoodLogs = parsedFoodLogs.map((storedFood) => {
            const food = storedFood as FoodLog;

            return {
              ...food,
              mealType: isMealType(food.mealType)
                ? food.mealType
                : inferMealType(food.createdAt),
            };
          });

          setFoodLogs(migratedFoodLogs);
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

  const addFoodLog = (foodLog: NewFoodLog) => {
    const newFoodLog: FoodLog = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      ...foodLog,
    };

    setFoodLogs((currentLogs) => [newFoodLog, ...currentLogs]);
  };

  const deleteFoodLog = (id: string) => {
    setFoodLogs((currentLogs) => currentLogs.filter((food) => food.id !== id));
  };

  const clearFoodLogs = () => {
    setFoodLogs([]);
  };

  const totals = useMemo(() => {
    return foodLogs.reduce(
      (sum, food) => {
        return {
          calories: sum.calories + food.calories,
          protein: sum.protein + food.protein,
          carbs: sum.carbs + food.carbs,
          fat: sum.fat + food.fat,
        };
      },
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
    );
  }, [foodLogs]);

  return (
    <FoodLogContext.Provider
      value={{
        foodLogs,
        addFoodLog,
        deleteFoodLog,
        clearFoodLogs,
        totalCalories: totals.calories,
        totalProtein: totals.protein,
        totalCarbs: totals.carbs,
        totalFat: totals.fat,
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
