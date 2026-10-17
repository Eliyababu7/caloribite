import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { FoodSearchResult } from "../../../types/foodSearch";
import { normalizeFoodResult } from "../normalizeFoodResult";

function validInput(): Record<string, unknown> {
  return {
    source: "usda",
    externalId: "  12345  ",
    name: "  Cooked rice  ",
    brand: "  Example brand  ",
    barcode: "  0123456789012  ",
    nutritionPer100g: {
      calories: 130,
      protein: 2.7,
      carbs: 28.2,
      fat: 0.3,
    },
    servingOptions: [
      { id: "  cup  ", label: "  1 cup  ", grams: 158 },
      { id: "  tablespoon  ", label: "  1 tablespoon  ", grams: 15 },
    ],
    defaultServingId: "  cup  ",
    attributionLabel: "  FoodData Central  ",
    sourceUrl: "  https://example.test/food/12345  ",
  };
}

describe("normalizeFoodResult", () => {
  test("normalizes a valid result and trims text fields", () => {
    assert.deepEqual(normalizeFoodResult(validInput()), {
      source: "usda",
      externalId: "12345",
      name: "Cooked rice",
      brand: "Example brand",
      barcode: "0123456789012",
      nutritionPer100g: {
        calories: 130,
        protein: 2.7,
        carbs: 28.2,
        fat: 0.3,
      },
      servingOptions: [
        { id: "cup", label: "1 cup", grams: 158 },
        { id: "tablespoon", label: "1 tablespoon", grams: 15 },
      ],
      defaultServingId: "cup",
      attributionLabel: "FoodData Central",
      sourceUrl: "https://example.test/food/12345",
    });
  });

  for (const [index, name] of ["", "   ", undefined, null, 42].entries()) {
    test(`rejects an empty or invalid food name (${String(name)})`, () => {
      assert.equal(normalizeFoodResult({ ...validInput(), name }), null);
    });
  }

  test("sets missing nutrients to null", () => {
    const result = normalizeFoodResult({
      ...validInput(),
      nutritionPer100g: { calories: 10 },
    }) as FoodSearchResult;

    assert.deepEqual(result.nutritionPer100g, {
      calories: 10,
      protein: null,
      carbs: null,
      fat: null,
    });
  });

  test("preserves explicitly reported zero nutrients", () => {
    const result = normalizeFoodResult({
      ...validInput(),
      nutritionPer100g: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
    }) as FoodSearchResult;

    assert.deepEqual(result.nutritionPer100g, {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  for (const [index, value] of [
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "not a number",
  ].entries()) {
    test(`converts invalid nutrient values to null (case ${index + 1})`, () => {
      const result = normalizeFoodResult({
        ...validInput(),
        nutritionPer100g: {
          calories: value,
          protein: 1,
          carbs: 2,
          fat: 3,
        },
      }) as FoodSearchResult;

      assert.equal(result.nutritionPer100g.calories, null);
      assert.equal(result.nutritionPer100g.protein, 1);
    });
  }

  test("removes serving options with empty labels or invalid gram weights", () => {
    const result = normalizeFoodResult({
      ...validInput(),
      servingOptions: [
        { id: "valid", label: "  1 cup ", grams: 150 },
        { id: "empty-label", label: "  ", grams: 10 },
        { id: "zero", label: "Zero grams", grams: 0 },
        { id: "negative", label: "Negative grams", grams: -2 },
        { id: "nan", label: "NaN grams", grams: Number.NaN },
        { id: "infinite", label: "Infinite grams", grams: Infinity },
        { id: "string", label: "String grams", grams: "10" },
        { id: "   ", label: "Missing ID", grams: 20 },
      ],
    }) as FoodSearchResult;

    assert.deepEqual(result.servingOptions, [
      { id: "valid", label: "1 cup", grams: 150 },
    ]);
  });

  test("removes duplicate serving IDs and duplicate descriptions deterministically", () => {
    const result = normalizeFoodResult({
      ...validInput(),
      servingOptions: [
        { id: "cup", label: "1 cup", grams: 150 },
        { id: "cup", label: "Large cup", grams: 200 },
        { id: "cup-copy", label: "1 CUP", grams: 150 },
        { id: "tablespoon", label: "1 tablespoon", grams: 15 },
      ],
    }) as FoodSearchResult;

    assert.deepEqual(result.servingOptions, [
      { id: "cup", label: "1 cup", grams: 150 },
      { id: "tablespoon", label: "1 tablespoon", grams: 15 },
    ]);
  });

  test("keeps a default serving only when its ID is retained", () => {
    const result = normalizeFoodResult({
      ...validInput(),
      defaultServingId: " missing ",
    }) as FoodSearchResult;

    assert.equal(Object.hasOwn(result, "defaultServingId"), false);
  });

  test("does not invent optional IDs, links, or attribution", () => {
    const result = normalizeFoodResult({
      source: "custom",
      name: "Custom food",
    }) as FoodSearchResult;

    assert.deepEqual(result, {
      source: "custom",
      name: "Custom food",
      nutritionPer100g: {
        calories: null,
        protein: null,
        carbs: null,
        fat: null,
      },
      servingOptions: [],
      attributionLabel: "",
    });
    assert.equal(Object.hasOwn(result, "externalId"), false);
    assert.equal(Object.hasOwn(result, "sourceUrl"), false);
  });

  test("does not mutate its input", () => {
    const input = validInput();
    const original = JSON.parse(JSON.stringify(input)) as typeof input;

    normalizeFoodResult(input);

    assert.deepEqual(input, original);
  });
});
