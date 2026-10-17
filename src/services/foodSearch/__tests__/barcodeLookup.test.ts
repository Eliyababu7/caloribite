import assert from "node:assert/strict";
import { test } from "node:test";
import type { FoodSearchResult } from "../../../types/foodSearch";
import { isValidProductBarcode } from "../barcodeValidation";
import { createBarcodeCache } from "../barcodeCache";
import { createBarcodeController, type BarcodeState } from "../barcodeController";
import { createFoodSearchService, FoodSearchError } from "../foodSearchService";
import { deserializeFoodResult, serializeFoodResult } from "../foodResultTransport";
import { initialFoodServing, recalculateFoodInputs } from "../confirmationNutrition";
import { isProductCode } from "../../../../supabase/functions/food-search/validation";

const CODE = "0012345678905";
function product(code = CODE): FoodSearchResult {
  return { source: "open-food-facts", externalId: code, barcode: code, name: "Synthetic cereal", brand: "Fixture Foods", nutritionPer100g: { calories: 200, protein: 5, carbs: null, fat: 0 }, servingOptions: [{ id: "serving", label: "30 g", grams: 30 }], defaultServingId: "serving", attributionLabel: "Open Food Facts (ODbL)" };
}
const kind = (expected: string) => (error: unknown) => error instanceof FoodSearchError && error.kind === expected;

test("app barcode validation matches the deployed contract and preserves zeroes", () => {
  for (const code of ["00000001", "000000000001", CODE, "00012345678905", "", "1234567", "123456789", "1".repeat(15), "12345678\n", " 12345678", "1234567x", "\uff11\uff12\uff13\uff14\uff15\uff16\uff17\uff18", 12345678, null, undefined]) {
    assert.equal(isValidProductBarcode(code), isProductCode(code));
  }
  assert.equal(isValidProductBarcode(CODE), true);
});

test("barcode uses only the explicit OFF action through the existing invocation seam", async () => {
  let calls = 0;
  const service = createFoodSearchService(async (body, signal) => {
    calls++;
    assert.deepEqual(body, { provider: "open-food-facts", action: "barcode", barcode: CODE });
    assert.ok(signal instanceof AbortSignal);
    assert.deepEqual(Object.keys(body).sort(), ["action", "barcode", "provider"]);
    return { data: { result: product() }, error: null };
  });
  const result = await service.barcode(CODE);
  assert.equal(result.barcode, CODE);
  assert.equal(result.externalId, CODE);
  assert.equal(calls, 1);
});

test("invalid barcode input never invokes the function", async () => {
  let calls = 0;
  const service = createFoodSearchService(async () => { calls++; return { data: null, error: null }; });
  for (const code of ["", "123", " 12345678", "12345678\n", "123456789", "1".repeat(15)]) await assert.rejects(service.barcode(code), kind("invalid-barcode"));
  assert.equal(calls, 0);
});

test("normal text search remains USDA-only and rejects OFF results", async () => {
  let calls = 0;
  const service = createFoodSearchService(async (body) => {
    calls++;
    assert.deepEqual(body, { action: "search", query: "banana", pageSize: 10 });
    return { data: { results: [product()] }, error: null };
  });
  await assert.rejects(service.search("banana"), kind("provider-error"));
  assert.equal(calls, 1);
});

test("USDA detail cannot accept a product from another provider", async () => {
  const service = createFoodSearchService(async () => ({ data: { result: product("12345678") }, error: null }));
  await assert.rejects(service.detail("12345678"), kind("provider-error"));
});

test("barcode response validation rejects mismatched identity, provider and malformed nutrition", async () => {
  for (const data of [null, {}, { result: null }, { result: { ...product(), source: "usda" } }, { result: { ...product(), barcode: "12345678" } }, { result: { ...product(), externalId: "12345678" } }, { result: { ...product(), nutritionPer100g: {} } }, { result: { ...product(), name: "" } }]) {
    const service = createFoodSearchService(async () => ({ data, error: null }));
    await assert.rejects(service.barcode(CODE), kind("provider-error"));
  }
});

