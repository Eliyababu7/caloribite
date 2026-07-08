import { createContext, ReactNode, useContext, useMemo, useState } from "react";

export type FoodLog = {
  id: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: string;
};

type FoodLogContextType = {
  foodLogs: FoodLog[];
  addFoodLog: (foodLog: Omit<FoodLog, "id" | "createdAt">) => void;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
};

const FoodLogContext = createContext<FoodLogContextType | undefined>(undefined);

export function FoodLogProvider({ children }: { children: ReactNode }) {
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);

  const addFoodLog = (foodLog: Omit<FoodLog, "id" | "createdAt">) => {
    const newFoodLog: FoodLog = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      ...foodLog,
    };

    setFoodLogs((currentLogs) => [newFoodLog, ...currentLogs]);
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
