import type { FoodSearchResult } from "../../types/foodSearch";
import { isValidProductBarcode } from "./barcodeValidation";
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
  if (!record(value) || (value.source !== "usda" && value.source !== "open-food-facts" && value.source !== "custom") ||
    (value.source !== "custom" && !boundedText(value.externalId, 16)) ||
    !boundedText(value.name, 300) || !boundedText(value.brand, 200, true) ||
    !boundedText(value.attributionLabel, 200) ||
    !record(value.nutritionPer100g) || !Array.isArray(value.servingOptions) ||
    value.servingOptions.length > 20) return null;
  const isOpenFoodFacts = value.source === "open-food-facts";
  const isSavedFood = value.source === "custom";
  if (isSavedFood && !boundedText(value.savedForUserId, 128, true)) return null;
  if (isSavedFood && value.localId !== undefined &&
    (typeof value.localId !== "string" || !/^(barcode:\d{8,14}|local:[a-zA-Z0-9-]{1,80})$/.test(value.localId))) return null;
  if (isSavedFood && value.barcode === undefined) {
    if (!value.localId || value.externalId !== undefined) return null;
  } else if (isOpenFoodFacts || isSavedFood) {
    if (!isValidProductBarcode(value.externalId) || value.barcode !== value.externalId) return null;
  } else if (!/^\d+$/.test(String(value.externalId)) ||
    !Number.isSafeInteger(Number(value.externalId)) || Number(value.externalId) <= 0) return null;
  const nutrition = value.nutritionPer100g;
  if (nutrients.some((key) => nutrition[key] !== null &&
    (typeof nutrition[key] !== "number" || !Number.isFinite(nutrition[key]) || nutrition[key] < 0))) return null;
  if (isSavedFood && nutrients.some((key) => nutrition[key] === null)) return null;
  if (value.servingOptions.some((serving) => !record(serving) ||
    !boundedText(serving.id, 100) || !boundedText(serving.label, 200) ||
    typeof serving.grams !== "number" || !Number.isFinite(serving.grams) || serving.grams <= 0)) return null;
  if (!boundedText(value.defaultServingId, 100, true)) return null;
  const externalId = isOpenFoodFacts || isSavedFood ? value.externalId as string | undefined : String(Number(value.externalId));
  const basedOnOpenFoodFacts = isSavedFood && !!value.barcode && String(value.attributionLabel).includes("Open Food Facts");
  const sourceUrl = isOpenFoodFacts || basedOnOpenFoodFacts
    ? `https://world.openfoodfacts.org/product/${externalId}`
    : isSavedFood ? undefined : `https://fdc.nal.usda.gov/food-details/${externalId}/nutrients`;
  const normalized = normalizeFoodResult({
    source: value.source, externalId, name: value.name,
    ...(isOpenFoodFacts || isSavedFood ? { barcode: externalId } : {}),
    ...(isSavedFood && value.savedForUserId ? { savedForUserId: value.savedForUserId } : {}),
    ...(isSavedFood && value.localId ? { localId: value.localId } : {}),
    brand: value.brand, nutritionPer100g: nutrition, servingOptions: value.servingOptions,
    defaultServingId: value.defaultServingId,
    attributionLabel: isSavedFood ? (basedOnOpenFoodFacts ? "Your saved nutrition · Product from Open Food Facts (ODbL)" : "Your saved food")
      : isOpenFoodFacts ? "Open Food Facts (ODbL)" : "FoodData Central, U.S. Department of Agriculture", sourceUrl,
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
