export type NutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type NutritionTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export const DEFAULT_NUTRITION_TARGETS: Readonly<NutritionTargets> = {
  calories: 2000,
  protein: 120,
  carbs: 220,
  fat: 65,
};

export const NUTRITION_TARGET_LIMITS: Readonly<
  Record<keyof NutritionTargets, Readonly<{ min: number; max: number }>>
> = {
  calories: { min: 500, max: 10000 },
  protein: { min: 1, max: 1000 },
  carbs: { min: 1, max: 1000 },
  fat: { min: 1, max: 1000 },
};

export type NutritionProgress = {
  consumed: NutritionTotals;
  targets: NutritionTargets;
};
