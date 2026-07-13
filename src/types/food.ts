export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export type FoodLog = {
  id: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: MealType;
  createdAt: string;
};

export type NewFoodLog = Omit<FoodLog, "id" | "createdAt">;
