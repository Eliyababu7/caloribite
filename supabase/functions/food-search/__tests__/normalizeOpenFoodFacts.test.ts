import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOpenFoodFacts } from "../normalizeOpenFoodFacts.ts";
import { openFoodFactsProduct, PRODUCT_CODE } from "./openFoodFactsFixtures.ts";

const emptyNutrition = { calories: null, protein: null, carbs: null, fat: null };

test("normalizes OFF identity, kcal, macros, attribution and one canonical mass serving", () => {
  assert.deepEqual(normalizeOpenFoodFacts(openFoodFactsProduct()), {
    source: "open-food-facts", externalId: PRODUCT_CODE, barcode: PRODUCT_CODE,
    name: "Synthetic oat bites", brand: "Fixture Foods",
    nutritionPer100g: { calories: 165, protein: 5, carbs: 25, fat: 0 },
    servingOptions: [{ id: `off-${PRODUCT_CODE}-serving`, label: "30 g", grams: 30 }],
    defaultServingId: `off-${PRODUCT_CODE}-serving`,
    attributionLabel: "Open Food Facts (ODbL)",
    sourceUrl: `https://world.openfoodfacts.org/product/${PRODUCT_CODE}`,
  });
});

test("does not mutate input or return images and unknown provider properties", () => {
  const input = { ...openFoodFactsProduct(), image_url: "https://invalid.example/image", private: "discarded" };
  const original = structuredClone(input);
  const result = normalizeOpenFoodFacts(input);
  assert.deepEqual(input, original);
  assert.equal(JSON.stringify(result).includes("invalid.example"), false);
  assert.equal(JSON.stringify(result).includes("discarded"), false);
});

test("handles missing names, language fallback and malformed products", () => {
  for (const input of [null, [], {}, { ...openFoodFactsProduct(), code: 12345678 }, { ...openFoodFactsProduct(), product_name: " " }, { ...openFoodFactsProduct(), product_name: "a".repeat(301) }]) assert.equal(normalizeOpenFoodFacts(input), null);
  const english = normalizeOpenFoodFacts({ ...openFoodFactsProduct(), product_name: "", product_name_en: "English fixture", brands: "b".repeat(201) });
  assert.equal(english?.name, "English fixture");
  assert.equal(english?.brand, undefined);
});

test("never treats kJ or generic energy values as kcal", () => {
  const result = normalizeOpenFoodFacts({ ...openFoodFactsProduct(), nutriments: { energy_100g: 690, "energy-kj_100g": 690, energy_unit: "kcal" } });
  assert.deepEqual(result?.nutritionPer100g, emptyNutrition);
  assert.equal(normalizeOpenFoodFacts({ ...openFoodFactsProduct(), nutriments: { "energy-kcal_100g": 165, "energy-kcal_unit": "kJ" } })?.nutritionPer100g.calories, null);
});

test("missing, invalid, negative, infinite and ambiguous nutrients remain null", () => {
  for (const value of [undefined, null, "5", -1, Infinity, NaN, {}, []]) {
    const input = { ...openFoodFactsProduct(), nutriments: { "energy-kcal_100g": value, proteins_100g: value, carbohydrates_100g: value, fat_100g: value } };
    assert.deepEqual(normalizeOpenFoodFacts(input)?.nutritionPer100g, emptyNutrition);
  }
  for (const modifier of ["<", ">", "~", "-", 1]) assert.equal(normalizeOpenFoodFacts({ ...openFoodFactsProduct(), nutriments: { proteins_100g: 5, proteins_modifier: modifier } })?.nutritionPer100g.protein, null);
});

test("preserves explicit zero and ignores raw-unit metadata for standardized mass fields", () => {
  const input = { ...openFoodFactsProduct(), nutriments: { "energy-kcal_100g": 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0, proteins_unit: "mg" } };
  assert.deepEqual(normalizeOpenFoodFacts(input)?.nutritionPer100g, { calories: 0, protein: 0, carbs: 0, fat: 0 });
});

