import type { NutritionPer100g } from "../../types/foodSearch";

export type ServingNutrition = NutritionPer100g;

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function calculateNutrient(
  per100g: number | null,
  servingGrams: number,
  quantity: number,
): number | null {
  if (per100g === null || !Number.isFinite(per100g) || per100g < 0) {
    return null;
  }

  const value = (per100g * servingGrams * quantity) / 100;
  const valueInHundredths = value * 100;

  if (!Number.isFinite(value) || !Number.isFinite(valueInHundredths)) {
    return null;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateServingNutrition(
  nutritionPer100g: NutritionPer100g,
  servingGrams: number,
  quantity: number,
): ServingNutrition | null {
  if (
    !isPositiveFiniteNumber(servingGrams) ||
    !isPositiveFiniteNumber(quantity)
  ) {
    return null;
  }

  return {
    calories: calculateNutrient(
      nutritionPer100g.calories,
      servingGrams,
      quantity,
    ),
    protein: calculateNutrient(
      nutritionPer100g.protein,
      servingGrams,
      quantity,
    ),
    carbs: calculateNutrient(nutritionPer100g.carbs, servingGrams, quantity),
    fat: calculateNutrient(nutritionPer100g.fat, servingGrams, quantity),
  };
}
