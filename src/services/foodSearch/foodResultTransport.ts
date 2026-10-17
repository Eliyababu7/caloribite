import type { FoodSearchResult } from "../../types/foodSearch";
import { normalizeFoodResult } from "./normalizeFoodResult";

export const MAX_FOOD_ROUTE_BYTES = 6000;
// Count UTF-8 bytes without depending on a browser-only TextEncoder global.
function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}
const nutrients = ["calories", "protein", "carbs", "fat"] as const;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedText(value: unknown, max: number, optional = false): boolean {
  return (optional && value === undefined) ||
    (typeof value === "string" && value.trim().length > 0 && value.length <= max);
}

// Whitelist a small normalized record. Never carry raw provider fields into navigation.
export function validateTransportFood(value: unknown): FoodSearchResult | null {
  if (!record(value) || value.source !== "usda" ||
    !boundedText(value.externalId, 16) || !/^\d+$/.test(String(value.externalId)) ||
    !Number.isSafeInteger(Number(value.externalId)) || Number(value.externalId) <= 0 ||
    !boundedText(value.name, 300) || !boundedText(value.brand, 200, true) ||
    !boundedText(value.attributionLabel, 200) ||
    !record(value.nutritionPer100g) || !Array.isArray(value.servingOptions) ||
    value.servingOptions.length > 20) return null;
  const nutrition = value.nutritionPer100g;
  if (nutrients.some((key) => nutrition[key] !== null &&
    (typeof nutrition[key] !== "number" || !Number.isFinite(nutrition[key]) || nutrition[key] < 0))) return null;
  if (value.servingOptions.some((serving) => !record(serving) ||
    !boundedText(serving.id, 100) || !boundedText(serving.label, 200) ||
    typeof serving.grams !== "number" || !Number.isFinite(serving.grams) || serving.grams <= 0)) return null;
  if (!boundedText(value.defaultServingId, 100, true)) return null;
  const sourceUrl = `https://fdc.nal.usda.gov/food-details/${Number(value.externalId)}/nutrients`;
  const normalized = normalizeFoodResult({
    source: "usda", externalId: String(Number(value.externalId)), name: value.name,
    brand: value.brand, nutritionPer100g: nutrition, servingOptions: value.servingOptions,
    defaultServingId: value.defaultServingId,
    attributionLabel: "FoodData Central, U.S. Department of Agriculture", sourceUrl,
  });
  return normalized;
}

export function serializeFoodResult(value: unknown): string | null {
  const food = validateTransportFood(value);
  if (!food) return null;
  const serialized = JSON.stringify(food);
  return utf8ByteLength(serialized) <= MAX_FOOD_ROUTE_BYTES ? serialized : null;
}

export function deserializeFoodResult(value: unknown): FoodSearchResult | null {
  if (typeof value !== "string" || value.length > MAX_FOOD_ROUTE_BYTES ||
    utf8ByteLength(value) > MAX_FOOD_ROUTE_BYTES) return null;
  try { return validateTransportFood(JSON.parse(value)); } catch { return null; }
}
