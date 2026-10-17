import assert from "node:assert/strict";
import { test } from "node:test";
import type { FoodSearchResult } from "../../../types/foodSearch";
import { createFoodSearchService, FoodSearchError, type InvokeFoodSearch } from "../foodSearchService";
import { deserializeFoodResult, serializeFoodResult, validateTransportFood, MAX_FOOD_ROUTE_BYTES } from "../foodResultTransport";
import { initialFoodServing, recalculateFoodInputs } from "../confirmationNutrition";
import { createSearchController, type SearchState } from "../searchController";

function food(): FoodSearchResult {
  return { source: "usda", externalId: "123", name: "Banana", nutritionPer100g: { calories: 89, protein: 1.1, carbs: 23, fat: 0 }, servingOptions: [], attributionLabel: "USDA" };
}
const expectKind = (kind: string) => (error: unknown) => error instanceof FoodSearchError && error.kind === kind;

test("search trims query, requests ten results and does not attach headers", async () => {
  let calls = 0;
  const invoke: InvokeFoodSearch = async (body, signal) => {
    calls++;
    assert.deepEqual(body, { action: "search", query: "banana", pageSize: 10 });
    assert.ok(signal instanceof AbortSignal);
    return { data: { results: [food()] }, error: null };
  };
  const service = createFoodSearchService(invoke);
  assert.equal(calls, 0);
  const results = await service.search("  banana  ");
  assert.equal(calls, 1);
  assert.equal(results[0].nutritionPer100g.fat, 0);
});

test("detail uses a numeric FDC ID and validates matching identity", async () => {
  const service = createFoodSearchService(async (body) => {
    assert.deepEqual(body, { action: "detail", fdcId: 123 });
    return { data: { result: food() }, error: null };
  });
  assert.equal((await service.detail("123")).name, "Banana");
  const wrong = createFoodSearchService(async () => ({ data: { result: { ...food(), externalId: "124" } }, error: null }));
  await assert.rejects(wrong.detail("123"), expectKind("provider-error"));
});

test("invalid queries and IDs never invoke the function", async () => {
  let calls = 0;
  const service = createFoodSearchService(async () => { calls++; return { data: null, error: null }; });
  for (const query of ["", " x ", "a".repeat(121)]) await assert.rejects(service.search(query), expectKind("invalid-query"));
  for (const id of ["0", "-1", "1.5", "9007199254740992", "not-id"]) await assert.rejects(service.detail(id), expectKind("provider-error"));
  assert.equal(calls, 0);
});

for (const [status, kind] of [[401, "unauthorized"], [403, "unauthorized"], [429, "rate-limited"], [504, "timeout"], [502, "provider-error"], [503, "provider-error"]] as const) {
  test(`maps HTTP ${status} without reading provider error bodies`, async () => {
    const service = createFoodSearchService(async () => ({ data: "private provider body", error: { context: { status, json: () => { throw new Error("must not read"); } }, message: "private token-like text" } }));
    await assert.rejects(service.search("banana"), (error: unknown) => {
      assert.ok(error instanceof FoodSearchError);
      assert.equal(error.kind, kind);
      assert.equal(error.message.includes("private"), false);
      return true;
    });
  });
}

test("offline state skips invocation", async () => {
  let called = false;
  const service = createFoodSearchService(async () => { called = true; return { data: null, error: null }; }, async () => false);
  await assert.rejects(service.search("banana"), expectKind("offline"));
  assert.equal(called, false);
});

test("finite client deadline aborts a hanging invocation", async () => {
  let signal: AbortSignal | undefined;
  const service = createFoodSearchService(async (_body, currentSignal) => { signal = currentSignal; return new Promise(() => {}); }, async () => true, 5);
  await assert.rejects(service.search("banana"), expectKind("timeout"));
  assert.equal(signal?.aborted, true);
});

test("unexpected invocation exceptions are sanitized", async () => {
  const service = createFoodSearchService(async () => { throw new Error("private URL and stack"); });
  await assert.rejects(service.search("banana"), (error: unknown) => {
    assert.ok(error instanceof FoodSearchError);
    assert.equal(error.kind, "provider-error");
    assert.equal(error.message.includes("private"), false);
    return true;
  });
});

test("rejects malformed search envelopes and excessive result counts", async () => {
  for (const data of [null, {}, { results: "bad" }, { results: [null] }, { results: Array.from({ length: 11 }, food) }, { results: [{ ...food(), nutritionPer100g: {} }] }]) {
    const service = createFoodSearchService(async () => ({ data, error: null }));
    await assert.rejects(service.search("banana"), expectKind("provider-error"));
  }
});

test("rejects malformed detail envelopes", async () => {
  for (const data of [null, {}, { result: [] }, { result: { ...food(), source: "custom" } }]) {
    const service = createFoodSearchService(async () => ({ data, error: null }));
    await assert.rejects(service.detail("123"), expectKind("provider-error"));
  }
});

test("serialization whitelists fields and constructs a safe source URL", () => {
  const input = { ...food(), rawProviderPayload: { private: true }, sourceUrl: "javascript:bad" };
  const original = structuredClone(input);
  const encoded = serializeFoodResult(input);
  assert.ok(encoded);
  assert.equal(encoded.includes("rawProviderPayload"), false);
  assert.equal(encoded.includes("javascript:"), false);
  assert.equal(deserializeFoodResult(encoded)?.name, "Banana");
  assert.deepEqual(input, original);
});

