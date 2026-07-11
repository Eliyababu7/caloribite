import type { NutritionTotals } from "../../types/nutrition";

export type NutritionSummary = {
  consumed: NutritionTotals;
  targets: NutritionTotals;
  remainingCalories: number;
  calorieProgress: number;
  proteinProgress: number;
  carbsProgress: number;
  fatProgress: number;
};

export function calculateProgress(current: number, target: number): number {
  if (target <= 0) {
    return 0;
  }

  const percentage = (current / target) * 100;

  return Math.min(Math.max(Math.round(percentage), 0), 100);
}

export function calculateRemaining(current: number, target: number): number {
  return Math.max(target - current, 0);
}

export function createNutritionSummary(
  consumed: NutritionTotals,
  targets: NutritionTotals,
): NutritionSummary {
  return {
    consumed,
    targets,

    remainingCalories: calculateRemaining(consumed.calories, targets.calories),

    calorieProgress: calculateProgress(consumed.calories, targets.calories),

    proteinProgress: calculateProgress(consumed.protein, targets.protein),

    carbsProgress: calculateProgress(consumed.carbs, targets.carbs),

    fatProgress: calculateProgress(consumed.fat, targets.fat),
  };
}
