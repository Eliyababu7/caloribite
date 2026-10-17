import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { massToGrams, normalizeUsdaFood } from "../normalizeUsdaFood.ts";

function foundationFood() {
  return {
    fdcId: 123456,
    dataType: "Foundation",
    description: "  Plain rice  ",
    foodNutrients: [
      {
        nutrientId: 1008,
        nutrientName: "Energy",
        unitName: "kcal",
        value: 130,
      },
      { nutrientId: 1003, nutrientName: "Protein", unitName: "g", value: 2.7 },
      {
        nutrientId: 1005,
        nutrientName: "Carbohydrate, by difference",
        unitName: "g",
        value: 28.2,
      },
      {
        nutrientId: 1004,
        nutrientName: "Total lipid (fat)",
        unitName: "g",
        value: 0.3,
      },
    ],
    foodPortions: [
      { portionDescription: "1 cup", gramWeight: 158 },
      { portionDescription: "volume only", gramWeight: null },
    ],
  };
}

describe("normalizeUsdaFood", () => {
  test("normalizes supported Foundation nutrients by stable nutrient IDs", () => {
    assert.deepEqual(normalizeUsdaFood(foundationFood()), {
      source: "usda",
      externalId: "123456",
      name: "Plain rice",
      nutritionPer100g: {
        calories: 130,
        protein: 2.7,
        carbs: 28.2,
        fat: 0.3,
      },
      servingOptions: [
        { id: "usda-123456-portion-0", label: "1 cup", grams: 158 },
      ],
      attributionLabel: "FoodData Central, U.S. Department of Agriculture",
      sourceUrl: "https://fdc.nal.usda.gov/food-details/123456/nutrients",
    });
  });

  test("selects nutrient IDs rather than relying on display names", () => {
    const food = {
      ...foundationFood(),
      foodNutrients: [
        { nutrientId: 9999, nutrientName: "Protein", unitName: "g", value: 99 },
        {
          nutrientId: 1003,
          nutrientName: "Other label",
          unitName: "g",
          value: 4,
        },
        {
          nutrientId: 1008,
          nutrientName: "Energy",
          unitName: "kcal",
          value: 50,
        },
        { nutrientId: 1005, nutrientName: "Carbs", unitName: "g", value: 6 },
        { nutrientId: 1004, nutrientName: "Fat", unitName: "g", value: 7 },
      ],
    };

    assert.equal(normalizeUsdaFood(food)?.nutritionPer100g.protein, 4);
  });

  test("does not reinterpret kilojoules as kilocalories", () => {
    const food = {
      ...foundationFood(),
      foodNutrients: [
        { nutrientId: 1008, unitName: "kJ", value: 500 },
        { nutrientId: 1062, unitName: "kJ", value: 500 },
        { nutrientId: 1003, unitName: "g", value: 1 },
        { nutrientId: 1005, unitName: "g", value: 2 },
        { nutrientId: 1004, unitName: "g", value: 3 },
      ],
    };

    assert.equal(normalizeUsdaFood(food)?.nutritionPer100g.calories, null);
  });

  test("keeps missing, malformed, negative, NaN, and infinite values null", () => {
    const food = {
      ...foundationFood(),
      foodNutrients: [
        { nutrientId: 1008, unitName: "kcal", value: "bad" },
        { nutrientId: 1003, unitName: "g", value: -1 },
        { nutrientId: 1005, unitName: "g", value: Number.NaN },
        { nutrientId: 1004, unitName: "g", value: Number.POSITIVE_INFINITY },
      ],
    };

    assert.deepEqual(normalizeUsdaFood(food)?.nutritionPer100g, {
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
    });
  });

  test("preserves explicit zero nutrients", () => {
    const food = {
      ...foundationFood(),
      foodNutrients: [
        { nutrientId: 1008, unitName: "kcal", value: 0 },
        { nutrientId: 1003, unitName: "g", value: 0 },
        { nutrientId: 1005, unitName: "g", value: 0 },
        { nutrientId: 1004, unitName: "g", value: 0 },
      ],
    };

    assert.deepEqual(normalizeUsdaFood(food)?.nutritionPer100g, {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  test("keeps branded USDA nutrients per 100 g independently of serving size", () => {
    const food = {
      fdcId: 321,
      dataType: "Branded",
      description: "Packaged food",
      brandOwner: "Example",
      servingSize: 50,
      servingSizeUnit: "g",
      foodNutrients: [
        { nutrientId: 1008, unitName: "kcal", value: 100 },
        { nutrientId: 1003, unitName: "g", value: 10 },
        { nutrientId: 1005, unitName: "g", value: 15 },
        { nutrientId: 1004, unitName: "g", value: 2 },
      ],
    };

    const result = normalizeUsdaFood(food);
    assert.equal(result?.brand, "Example");
    assert.deepEqual(result?.nutritionPer100g, {
      calories: 100,
      protein: 10,
      carbs: 15,
      fat: 2,
    });
    assert.deepEqual(result?.servingOptions, [
      { id: "usda-321-label-serving", label: "50 g", grams: 50 },
    ]);
    assert.equal(result?.defaultServingId, "usda-321-label-serving");
  });

  test("leaves branded nutrients null when a mass basis cannot be established", () => {
    const result = normalizeUsdaFood({
      fdcId: 321,
      dataType: "Branded",
      description: "Packaged food",
      foodNutrients: [{ nutrientId: 1008, unitName: "kcal", value: 100 }],
    });

    assert.deepEqual(result?.nutritionPer100g, {
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
    });
  });

  test("converts supported mass units to grams", () => {
    assert.equal(massToGrams(250, "g"), 250);
    assert.equal(massToGrams(0.5, "kilograms"), 500);
    assert.equal(massToGrams(500_000, "mg"), 500);
    assert.equal(massToGrams(2, "oz"), 56.69904625);
  });

  test("does not convert volume or household serving units", () => {
    assert.equal(massToGrams(1, "mL"), null);
    assert.equal(massToGrams(1, "cup"), null);
    assert.equal(massToGrams(1, "piece"), null);
    assert.equal(massToGrams(0, "g"), null);
  });

  test("rejects malformed foods and does not mutate input", () => {
    assert.equal(normalizeUsdaFood({ fdcId: -1, description: "Food" }), null);
    assert.equal(normalizeUsdaFood({ fdcId: 1, description: "  " }), null);

    const input = foundationFood();
    const original = structuredClone(input);
    normalizeUsdaFood(input);
    assert.deepEqual(input, original);
  });
});

test("normalizes nested USDA detail nutrients and leaves unknown bases null", () => {
  const food = {
    ...foundationFood(),
    foodNutrients: [
      { nutrient: { id: 1008, unitName: "kcal" }, amount: 0 },
      { nutrient: { id: 1003, unitName: "mg" }, amount: 2500 },
    ],
  };
  assert.deepEqual(normalizeUsdaFood(food)?.nutritionPer100g, {
    calories: 0, protein: 2.5, carbs: null, fat: null,
  });
  assert.deepEqual(normalizeUsdaFood({ ...food, dataType: "unknown" })?.nutritionPer100g, {
    calories: null, protein: null, carbs: null, fat: null,
  });
});

test("creates branded servings only for supported mass equivalents", () => {
  for (const [unit, amount, grams] of [["g", 20, 20], ["kg", 0.2, 200], ["mg", 200, 0.2], ["oz", 1, 28.349523125]] as const) {
    const result = normalizeUsdaFood({ ...foundationFood(), dataType: "Branded", servingSize: amount, servingSizeUnit: unit });
    assert.equal(result?.servingOptions[0].grams, grams);
  }
  for (const unit of ["mL", "cup", "piece", "unknown"]) {
    const result = normalizeUsdaFood({ ...foundationFood(), foodPortions: [], dataType: "Branded", servingSize: 10, servingSizeUnit: unit });
    assert.deepEqual(result?.servingOptions, []);
    assert.equal(result?.defaultServingId, undefined);
    assert.deepEqual(result?.nutritionPer100g, { calories: null, protein: null, carbs: null, fat: null });
  }
});
