import type { FoodSearchResult, NutritionPer100g } from "../../../src/types/foodSearch.ts";
import { isProductCode } from "./validation.ts";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return;
  return value.trim() || undefined;
}

function positiveDecimal(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string" || /[^0-9.]/.test(value) || !/^[0-9]{1,12}(?:\.[0-9]{1,6})?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function isGramUnit(value: string): boolean {
  return /^(?:g|grams?)$/i.test(value);
}

function hasVolumeLabel(label: string | undefined): boolean {
  return label !== undefined && /(?:^|[\s0-9])(ml|cl|dl|l|fl\s*oz|millilit(?:er|re)s?|lit(?:er|re)s?|fluid\s+ounces?)\b/i.test(label);
}

function servingGrams(product: Record<string, unknown>): number | null {
  const label = text(product.serving_size, 200);
  if (hasVolumeLabel(label)) return null;
  // Accept an explicit gram amount, including a supplied household label with grams.
  // Do not infer weight from a bare count, volume, serving_quantity, or package weight.
  const match = label?.match(/^([0-9]{1,12}(?:\.[0-9]{1,6})?)\s*(?:g|grams?)$/i) ??
    label?.match(/^[^()]{1,100}\(([0-9]{1,12}(?:\.[0-9]{1,6})?)\s*(?:g|grams?)\)$/i);
  const labelGrams = match ? positiveDecimal(match[1]) : null;
  const unit = text(product.serving_quantity_unit, 12);
  if (product.serving_quantity_unit !== undefined && (!unit || !isGramUnit(unit))) return null;
  const quantity = positiveDecimal(product.serving_quantity);
  if (product.serving_quantity !== undefined && quantity === null) return null;
  if (quantity !== null && labelGrams !== null && quantity !== labelGrams) return null;
  return unit && quantity !== null ? quantity : labelGrams;
}

function hasMassNutritionBasis(product: Record<string, unknown>): boolean {
  // OFF's *_100g fields can mean 100 mL for liquids. Never assume a density.
  for (const field of ["product_quantity_unit", "serving_quantity_unit"] as const) {
    if (product[field] !== undefined) {
      const unit = text(product[field], 12)?.toLowerCase();
      if (!unit || !["g", "gram", "grams", "kg", "mg", "oz"].includes(unit)) return false;
    }
  }
  const label = text(product.serving_size, 200);
  if (hasVolumeLabel(label)) return false;
  return product.nutrition_data_per === undefined ||
    product.nutrition_data_per === "100g" || product.nutrition_data_per === "serving";
}

function nonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function nutrition(product: Record<string, unknown>, grams: number | null): NutritionPer100g {
  const empty = { calories: null, protein: null, carbs: null, fat: null };
  if (!hasMassNutritionBasis(product) || product.no_nutrition_data === "on") return empty;
  const values = record(product.nutriments) ? product.nutriments : {};
  function nutrient(id: string): number | null {
    const modifier = values[`${id}_modifier`];
    if (modifier !== undefined && modifier !== "" && modifier !== "=") return null;
    if (id === "energy-kcal" && values["energy-kcal_unit"] !== undefined &&
      values["energy-kcal_unit"] !== "kcal") return null;
    const per100gKey = `${id}_100g`;
    if (Object.hasOwn(values, per100gKey)) return nonNegative(values[per100gKey]);
    // Only absent per-100-g data can use a reliable, explicitly declared serving basis.
    if (grams === null || product.nutrition_data_per !== "serving") return null;
    const perServing = nonNegative(values[`${id}_serving`]);
    if (perServing === null) return null;
    const result = perServing * 100 / grams;
    return Number.isFinite(result) ? result : null;
  }
  return { calories: nutrient("energy-kcal"), protein: nutrient("proteins"), carbs: nutrient("carbohydrates"), fat: nutrient("fat") };
}

export function normalizeOpenFoodFacts(input: unknown): FoodSearchResult | null {
  if (!record(input) || !isProductCode(input.code)) return null;
  const name = text(input.product_name, 300) ?? text(input.product_name_en, 300);
  if (!name) return null;
  const brand = text(input.brands, 200);
  const grams = servingGrams(input);
  const servingId = `off-${input.code}-serving`;
  return {
    source: "open-food-facts",
    externalId: input.code,
    barcode: input.code,
    name,
    ...(brand ? { brand } : {}),
    nutritionPer100g: nutrition(input, grams),
    // There is one canonical explicit mass serving, so duplicate labels cannot be emitted.
    servingOptions: grams === null ? [] : [{ id: servingId, label: `${grams} g`, grams }],
    ...(grams === null ? {} : { defaultServingId: servingId }),
    attributionLabel: "Open Food Facts (ODbL)",
    sourceUrl: new URL(`/product/${input.code}`, "https://world.openfoodfacts.org").toString(),
  };
}