test("converts explicit per-serving nutrition only with a reliable declared gram serving", () => {
  const input = { ...openFoodFactsProduct(), serving_quantity: 25, serving_size: "25 g", nutrition_data_per: "serving", nutriments: { "energy-kcal_serving": 40, proteins_serving: 2, carbohydrates_serving: 4, fat_serving: 0 } };
  assert.deepEqual(normalizeOpenFoodFacts(input)?.nutritionPer100g, { calories: 160, protein: 8, carbs: 16, fat: 0 });
  assert.deepEqual(normalizeOpenFoodFacts({ ...input, nutrition_data_per: undefined })?.nutritionPer100g, emptyNutrition);
  assert.deepEqual(normalizeOpenFoodFacts({ ...input, serving_quantity_unit: undefined, serving_size: "1 piece" })?.nutritionPer100g, emptyNutrition);
});

test("per-100-g data takes precedence and invalid values are never patched from servings", () => {
  const result = normalizeOpenFoodFacts({ ...openFoodFactsProduct(), nutrition_data_per: "serving", nutriments: { "energy-kcal_100g": 0, "energy-kcal_serving": 30, proteins_100g: -1, proteins_serving: 5 } });
  assert.equal(result?.nutritionPer100g.calories, 0);
  assert.equal(result?.nutritionPer100g.protein, null);
});

test("does not produce non-finite serving conversions", () => {
  assert.equal(normalizeOpenFoodFacts({ ...openFoodFactsProduct(), nutrition_data_per: "serving", nutriments: { "energy-kcal_serving": Number.MAX_VALUE } })?.nutritionPer100g.calories, null);
});

test("accepts explicit gram text or gram quantities without duplicating servings", () => {
  for (const input of [
    { ...openFoodFactsProduct(), serving_quantity: "30", serving_size: undefined },
    { ...openFoodFactsProduct(), serving_quantity: undefined, serving_quantity_unit: undefined, serving_size: "30 grams" },
    { ...openFoodFactsProduct(), serving_quantity: undefined, serving_quantity_unit: undefined, serving_size: "1 bar (30 g)" },
  ]) {
    const result = normalizeOpenFoodFacts(input);
    assert.equal(result?.servingOptions.length, 1);
    assert.equal(result?.servingOptions[0].grams, 30);
  }
});

test("never infers servings from volumes, counts, packs, unknown units or package weight", () => {
  for (const unit of ["ml", "cup", "piece", "pack", "unknown"]) {
    const result = normalizeOpenFoodFacts({ ...openFoodFactsProduct(), serving_quantity: 30, serving_quantity_unit: unit, serving_size: `1 ${unit}` });
    assert.deepEqual(result?.servingOptions, []);
    assert.equal(result?.defaultServingId, undefined);
  }
  const packageOnly = normalizeOpenFoodFacts({ code: PRODUCT_CODE, product_name: "Packaged fixture", quantity: "500 g", product_quantity: 500, product_quantity_unit: "g", serving_quantity: 30 });
  assert.deepEqual(packageOnly?.servingOptions, []);
});

test("conflicting or malformed serving weights are discarded", () => {
  for (const overrides of [{ serving_quantity: 40 }, { serving_quantity: 0 }, { serving_quantity: -1 }, { serving_quantity: Infinity }, { serving_quantity: "bad" }, { serving_quantity: "30\n" }, { serving_size: "250 ml" }, { serving_size: "250 millilitres" }, { serving_size: "30 g".repeat(100), serving_quantity: undefined, serving_quantity_unit: undefined }]) {
    assert.deepEqual(normalizeOpenFoodFacts({ ...openFoodFactsProduct(), ...overrides })?.servingOptions, []);
  }
});

test("declared volume bases and unavailable nutrition are not presented per 100 grams", () => {
  for (const overrides of [{ product_quantity_unit: "ml" }, { serving_quantity_unit: "ml" }, { serving_size: "250 ml" }, { serving_size: "250 millilitres" }, { nutrition_data_per: "100ml" }, { no_nutrition_data: "on" }]) assert.deepEqual(normalizeOpenFoodFacts({ ...openFoodFactsProduct(), ...overrides })?.nutritionPer100g, emptyNutrition);
});
