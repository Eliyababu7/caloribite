export type NutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type NutritionTargets = NutritionTotals;

export type NutritionProgress = {
  consumed: NutritionTotals;
  targets: NutritionTargets;
};
