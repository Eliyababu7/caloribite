export const FOOD_SOURCES = [
  "starter",
  "usda",
  "open-food-facts",
  "custom",
] as const;

export type FoodSource = (typeof FOOD_SOURCES)[number];

export type NutritionPer100g = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type FoodServingOption = {
  id: string;
  label: string;
  grams: number;
};

export type FoodSearchResult = {
  source: FoodSource;
  externalId?: string;
  name: string;
  brand?: string;
  barcode?: string;
  // Account scope for locally saved results carried through confirmation routes.
  savedForUserId?: string;
  localId?: string;
  nutritionPer100g: NutritionPer100g;
  servingOptions: FoodServingOption[];
  defaultServingId?: string;
  attributionLabel: string;
  sourceUrl?: string;
};
