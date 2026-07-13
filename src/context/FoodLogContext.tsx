import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { FoodLog, NewFoodLog } from "../types/food";

export type { FoodLog, MealType } from "../types/food";

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
          setFoodLogs(JSON.parse(savedFoodLogs));
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
