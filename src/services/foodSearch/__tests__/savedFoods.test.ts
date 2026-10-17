import assert from "node:assert/strict";
import { test } from "node:test";
import type { FoodSearchResult } from "../../../types/foodSearch";
import { completeBarcodeNutrition, hasIncompleteNutrition, nutritionInputs, recalculateFoodInputs } from "../confirmationNutrition";
import { createSavedFoodStore, savedFoodsKey } from "../savedFoods";
import { createUserFoodSearchService } from "../userFoodSearchService";
import { createFoodSearchService, FoodSearchError } from "../foodSearchService";
import { deserializeFoodResult, serializeFoodResult } from "../foodResultTransport";
import { createScannerController, type ScannerState } from "../scannerController";

const CODE = "0012345678905";
const inputs = { calories: "200", protein: "5", carbs: "30", fat: "0" };
export function incompleteProduct(): FoodSearchResult {
  return { source: "open-food-facts", externalId: CODE, barcode: CODE, name: "Fixture cereal", brand: "Fixture brand",
    nutritionPer100g: { calories: 200, protein: null, carbs: null, fat: 0 },
    servingOptions: [{ id: "package", label: "Package serving", grams: 30 }], defaultServingId: "package", attributionLabel: "Open Food Facts (ODbL)" };
}
function memoryStorage() {
  const data = new Map<string, string>();
  return { data, getItem: async (key: string) => data.get(key) ?? null, setItem: async (key: string, value: string) => { data.set(key, value); } };
}
const completed = () => completeBarcodeNutrition(incompleteProduct(), inputs)!;

for (const key of ["calories", "protein", "carbs", "fat"] as const) {
  test(`missing ${key} stays null and empty until explicitly entered`, () => {
    const food = { ...completed(), source: "open-food-facts" as const, nutritionPer100g: { ...completed().nutritionPer100g, [key]: null } };
    const transported = deserializeFoodResult(serializeFoodResult(food))!;
    assert.equal(transported.nutritionPer100g[key], null); assert.equal(nutritionInputs(transported.nutritionPer100g)[key], "");
    assert.equal(completeBarcodeNutrition(transported, { ...inputs, [key]: "" }), null);
  });
}

