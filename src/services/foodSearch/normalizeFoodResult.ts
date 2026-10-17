import {
  FOOD_SOURCES,
  type FoodSearchResult,
  type FoodServingOption,
  type FoodSource,
  type NutritionPer100g,
} from "../../types/foodSearch";

const NUTRIENT_NAMES: ReadonlyArray<keyof NutritionPer100g> = [
  "calories",
  "protein",
  "carbs",
  "fat",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFoodSource(value: unknown): value is FoodSource {
  return (
    typeof value === "string" &&
    FOOD_SOURCES.some((foodSource) => foodSource === value)
  );
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function normalizeNutrient(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function normalizeNutrition(value: unknown): NutritionPer100g {
  const record = isRecord(value) ? value : {};

  return Object.fromEntries(
    NUTRIENT_NAMES.map((nutrient) => [
      nutrient,
      normalizeNutrient(record[nutrient]),
    ]),
  ) as NutritionPer100g;
}

function normalizeServingOptions(value: unknown): FoodServingOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const servings: FoodServingOption[] = [];
  const servingIds = new Set<string>();
  const servingDescriptions = new Set<string>();

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const id = normalizeText(item.id);
    const label = normalizeText(item.label);
    const grams = item.grams;

    if (
      !id ||
      !label ||
      typeof grams !== "number" ||
      !Number.isFinite(grams) ||
      grams <= 0
    ) {
      continue;
    }

    const descriptionKey = `${label.toLowerCase()}\u0000${grams}`;
    if (servingIds.has(id) || servingDescriptions.has(descriptionKey)) {
      continue;
    }

    servingIds.add(id);
    servingDescriptions.add(descriptionKey);
    servings.push({ id, label, grams });
  }

  return servings;
}

export function normalizeFoodResult(input: unknown): FoodSearchResult | null {
  if (!isRecord(input) || !isFoodSource(input.source)) {
    return null;
  }

  const name = normalizeText(input.name);
  if (!name) {
    return null;
  }

  const servingOptions = normalizeServingOptions(input.servingOptions);
  const requestedDefaultServingId = normalizeText(input.defaultServingId);
  const defaultServingId = servingOptions.some(
    (serving) => serving.id === requestedDefaultServingId,
  )
    ? requestedDefaultServingId
    : undefined;
  const externalId = normalizeText(input.externalId);
  const brand = normalizeText(input.brand);
  const barcode = normalizeText(input.barcode);
  const sourceUrl = normalizeText(input.sourceUrl);
  const attributionLabel = normalizeText(input.attributionLabel) ?? "";
  const savedForUserId = input.source === "custom" ? normalizeText(input.savedForUserId) : undefined;

  return {
    source: input.source,
    ...(externalId ? { externalId } : {}),
    name,
    ...(brand ? { brand } : {}),
    ...(barcode ? { barcode } : {}),
    ...(savedForUserId ? { savedForUserId } : {}),
    nutritionPer100g: normalizeNutrition(input.nutritionPer100g),
    servingOptions,
    ...(defaultServingId ? { defaultServingId } : {}),
    attributionLabel,
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}
