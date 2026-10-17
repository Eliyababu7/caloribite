import assert from "node:assert/strict";
import { test } from "node:test";
import { isProductCode, validateFoodSearchRequest } from "../validation.ts";
import { PRODUCT_CODE } from "./openFoodFactsFixtures.ts";

test("OFF search trims text, caps at ten, fixes page one and discards unknown fields", () => {
  const input = { provider: "open-food-facts", action: "search", query: "  oat bites  ", pageSize: 100, page: 9, url: "https://invalid.example" };
  const original = structuredClone(input);
  assert.deepEqual(validateFoodSearchRequest(input), { ok: true, value: { provider: "open-food-facts", action: "search", query: "oat bites", pageSize: 10 } });
  assert.deepEqual(input, original);
});

test("OFF search defaults to ten and retains a smaller requested page size", () => {
  for (const pageSize of [undefined, 1, 5, 10]) {
    const result = validateFoodSearchRequest({ provider: "open-food-facts", action: "search", query: "oats", pageSize });
    assert.ok(result.ok && result.value.action === "search");
    assert.equal(result.value.pageSize, pageSize ?? 10);
  }
});

test("explicit and implicit USDA retain the original request contract", () => {
  for (const provider of [undefined, "usda"]) {
    assert.deepEqual(validateFoodSearchRequest({ provider, action: "search", query: "rice", pageSize: 100 }), { ok: true, value: { action: "search", query: "rice", pageSize: 25 } });
    assert.deepEqual(validateFoodSearchRequest({ provider, action: "detail", fdcId: 123 }), { ok: true, value: { action: "detail", fdcId: 123 } });
  }
});

test("OFF detail and barcode preserve leading zeroes", () => {
  assert.deepEqual(validateFoodSearchRequest({ provider: "open-food-facts", action: "detail", externalId: PRODUCT_CODE, fdcId: 123 }), { ok: true, value: { provider: "open-food-facts", action: "detail", externalId: PRODUCT_CODE } });
  assert.deepEqual(validateFoodSearchRequest({ provider: "open-food-facts", action: "barcode", barcode: PRODUCT_CODE, externalId: "ignored" }), { ok: true, value: { provider: "open-food-facts", action: "barcode", barcode: PRODUCT_CODE } });
  for (const code of ["00000001", "000000000001", PRODUCT_CODE, "00012345678905"]) assert.equal(isProductCode(code), true);
});

test("rejects invalid, numeric, control-containing and oversized product codes", () => {
  for (const code of [12345678, null, "", "1234567", "123456789", "1".repeat(15), " 0012345678905", "0012345678905\n", "0012345x78905", "../12345678", "1234567\u0000"]) {
    assert.equal(isProductCode(code), false);
    for (const [action, field] of [["detail", "externalId"], ["barcode", "barcode"]]) {
      assert.equal(validateFoodSearchRequest({ provider: "open-food-facts", action, [field]: code }).ok, false);
    }
  }
});

test("rejects unsupported providers, actions and missing required identifiers", () => {
  for (const provider of [null, "", "USDA", "other", 1, {}]) assert.equal(validateFoodSearchRequest({ provider, action: "search", query: "oats" }).ok, false);
  for (const action of ["write", "delete", "login", null]) assert.equal(validateFoodSearchRequest({ provider: "open-food-facts", action }).ok, false);
  assert.equal(validateFoodSearchRequest({ action: "barcode", barcode: PRODUCT_CODE }).ok, false);
  assert.equal(validateFoodSearchRequest({ provider: "open-food-facts", action: "detail", fdcId: 123 }).ok, false);
});

test("rejects query bounds, controls and invalid page sizes for both providers", () => {
  for (const provider of ["usda", "open-food-facts"]) {
    for (const query of [" ", " x ", "x".repeat(121), "oa\u0000ts", "oats\n", "oa\tts", "oa\u007fts", "oa\u0085ts"]) assert.equal(validateFoodSearchRequest({ provider, action: "search", query }).ok, false);
    for (const pageSize of [0, -1, 1.5, Infinity, NaN, "5", null, Number.MAX_SAFE_INTEGER + 1]) assert.equal(validateFoodSearchRequest({ provider, action: "search", query: "oats", pageSize }).ok, false);
  }
});
