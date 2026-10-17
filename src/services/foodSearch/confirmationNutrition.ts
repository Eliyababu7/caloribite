import type { FoodSearchResult, NutritionPer100g } from "../../types/foodSearch";
import { calculateServingNutrition } from "./calculateServingNutrition";

export type NutritionInputs = Record<keyof NutritionPer100g, string>;
export function nutritionInputs(nutrition: NutritionPer100g | null): NutritionInputs {
  return {
    calories: nutrition?.calories == null ? "" : String(nutrition.calories),
    protein: nutrition?.protein == null ? "" : String(nutrition.protein),
    carbs: nutrition?.carbs == null ? "" : String(nutrition.carbs),
    fat: nutrition?.fat == null ? "" : String(nutrition.fat),
  };
}
export function recalculateFoodInputs(food: FoodSearchResult, grams: string, quantity: string): NutritionInputs {
  return nutritionInputs(calculateServingNutrition(food.nutritionPer100g, Number(grams), Number(quantity)));
}
export function initialFoodServing(food: FoodSearchResult) {
  const serving = food.servingOptions.find((option) => option.id === food.defaultServingId) ?? food.servingOptions[0];
  const hasNutrition = Object.values(food.nutritionPer100g).some((value) => value !== null);
  return { servingId: serving?.id ?? "", grams: serving ? String(serving.grams) : hasNutrition ? "100" : "", quantity: "1" };
}
