import type {
  FoodSearchResult,
  FoodServingOption,
  NutritionPer100g,
} from "../../../src/types/foodSearch.ts";

const NUTRIENT_IDS = {
  calories: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
} as const;

const PER_100_GRAM_DATA_TYPES = new Set([
  "foundation",
  "sr legacy",
  "survey (fndds)",
  "branded",
]);

const GRAMS_PER_OUNCE = 28.349523125;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function massAmountToGrams(value: number, unit: unknown): number | null {
  if (!Number.isFinite(value) || value < 0 || typeof unit !== "string") {
    return null;
  }

  const normalizedUnit = unit.trim().toLowerCase().replace(/[.\s]/g, "");
  let multiplier: number;
  switch (normalizedUnit) {
    case "g":
    case "gram":
    case "grams":
      multiplier = 1;
      break;
    case "kg":
    case "kilogram":
    case "kilograms":
      multiplier = 1000;
      break;
    case "mg":
    case "milligram":
    case "milligrams":
      multiplier = 0.001;
      break;
    case "oz":
    case "ounce":
    case "ounces":
      multiplier = GRAMS_PER_OUNCE;
      break;
    default:
      return null;
  }

  const grams = value * multiplier;
  return Number.isFinite(grams) ? grams : null;
}

export function massToGrams(value: unknown, unit: unknown): number | null {
  if (!finitePositive(value)) {
    return null;
  }
  const grams = massAmountToGrams(value, unit);
  return grams !== null && grams > 0 ? grams : null;
}

function nutrientId(value: Record<string, unknown>): number | null {
  const nestedNutrient = isRecord(value.nutrient) ? value.nutrient : null;
  const id = value.nutrientId ?? nestedNutrient?.id;
  return typeof id === "number" && Number.isSafeInteger(id) ? id : null;
}

function nutrientValue(value: Record<string, unknown>): number | null {
  const raw = value.value ?? value.amount;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0
    ? raw
    : null;
}

function nutrientUnit(value: Record<string, unknown>): string | undefined {
  const nestedNutrient = isRecord(value.nutrient) ? value.nutrient : null;
  return text(value.unitName ?? nestedNutrient?.unitName);
}

function hasKcalUnit(unit: string | undefined): boolean {
  return (
    unit !== undefined &&
    ["kcal", "kilocalorie", "kilocalories"].includes(unit.trim().toLowerCase())
  );
}

function valueInGrams(
  value: number | null,
  unit: string | undefined,
): number | null {
  if (value === null) {
    return null;
  }
  if (unit === undefined) {
    return null;
  }

  return massAmountToGrams(value, unit);
}

function getNutrientAmount(
  nutrients: Record<string, unknown>[],
  targetId: number,
  servingScale: number,
  nutrientKind: "energy" | "mass",
): number | null {
  const match = nutrients.find((nutrient) => nutrientId(nutrient) === targetId);
  if (!match) {
    return null;
  }

  const value = nutrientValue(match);
  const unit = nutrientUnit(match);
  if (value === null) {
    return null;
  }

  if (nutrientKind === "energy") {
    if (!hasKcalUnit(unit)) {
      return null;
    }
    const caloriesPer100g = value * servingScale;
    return Number.isFinite(caloriesPer100g) ? caloriesPer100g : null;
  }

  const grams = valueInGrams(value, unit);
  if (grams === null) {
    return null;
  }
  const amountPer100g = grams * servingScale;
  return Number.isFinite(amountPer100g) ? amountPer100g : null;
}

function toNutritionPer100g(food: Record<string, unknown>): NutritionPer100g {
  const dataType = text(food.dataType)?.toLowerCase();
  // USDA foodNutrients are standardized per 100 units, not per serving.
  // Branded volume-based products may use 100 mL, so require a mass basis.
  // labelNutrients are per serving and are deliberately not used here.
  if (!dataType || !PER_100_GRAM_DATA_TYPES.has(dataType)) {
    return { calories: null, protein: null, carbs: null, fat: null };
  }
  if (dataType === "branded" && massToGrams(food.servingSize, food.servingSizeUnit) === null) {
    return { calories: null, protein: null, carbs: null, fat: null };
  }
  const servingScale = 1;

  const nutrients = Array.isArray(food.foodNutrients)
    ? food.foodNutrients.filter(isRecord)
    : [];

  return {
    calories: getNutrientAmount(
      nutrients,
      NUTRIENT_IDS.calories,
      servingScale,
      "energy",
    ),
    protein: getNutrientAmount(
      nutrients,
      NUTRIENT_IDS.protein,
      servingScale,
      "mass",
    ),
    carbs: getNutrientAmount(
      nutrients,
      NUTRIENT_IDS.carbs,
      servingScale,
      "mass",
    ),
    fat: getNutrientAmount(nutrients, NUTRIENT_IDS.fat, servingScale, "mass"),
  };
}

function toServingOptions(
  food: Record<string, unknown>,
  fdcId: number,
): { options: FoodServingOption[]; defaultServingId?: string } {
  const options: FoodServingOption[] = [];
  const portions = Array.isArray(food.foodPortions) ? food.foodPortions : [];

  for (const [index, item] of portions.entries()) {
    if (!isRecord(item)) {
      continue;
    }
    const grams = item.gramWeight;
    const label = text(item.portionDescription) ?? text(item.modifier);
    if (!finitePositive(grams) || !label) {
      continue;
    }

    options.push({
      id: `usda-${fdcId}-portion-${index}`,
      label,
      grams,
    });
  }

  let defaultServingId: string | undefined;
  if (text(food.dataType)?.toLowerCase() === "branded") {
    const grams = massToGrams(food.servingSize, food.servingSizeUnit);
    const unit = text(food.servingSizeUnit);
    if (grams !== null && unit) {
      defaultServingId = `usda-${fdcId}-label-serving`;
      options.unshift({
        id: defaultServingId,
        label: `${food.servingSize} ${unit}`,
        grams,
      });
    }
  }

  const seen = new Set<string>();
  const uniqueOptions = options.filter(({ label, grams }) => {
    const key = `${label.toLowerCase()}\u0000${grams}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    options: uniqueOptions,
    ...(defaultServingId ? { defaultServingId } : {}),
  };
}

export function normalizeUsdaFood(input: unknown): FoodSearchResult | null {
  if (!isRecord(input)) {
    return null;
  }

  const fdcId = input.fdcId;
  const name = text(input.description);
  if (
    typeof fdcId !== "number" ||
    !Number.isSafeInteger(fdcId) ||
    fdcId <= 0 ||
    !name
  ) {
    return null;
  }

  const servings = toServingOptions(input, fdcId);
  const brand = text(input.brandOwner) ?? text(input.brandName);

  return {
    source: "usda",
    externalId: String(fdcId),
    name,
    ...(brand ? { brand } : {}),
    nutritionPer100g: toNutritionPer100g(input),
    servingOptions: servings.options,
    ...(servings.defaultServingId
      ? { defaultServingId: servings.defaultServingId }
      : {}),
    attributionLabel: "FoodData Central, U.S. Department of Agriculture",
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`,
  };
}
