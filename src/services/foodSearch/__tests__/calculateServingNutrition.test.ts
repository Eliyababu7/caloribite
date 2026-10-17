import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { NutritionPer100g } from "../../../types/foodSearch";
import { calculateServingNutrition } from "../calculateServingNutrition";

const nutrition: NutritionPer100g = {
  calories: 200,
  protein: 10,
  carbs: 25,
  fat: 5,
};

describe("calculateServingNutrition", () => {
  test("calculates a 100-gram serving", () => {
    assert.deepEqual(calculateServingNutrition(nutrition, 100, 1), nutrition);
  });

  test("calculates a partial serving", () => {
    assert.deepEqual(calculateServingNutrition(nutrition, 50, 1), {
      calories: 100,
      protein: 5,
      carbs: 12.5,
      fat: 2.5,
    });
  });

  test("calculates multiple servings", () => {
    assert.deepEqual(calculateServingNutrition(nutrition, 75, 2), {
      calories: 300,
      protein: 15,
      carbs: 37.5,
      fat: 7.5,
    });
  });

  test("supports decimal quantities and rounds to two decimal places", () => {
    assert.deepEqual(
      calculateServingNutrition(
        { calories: 123.456, protein: 5.555, carbs: 10.999, fat: 0.02 },
        33.3,
        1.5,
      ),
      {
        calories: 61.67,
        protein: 2.77,
        carbs: 5.49,
        fat: 0.01,
      },
    );
  });

  test("keeps missing nutrients null", () => {
    assert.deepEqual(
      calculateServingNutrition(
        { calories: 100, protein: null, carbs: 0, fat: null },
        50,
        1,
      ),
      { calories: 50, protein: null, carbs: 0, fat: null },
    );
  });

  test("preserves explicitly reported zero nutrients", () => {
    assert.deepEqual(
      calculateServingNutrition(
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
        25,
        2,
      ),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  });

  for (const [index, quantity] of [
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "2",
  ].entries()) {
    test(`rejects invalid quantity (case ${index + 1})`, () => {
      assert.equal(
        calculateServingNutrition(nutrition, 100, quantity as number),
        null,
      );
    });
  }

  for (const [index, servingGrams] of [
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "100",
  ].entries()) {
    test(`rejects invalid serving grams (case ${index + 1})`, () => {
      assert.equal(
        calculateServingNutrition(nutrition, servingGrams as number, 1),
        null,
      );
    });
  }

  test("returns null nutrients instead of non-finite overflow values", () => {
    assert.deepEqual(
      calculateServingNutrition(
        { calories: Number.MAX_VALUE, protein: 1, carbs: 2, fat: 3 },
        Number.MAX_VALUE,
        Number.MAX_VALUE,
      ),
      { calories: null, protein: null, carbs: null, fat: null },
    );
  });

  test("does not mutate the source nutrition object", () => {
    const source = { ...nutrition };

    calculateServingNutrition(source, 25, 2);

    assert.deepEqual(source, nutrition);
  });
});