test("OFF transport preserves serving data, nullable nutrition and attribution while discarding raw fields", () => {
  const input = { ...product(), image_url: "private-image", sourceUrl: "javascript:invalid", raw: "discarded" };
  const serialized = serializeFoodResult(input);
  assert.ok(serialized);
  const result = deserializeFoodResult(serialized)!;
  assert.equal(result.source, "open-food-facts");
  assert.equal(result.externalId, CODE);
  assert.equal(result.barcode, CODE);
  assert.equal(result.sourceUrl, `https://world.openfoodfacts.org/product/${CODE}`);
  assert.equal(result.attributionLabel, "Open Food Facts (ODbL)");
  assert.deepEqual(result.servingOptions, input.servingOptions);
  assert.equal(result.defaultServingId, "serving");
  assert.equal(result.nutritionPer100g.carbs, null);
  assert.equal(result.nutritionPer100g.fat, 0);
  assert.equal(serialized.includes("private-image"), false);
  assert.equal(serialized.includes("discarded"), false);
});

test("OFF route validation and serialization limits remain enforced", async () => {
  assert.equal(deserializeFoodResult(JSON.stringify({ ...product(), barcode: "12345678" })), null);
  const huge = { ...product(), servingOptions: Array.from({ length: 20 }, (_, i) => ({ id: String(i), label: String(i) + "\u00e9".repeat(198), grams: 30 })) };
  assert.equal(serializeFoodResult(huge), null);
  const service = createFoodSearchService(async () => ({ data: { result: huge }, error: null }));
  await assert.rejects(service.barcode(CODE), kind("provider-error"));
});

for (const [status, expected] of [[404, "not-found"], [429, "rate-limited"], [503, "provider-unavailable"], [401, "unauthorized"], [403, "unauthorized"], [504, "timeout"], [502, "provider-error"]] as const) {
  test(`barcode HTTP ${status} is sanitized as ${expected}`, async () => {
    const service = createFoodSearchService(async () => ({ data: "private upstream data", error: { context: { status, json: () => { throw new Error("must not read body"); } }, message: "private headers and token" } }));
    await assert.rejects(service.barcode(CODE), (error: unknown) => {
      assert.ok(error instanceof FoodSearchError);
      assert.equal(error.kind, expected);
      assert.equal(error.message.includes("private"), false);
      return true;
    });
  });
}

test("offline barcode lookup and thrown exceptions produce safe errors", async () => {
  let called = false;
  const offline = createFoodSearchService(async () => { called = true; return { data: null, error: null }; }, async () => false);
  await assert.rejects(offline.barcode(CODE), kind("offline"));
  assert.equal(called, false);
  const failed = createFoodSearchService(async () => { throw new Error("private URL"); });
  await assert.rejects(failed.barcode(CODE), kind("provider-error"));
});

test("hanging barcode lookup observes the existing finite deadline", async () => {
  let signal: AbortSignal | undefined;
  const service = createFoodSearchService(async (_body, currentSignal) => { signal = currentSignal; return new Promise(() => {}); }, async () => true, 5);
  await assert.rejects(service.barcode(CODE), kind("timeout"));
  assert.equal(signal?.aborted, true);
});

test("successful barcode products are cached and clones protect against manual edits", async () => {
  let calls = 0;
  const service = createFoodSearchService(async () => { calls++; return { data: { result: product() }, error: null }; });
  const first = await service.barcode(CODE);
  first.name = "Edited"; first.nutritionPer100g.calories = 999; first.servingOptions[0].grams = 999;
  const second = await service.barcode(CODE);
  assert.equal(calls, 1);
  assert.equal(second.name, "Synthetic cereal");
  assert.equal(second.nutritionPer100g.calories, 200);
  assert.equal(second.servingOptions[0].grams, 30);
});

test("cache expires by injected time and evicts least recently used entries", () => {
  let now = 0;
  const cache = createBarcodeCache(() => now, 2, 100);
  cache.set(CODE, product()); cache.set("12345678", product("12345678"));
  assert.ok(cache.get(CODE));
  cache.set("123456789012", product("123456789012"));
  assert.equal(cache.get("12345678"), null);
  assert.ok(cache.get(CODE));
  now = 100;
  assert.equal(cache.get(CODE), null);
  assert.equal(cache.get("123456789012"), null);
});

test("cache bounds, invalid products and clearing are enforced", () => {
  assert.throws(() => createBarcodeCache(Date.now, 21));
  assert.throws(() => createBarcodeCache(Date.now, 0));
  assert.throws(() => createBarcodeCache(Date.now, 20, 300001));
  const cache = createBarcodeCache();
  cache.set(CODE, { ...product(), barcode: "12345678" });
  assert.equal(cache.get(CODE), null);
  cache.set(CODE, product()); cache.clear();
  assert.equal(cache.get(CODE), null);
});

