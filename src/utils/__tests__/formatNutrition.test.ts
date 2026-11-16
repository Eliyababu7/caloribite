import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCalories, formatMacroGrams, formatPercentage } from "../formatNutrition";
import { calculateNutritionTotals, createNutritionSummary } from "../../services/nutrition/nutritionService";
import type { FoodLog } from "../../types/food";

test("calories round only for display, including floating-point artifacts and zero", () => {
  for (const [value, expected] of [[0, "0"], [-0, "0"], [123.49, "123"],
    [123.5, "124"], [1999.9999999999998, "2,000"], [0.1 + 0.2, "0"]] as const) {
    assert.equal(formatCalories(value), expected);
  }
});

test("macro grams have at most one decimal without trailing decimal zeroes", () => {
  for (const [value, expected] of [[0, "0"], [-0, "0"], [10, "10"], [0.1 + 0.2, "0.3"],
    [12.34, "12.3"], [12.35, "12.4"], [9.999999999999998, "10"], [0.04, "0"]] as const) {
    assert.equal(formatMacroGrams(value), expected);
  }
});

test("percentages display whole numbers without changing or clamping the supplied value", () => {
  assert.equal(formatPercentage(0), "0");
  assert.equal(formatPercentage(33.33333333333333), "33");
  assert.equal(formatPercentage(66.66666666666667), "67");
  assert.equal(formatPercentage(125.5), "126");
});

test("large finite values have stable grouped text without scientific notation or decimal artifacts", () => {
  assert.equal(formatCalories(123456789.123456), "123,456,789");
  assert.equal(formatMacroGrams(123456789.123456), "123,456,789.1");
  assert.doesNotMatch(formatCalories(Number.MAX_VALUE), /NaN|Infinity|e\+/);
});

test("missing, non-numeric, non-finite and negative nutrition is unavailable, never zero", () => {
  for (const value of [null, undefined, NaN, Infinity, -Infinity, -1, "", "0", false, {}, []]) {
    for (const format of [formatCalories, formatMacroGrams, formatPercentage]) {
      assert.equal(format(value), "Unavailable");
    }
  }
});

test("formatting never changes source precision or remaining/over-target calculations", () => {
  const foods = [0.1, 0.2].map(value => Object.freeze({ calories: value, protein: value,
    carbs: value, fat: value })) as FoodLog[];
  const totals = calculateNutritionTotals(foods);
  const targets = { calories: 0.5, protein: 1, carbs: 1, fat: 1 };
  const summary = createNutritionSummary(totals, targets);
  assert.equal(formatMacroGrams(totals.protein), "0.3");
  assert.equal(totals.protein, 0.1 + 0.2);
  assert.equal(summary.remainingCalories, 0.5 - (0.1 + 0.2));
  assert.equal(foods[0].calories, 0.1);
  const over = createNutritionSummary(totals, { ...targets, calories: 0.1 });
  assert.equal(over.remainingCalories, 0);
  assert.equal(over.calorieProgress, 100);
});
