import type { MealType } from "../types/food";

export const MEAL_TYPES: readonly MealType[] = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
];

export function isMealType(value: unknown): value is MealType {
  return (
    typeof value === "string" &&
    MEAL_TYPES.some((mealType) => mealType === value)
  );
}

export function getDefaultMealType(date = new Date()): MealType {
  const hour = date.getHours();

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