test("malformed and oversized route parameters are rejected", () => {
  for (const value of [undefined, [JSON.stringify(food())], "{", "x".repeat(MAX_FOOD_ROUTE_BYTES + 1), JSON.stringify({ ...food(), externalId: "-1" })]) assert.equal(deserializeFoodResult(value), null);
  const hugeFood = { ...food(), servingOptions: Array.from({ length: 20 }, (_, i) => ({ id: `serving-${i}`, label: String(i) + "a".repeat(199), grams: 100 })) };
  assert.equal(serializeFoodResult(hugeFood), null);
  assert.equal(serializeFoodResult({ ...food(), name: "a".repeat(301) }), null);
});

test("route byte limits handle multibyte text", () => {
  const input = { ...food(), servingOptions: Array.from({ length: 16 }, (_, i) => ({ id: `unicode-${i}`, label: String(i) + "\u00e9".repeat(198), grams: 100 })) };
  const raw = JSON.stringify(input);
  assert.ok(raw.length < MAX_FOOD_ROUTE_BYTES);
  assert.equal(serializeFoodResult(input), null);
  assert.equal(deserializeFoodResult(raw), null);
});

test("invalid nutrients and serving records are rejected while null and zero survive", () => {
  for (const calories of [undefined, -1, Infinity, NaN, "89"]) assert.equal(validateTransportFood({ ...food(), nutritionPer100g: { ...food().nutritionPer100g, calories } }), null);
  assert.equal(validateTransportFood({ ...food(), servingOptions: [{ id: "x", label: "cup", grams: 0 }] }), null);
  const result = validateTransportFood({ ...food(), nutritionPer100g: { ...food().nutritionPer100g, protein: null } });
  assert.equal(result?.nutritionPer100g.protein, null);
  assert.equal(result?.nutritionPer100g.fat, 0);
});

test("controller initialization and changing draft text never send a request", async () => {
  let calls = 0;
  const states: SearchState[] = [];
  const controller = createSearchController({ search: async () => { calls++; return []; }, detail: async () => food() }, (state) => states.push(state));
  controller.setQuery("b"); controller.setQuery("ban"); controller.setQuery("banana");
  assert.equal(calls, 0);
  assert.equal(states.length, 0);
  await controller.submit();
  assert.equal(calls, 1);
  assert.equal(states.at(-1)?.status, "empty");
});

test("controller prevents duplicate submissions", async () => {
  let resolve!: (foods: FoodSearchResult[]) => void;
  let calls = 0;
  const controller = createSearchController({ search: () => { calls++; return new Promise((done) => { resolve = done; }); }, detail: async () => food() }, () => {});
  const first = controller.submit("banana");
  await controller.submit("rice");
  assert.equal(calls, 1);
  resolve([food()]); await first;
  assert.equal(controller.isPending(), false);
});

test("invalidated old results cannot replace a newer search", async () => {
  let resolve!: (foods: FoodSearchResult[]) => void;
  const states: SearchState[] = [];
  const controller = createSearchController({ search: async (query) => query === "banana" ? new Promise((done) => { resolve = done; }) : [], detail: async () => food() }, (state) => states.push(state));
  const old = controller.submit("banana");
  controller.invalidate();
  await controller.submit("rice");
  const count = states.length;
  resolve([food()]); await old;
  assert.equal(states.length, count);
  assert.equal(states.at(-1)?.status, "empty");
});

test("controller exposes sanitized errors and allows retry", async () => {
  let calls = 0;
  const states: SearchState[] = [];
  const controller = createSearchController({ search: async () => { if (++calls === 1) throw new FoodSearchError("offline"); return [food()]; }, detail: async () => food() }, (state) => states.push(state));
  await controller.submit("banana");
  assert.equal(states.at(-1)?.status, "offline");
  await controller.submit("banana");
  assert.equal(states.at(-1)?.status, "results");
});

test("confirmation defaults to a valid provider serving and calculates totals", () => {
  const input = { ...food(), servingOptions: [{ id: "small", label: "Small banana", grams: 80 }, { id: "large", label: "Large banana", grams: 120 }], defaultServingId: "large" };
  assert.deepEqual(initialFoodServing(input), { servingId: "large", grams: "120", quantity: "1" });
  assert.deepEqual(recalculateFoodInputs(input, "120", "2"), { calories: "213.6", protein: "2.64", carbs: "55.2", fat: "0" });
});

test("confirmation uses explicit 100 g only with available per-100-g nutrition", () => {
  assert.equal(initialFoodServing(food()).grams, "100");
  const missing = { ...food(), nutritionPer100g: { calories: null, protein: null, carbs: null, fat: null } };
  assert.equal(initialFoodServing(missing).grams, "");
  assert.deepEqual(recalculateFoodInputs(missing, "100", "1"), { calories: "", protein: "", carbs: "", fat: "" });
});

test("confirmation preserves unknown nutrients and rejects invalid servings", () => {
  const input = { ...food(), nutritionPer100g: { ...food().nutritionPer100g, protein: null } };
  assert.deepEqual(recalculateFoodInputs(input, "50", "2"), { calories: "89", protein: "", carbs: "23", fat: "0" });
  for (const grams of ["", "0", "-1", "bad", "Infinity"]) assert.deepEqual(recalculateFoodInputs(input, grams, "1"), { calories: "", protein: "", carbs: "", fat: "" });
});

test("expired connectivity checks cannot send a late request", async () => {
  let resolveOnline!: (online: boolean) => void;
  let called = false;
  const service = createFoodSearchService(async () => { called = true; return { data: { results: [] }, error: null }; }, () => new Promise((done) => { resolveOnline = done; }), 5);
  await assert.rejects(service.search("banana"), expectKind("timeout"));
  resolveOnline(true);
  await new Promise((done) => setImmediate(done));
  assert.equal(called, false);
});