test("incomplete recognized products retain identity, nulls and empty editor fields", () => {
  const food = deserializeFoodResult(serializeFoodResult(incompleteProduct()))!;
  assert.equal(food.name, "Fixture cereal"); assert.equal(food.brand, "Fixture brand"); assert.equal(food.barcode, CODE);
  assert.equal(food.nutritionPer100g.protein, null); assert.equal(food.nutritionPer100g.carbs, null);
  assert.deepEqual(nutritionInputs(food.nutritionPer100g), { calories: "200", protein: "", carbs: "", fat: "0" });
  assert.equal(hasIncompleteNutrition(food), true);
});
test("completed package values preserve genuine zero and leading-zero barcodes through transport", () => {
  const food = deserializeFoodResult(serializeFoodResult(completed()))!;
  assert.equal(food.barcode, CODE); assert.equal(food.externalId, CODE); assert.equal(food.source, "custom");
  assert.equal(food.nutritionPer100g.fat, 0); assert.equal(hasIncompleteNutrition(food), false);
  assert.match(food.attributionLabel, /Your saved nutrition/);
});
for (const value of ["", " ", "-1", "NaN", "Infinity", "no"]) {
  test(`completion rejects missing or invalid per-100-g nutrient ${JSON.stringify(value)}`, () => {
    assert.equal(completeBarcodeNutrition(incompleteProduct(), { ...inputs, protein: value }), null);
    assert.equal(incompleteProduct().nutritionPer100g.protein, null);
  });
}
test("serving totals use completed per-100-g values rather than storing serving totals", () => {
  const food = completed();
  assert.deepEqual(recalculateFoodInputs(food, "30", "2"), { calories: "120", protein: "3", carbs: "18", fat: "0" });
  assert.deepEqual(recalculateFoodInputs(food, "50", "1.5"), { calories: "150", protein: "3.75", carbs: "22.5", fat: "0" });
  assert.equal(food.nutritionPer100g.calories, 200);
});
test("saved foods are isolated by authenticated user storage keys and survive store recreation", async () => {
  const storage = memoryStorage(); const store = createSavedFoodStore(storage);
  await store.save("user-a", completed());
  assert.equal(await store.find("user-b", CODE), null); assert.equal(await store.find("", CODE), null);
  assert.equal((await createSavedFoodStore(storage).find("user-a", CODE))?.barcode, CODE);
  assert.ok(storage.data.has("caloribite_saved_foods:user:user-a"));
  await store.save("user-b", { ...completed(), name: "Other user's food" });
  assert.equal((await store.find("user-a", CODE))?.name, "Fixture cereal");
  assert.equal((await store.find("user-b", CODE))?.name, "Other user's food");
});
test("saving the same barcode updates one record without losing another barcode", async () => {
  const storage = memoryStorage(); const store = createSavedFoodStore(storage);
  await store.save("a", completed());
  await store.save("a", { ...completed(), barcode: "00000001", externalId: "00000001" });
  await store.save("a", { ...completed(), nutritionPer100g: { calories: 210, protein: 6, carbs: 31, fat: 0 } });
  const raw = JSON.parse(storage.data.get(savedFoodsKey("a"))!);
  assert.equal(raw.version, 1); assert.equal(raw.foods.length, 2);
  assert.equal((await store.find("a", CODE))?.nutritionPer100g.calories, 210);
});
test("simultaneous saves for one user do not overwrite each other", async () => {
  const store = createSavedFoodStore(memoryStorage());
  await Promise.all([store.save("a", completed()), store.save("a", { ...completed(), barcode: "00000001", externalId: "00000001" })]);
  assert.ok(await store.find("a", CODE)); assert.ok(await store.find("a", "00000001"));
});
for (const raw of ["{", "null", "[]", '{"version":0,"foods":[]}', '{"version":1,"foods":"bad"}']) {
  test(`corrupt or outdated saved data safely recovers on explicit save: ${raw}`, async () => {
    const storage = memoryStorage(); storage.data.set(savedFoodsKey("a"), raw);
    const store = createSavedFoodStore(storage);
    assert.equal(await store.find("a", CODE), null);
    assert.equal(storage.data.get(savedFoodsKey("a")), raw);
    await store.save("a", completed()); assert.ok(await store.find("a", CODE));
  });
}
test("newer storage is ignored for lookup and protected from overwrite", async () => {
  const storage = memoryStorage(); const raw = JSON.stringify({ version: 2, foods: [completed()] });
  storage.data.set(savedFoodsKey("a"), raw); const store = createSavedFoodStore(storage);
  assert.equal(await store.find("a", CODE), null); await assert.rejects(store.save("a", completed()));
  assert.equal(storage.data.get(savedFoodsKey("a")), raw);
});
test("invalid records are ignored while valid records and zero values survive", async () => {
  const storage = memoryStorage(); storage.data.set(savedFoodsKey("a"), JSON.stringify({ version: 1, foods: [null, incompleteProduct(), completed(), { ...completed(), barcode: 12345678 }] }));
  const store = createSavedFoodStore(storage); assert.equal((await store.find("a", CODE))?.nutritionPer100g.fat, 0);
  await assert.rejects(store.save("a", incompleteProduct()));
  await assert.rejects(store.save("", completed()));
});
test("a record marked for a different account is treated as invalid storage", async () => {
  const storage = memoryStorage();
  storage.data.set(savedFoodsKey("b"), JSON.stringify({ version: 1, foods: [{ ...completed(), savedForUserId: "a" }] }));
  assert.equal(await createSavedFoodStore(storage).find("b", CODE), null);
});
test("local record wins before provider cache, connectivity and remote lookup, including offline", async () => {
  const store = createSavedFoodStore(memoryStorage()); let calls = 0; let connectivity = 0;
  const provider = createFoodSearchService(async () => { calls++; return { data: { result: incompleteProduct() }, error: null }; }, async () => { connectivity++; return true; });
  await provider.barcode(CODE); // Populate the old, incomplete provider cache.
  await store.save("a", completed());
  const service = createUserFoodSearchService(provider, store, () => ({ userId: "a", generation: 1 }));
  const result = await service.barcode(CODE);
  assert.equal(result.source, "custom"); assert.equal(result.nutritionPer100g.protein, 5);
  assert.equal(calls, 1); assert.equal(connectivity, 1);
  const offline = createFoodSearchService(async () => { throw new Error("Must not fetch"); }, async () => false);
  assert.equal((await createUserFoodSearchService(offline, store, () => ({ userId: "a", generation: 1 })).barcode(CODE)).source, "custom");
});
test("another user uses complete provider nutrition unchanged and USDA flows pass through", async () => {
  const store = createSavedFoodStore(memoryStorage()); await store.save("a", completed()); let calls = 0;
  const providerFood = { ...incompleteProduct(), nutritionPer100g: { calories: 100, protein: 2, carbs: 20, fat: 0 } };
  const provider = createFoodSearchService(async (body) => {
    calls++;
    const usda = { ...providerFood, source: "usda", externalId: "123", barcode: undefined };
    return { data: body.action === "search" ? { results: [usda] } : { result: body.action === "detail" ? usda : providerFood }, error: null };
  });
  const service = createUserFoodSearchService(provider, store, () => ({ userId: "b", generation: 1 }));
  assert.equal((await service.barcode(CODE)).source, "open-food-facts");
  assert.equal((await service.barcode(CODE)).nutritionPer100g.calories, 100);
  assert.equal((await service.search("cereal"))[0].source, "usda");
  assert.equal((await service.detail("123")).source, "usda"); assert.equal(calls, 3);
});
test("manual barcode and scanner controllers share local-first lookup and preserve duplicate locks", async () => {
  const store = createSavedFoodStore(memoryStorage()); await store.save("a", completed());
  const provider = createFoodSearchService(async () => { throw new Error("Must not fetch"); });
  const service = createUserFoodSearchService(provider, store, () => ({ userId: "a", generation: 1 }));
  assert.equal((await service.barcode(CODE)).barcode, CODE);
  const states: ScannerState[] = []; const scanner = createScannerController(service, (state) => states.push(state));
  assert.equal(scanner.accept("ean13", CODE), true); assert.equal(scanner.accept("ean13", CODE), false);
  await scanner.cameraStopped();
  const result = deserializeFoodResult(states.at(-1)?.foodResult)!;
  assert.equal(result.source, "custom"); assert.equal(result.barcode, CODE); assert.equal(result.nutritionPer100g.protein, 5);
});
test("switching accounts during a local read suppresses stale food results", async () => {
  let finish!: (raw: string | null) => void;
  const store = createSavedFoodStore({ getItem: () => new Promise((resolve) => { finish = resolve; }), setItem: async () => {} });
  let owner: { userId: string; generation: number } | null = { userId: "a", generation: 1 };
  let called = false; const provider = createFoodSearchService(async () => { called = true; return { data: null, error: null }; });
  const service = createUserFoodSearchService(provider, store, () => owner);
  const pending = service.barcode(CODE); await new Promise((done) => setImmediate(done));
  owner = { userId: "b", generation: 2 }; finish(JSON.stringify({ version: 1, foods: [completed()] }));
  await assert.rejects(pending, (error: unknown) => error instanceof FoodSearchError && error.kind === "unauthorized");
  assert.equal(called, false); owner = null; assert.equal(await service.saveFood(completed()), false);
});
test("session changes cancel queued saves and storage write errors remain retryable", async () => {
  const storage = memoryStorage(); let canWrite = true;
  const store = createSavedFoodStore(storage); const pending = store.save("a", completed(), () => canWrite);
  canWrite = false; assert.equal(await pending, false); assert.equal(storage.data.size, 0);
  let fail = true;
  const retryStore = createSavedFoodStore({ ...storage, setItem: async (key, value) => { if (fail) throw new Error("Disk full"); return storage.setItem(key, value); } });
  await assert.rejects(retryStore.save("a", completed())); fail = false;
  assert.equal(await retryStore.save("a", completed()), true);
});
test("account changes during provider lookup suppress stale responses, including same-user re-login", async () => {
  let finish!: (value: { data: unknown; error: null }) => void;
  let owner = { userId: "a", generation: 1 };
  const provider = createFoodSearchService(() => new Promise((resolve) => { finish = resolve; }));
  const service = createUserFoodSearchService(provider, createSavedFoodStore(memoryStorage()), () => owner);
  const pending = service.barcode(CODE); await new Promise((done) => setImmediate(done));
  owner = { userId: "a", generation: 2 }; finish({ data: { result: incompleteProduct() }, error: null });
  await assert.rejects(pending, (error: unknown) => error instanceof FoodSearchError && error.kind === "unauthorized");
});
test("a saved-food read failure falls back to provider without writing or affecting logs", async () => {
  let writes = 0;
  const store = createSavedFoodStore({ getItem: async () => { throw new Error("Read failure"); }, setItem: async () => { writes++; } });
  const provider = createFoodSearchService(async () => ({ data: { result: incompleteProduct() }, error: null }));
  const service = createUserFoodSearchService(provider, store, () => ({ userId: "a", generation: 1 }));
  assert.equal((await service.barcode(CODE)).source, "open-food-facts"); assert.equal(writes, 0);
});