test("expired service cache fetches again and failures are never cached", async () => {
  let now = 0;
  let calls = 0;
  const service = createFoodSearchService(async () => {
    calls++;
    return calls === 1 ? { data: null, error: { context: { status: 404 } } } : { data: { result: product() }, error: null };
  }, async () => true, 15000, createBarcodeCache(() => now, 2, 100));
  await assert.rejects(service.barcode(CODE), kind("not-found"));
  await service.barcode(CODE); await service.barcode(CODE);
  assert.equal(calls, 2);
  now = 100; await service.barcode(CODE);
  assert.equal(calls, 3);
});

test("simultaneous duplicate barcode lookups share one invocation", async () => {
  let resolve!: (value: { data: unknown; error: null }) => void;
  let calls = 0;
  const service = createFoodSearchService(async () => { calls++; return new Promise((done) => { resolve = done; }); });
  const first = service.barcode(CODE); const second = service.barcode(CODE);
  await Promise.resolve(); resolve({ data: { result: product() }, error: null });
  const firstProduct = await first;
  assert.equal(firstProduct.barcode, CODE);
  firstProduct.name = "Edited duplicate";
  const secondProduct = await second;
  assert.equal(secondProduct.barcode, CODE);
  assert.equal(secondProduct.name, "Synthetic cereal");
  assert.equal(calls, 1);
});

test("clearing during an in-flight lookup prevents stale cache repopulation", async () => {
  let resolve!: (value: { data: unknown; error: null }) => void;
  let calls = 0;
  const service = createFoodSearchService(async () => {
    calls++;
    if (calls === 1) return new Promise((done) => { resolve = done; });
    return { data: { result: product() }, error: null };
  });
  const first = service.barcode(CODE); await Promise.resolve();
  service.clearBarcodeCache(); resolve({ data: { result: product() }, error: null }); await first;
  await service.barcode(CODE);
  assert.equal(calls, 2);
});

test("typing alone never invokes barcode lookup", async () => {
  let calls = 0;
  const states: BarcodeState[] = [];
  const controller = createBarcodeController({ barcode: async () => { calls++; return product(); } }, (state) => states.push(state));
  controller.setBarcode("0"); controller.setBarcode("001"); controller.setBarcode(CODE);
  assert.equal(calls, 0);
  assert.equal(states.at(-1)?.status, "idle");
  await controller.submit();
  assert.equal(calls, 1);
  assert.equal(states.at(-1)?.status, "result");
});

test("controller prevents duplicate submissions and ignores results for edited barcodes", async () => {
  let resolve!: (food: FoodSearchResult) => void;
  let calls = 0;
  const states: BarcodeState[] = [];
  const controller = createBarcodeController({ barcode: async () => { calls++; return new Promise((done) => { resolve = done; }); } }, (state) => states.push(state));
  controller.setBarcode(CODE);
  const pending = controller.submit(); await controller.submit();
  assert.equal(calls, 1);
  controller.setBarcode("12345678");
  const count = states.length;
  resolve(product()); await pending;
  assert.equal(states.length, count);
  assert.equal(states.at(-1)?.product, null);
});

test("a newer barcode result cannot be overwritten by an old completion", async () => {
  let resolve!: (food: FoodSearchResult) => void;
  const states: BarcodeState[] = [];
  const controller = createBarcodeController({ barcode: async (code) => code === CODE ? new Promise((done) => { resolve = done; }) : product(code) }, (state) => states.push(state));
  controller.setBarcode(CODE); const old = controller.submit();
  controller.setBarcode("12345678"); await controller.submit();
  resolve(product()); await old;
  assert.equal(states.at(-1)?.product?.barcode, "12345678");
});

test("invalidating the controller ignores stale errors and retry remains explicit", async () => {
  let reject!: (error: unknown) => void;
  const states: BarcodeState[] = [];
  const controller = createBarcodeController({ barcode: async () => new Promise((_done, fail) => { reject = fail; }) }, (state) => states.push(state));
  controller.setBarcode(CODE); const old = controller.submit();
  controller.invalidate(); const count = states.length;
  reject(new FoodSearchError("rate-limited")); await old;
  assert.equal(states.length, count);
});

test("OFF serving and nutrition data still initialize editable confirmation totals", () => {
  const food = deserializeFoodResult(serializeFoodResult(product()))!;
  assert.deepEqual(initialFoodServing(food), { servingId: "serving", grams: "30", quantity: "1" });
  assert.deepEqual(recalculateFoodInputs(food, "50", "2"), { calories: "200", protein: "5", carbs: "", fat: "0" });
});
