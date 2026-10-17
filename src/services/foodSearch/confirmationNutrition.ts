import type { FoodSearchResult, NutritionPer100g } from "../../types/foodSearch";
import { calculateServingNutrition } from "./calculateServingNutrition";
import { validateTransportFood } from "./foodResultTransport";

export const INCOMPLETE_NUTRITION_WARNING = "Nutrition information is incomplete. Check the package and enter the missing values per 100 g.";
export function hasIncompleteNutrition(food: FoodSearchResult): boolean {
  return Object.values(food.nutritionPer100g).some((value) => value === null);
}
export function canCompleteBarcodeNutrition(food: FoodSearchResult): boolean {
  return food.source === "custom" || (food.source === "open-food-facts" && hasIncompleteNutrition(food));
}

// The package editor always uses per-100-g values, never serving totals.
export function completeBarcodeNutrition(food: FoodSearchResult, inputs: NutritionInputs, name = food.name): FoodSearchResult | null {
  if (!canCompleteBarcodeNutrition(food)) return null;
  const values = Object.values(inputs);
  if (values.length !== 4 || values.some((value) => !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0)) return null;
  return validateTransportFood({
    ...food, source: "custom", name,
    nutritionPer100g: { calories: Number(inputs.calories), protein: Number(inputs.protein), carbs: Number(inputs.carbs), fat: Number(inputs.fat) },
  });
}

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
