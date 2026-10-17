import assert from "node:assert/strict";
import { test } from "node:test";
import { createSavedFoodStore, filterSavedFoods, migrateSavedFoods, savedFoodsKey } from "../savedFoods";
import { libraryFoodFromInputs, libraryFoodInputs } from "../libraryFood";
import { completeBarcodeNutrition, initialFoodServing, recalculateFoodInputs } from "../confirmationNutrition";
import { deserializeFoodResult, serializeFoodResult, validateTransportFood } from "../foodResultTransport";
import { createUserFoodSearchService } from "../userFoodSearchService";
import { createFoodSearchService } from "../foodSearchService";
import type { FoodSearchResult } from "../../../types/foodSearch";

const barcode = "0012345678905";
function storageFixture() {
  const data = new Map<string, string>(); const touched: string[] = [];
  return { data, touched, getItem: async (key: string) => { touched.push(key); return data.get(key) ?? null; },
    setItem: async (key: string, value: string) => { touched.push(key); data.set(key, value); } };
}
const legacyFood = (): FoodSearchResult => ({ source: "custom", barcode, externalId: barcode, savedForUserId: "a", name: "Package cereal", brand: "Fixture",
  nutritionPer100g: { calories: 200, protein: 5, carbs: 30, fat: 0 },
  servingOptions: [{ id: "one", label: "One serving", grams: 30 }, { id: "two", label: "Two servings", grams: 60 }], defaultServingId: "two",
  attributionLabel: "Your saved nutrition · Product from Open Food Facts (ODbL)", sourceUrl: `https://world.openfoodfacts.org/product/${barcode}` });
export function customFood(id = "local:fixture", name = "Homemade soup") {
  return libraryFoodFromInputs({ name, brand: "Kitchen", barcode: "", servingGrams: "150", calories: "40", protein: "2", carbs: "5", fat: "0" }, id)!;
}

test("v1 migration preserves every Phase 4D field, zero and leading-zero barcode without rewriting on read", async () => {
  const storage = storageFixture(); const raw = JSON.stringify({ version: 1, foods: [legacyFood()] });
  storage.data.set(savedFoodsKey("a"), raw); const store = createSavedFoodStore(storage);
  const foods = await store.list("a"); assert.equal(foods.length, 1);
  const { localId, ...preserved } = foods[0];
  assert.equal(localId, `barcode:${barcode}`); assert.deepEqual(preserved, legacyFood());
  assert.equal(storage.data.get(savedFoodsKey("a")), raw);
  await store.save("a", customFood());
  const persisted = JSON.parse(storage.data.get(savedFoodsKey("a"))!);
  assert.equal(persisted.version, 2); assert.equal(persisted.foods.length, 2);
  assert.deepEqual(persisted.foods.find((food: FoodSearchResult) => food.barcode === barcode), foods[0]);
  assert.deepEqual((await createSavedFoodStore(storage).list("a"))[0], foods[0]);
});
test("failed migration write leaves the original legacy bytes intact and readable", async () => {
  const storage = storageFixture(); const raw = JSON.stringify({ version: 1, foods: [legacyFood()] }); storage.data.set(savedFoodsKey("a"), raw);
  const store = createSavedFoodStore({ ...storage, setItem: async () => { throw new Error("Disk full"); } });
  await assert.rejects(store.save("a", customFood()));
  assert.equal(storage.data.get(savedFoodsKey("a")), raw); assert.equal((await store.list("a"))[0].barcode, barcode);
});
test("editing a legacy food's name keeps all serving options, order and default weight", () => {
  const original = legacyFood();
  const updated = libraryFoodFromInputs({ ...libraryFoodInputs(original), name: "Renamed cereal" }, `barcode:${barcode}`, original)!;
  assert.equal(updated.name, "Renamed cereal"); assert.deepEqual(updated.servingOptions, original.servingOptions);
  assert.equal(updated.defaultServingId, original.defaultServingId); assert.equal(updated.barcode, barcode);
});
test("create, list, update and delete preserve a custom food's local ID across restarts", async () => {
  const storage = storageFixture(); const store = createSavedFoodStore(storage);
  await store.save("a", customFood()); const first = (await store.list("a"))[0];
  assert.equal(first.localId, "local:fixture"); assert.equal(first.barcode, undefined);
  await store.save("a", { ...first, name: "Updated soup", nutritionPer100g: { calories: 50, protein: 0, carbs: 7, fat: 0 } });
  const foods = await createSavedFoodStore(storage).list("a"); assert.equal(foods.length, 1);
  assert.equal(foods[0].localId, first.localId); assert.equal(foods[0].nutritionPer100g.protein, 0);
  await store.remove("a", first.localId); assert.deepEqual(await store.list("a"), []);
});
test("two barcode-free foods with the same name receive unique stable IDs", async () => {
  let id = 0; const storage = storageFixture(); const store = createSavedFoodStore(storage, () => `generated-${++id}`);
  const { localId: _id, ...food } = customFood();
  await Promise.all([store.save("a", food), store.save("a", food)]);
  const foods = await store.list("a"); assert.equal(foods.length, 2); assert.notEqual(foods[0].localId, foods[1].localId);
  assert.deepEqual((await createSavedFoodStore(storage).list("a")).map((food) => food.localId), foods.map((food) => food.localId));
});
test("duplicate barcode saving updates the stable existing record, including Phase 4D completion", async () => {
  const store = createSavedFoodStore(storageFixture()); await store.save("a", legacyFood());
  await store.save("a", { ...customFood("local:another"), barcode, externalId: barcode, name: "User cereal" });
  let foods = await store.list("a"); assert.equal(foods.length, 1); assert.equal(foods[0].localId, `barcode:${barcode}`);
  const completion = completeBarcodeNutrition({ ...legacyFood(), source: "open-food-facts", nutritionPer100g: { ...legacyFood().nutritionPer100g, protein: null } }, { calories: "220", protein: "7", carbs: "35", fat: "0" })!;
  await store.save("a", completion); foods = await store.list("a");
  assert.equal(foods.length, 1); assert.equal(foods[0].localId, `barcode:${barcode}`); assert.equal(foods[0].nutritionPer100g.protein, 7);
});
test("editing a barcode retains local identity and conflicting edits do not merge or lose foods", async () => {
  const store = createSavedFoodStore(storageFixture()); await store.save("a", customFood()); await store.save("a", legacyFood());
  const before = await store.list("a");
  await assert.rejects(store.save("a", { ...customFood(), barcode, externalId: barcode }));
  assert.deepEqual(await store.list("a"), before);
  await store.save("a", { ...customFood(), barcode: "00000001", externalId: "00000001" });
  assert.equal((await store.find("a", "00000001"))?.localId, "local:fixture");
});
test("saving an original barcode after its migrated record was edited preserves both foods", async () => {
  const store = createSavedFoodStore(storageFixture(), () => "new-barcode-record");
  await store.save("a", legacyFood());
  const migrated = (await store.list("a"))[0];
  await store.save("a", { ...migrated, barcode: "00000001", externalId: "00000001", name: "Edited barcode food" });
  // Phase 4D completion supplies no local ID for a newly scanned provider product.
  await store.save("a", { ...legacyFood(), name: "Original barcode food" });
  const foods = await store.list("a"); assert.equal(foods.length, 2);
  assert.equal((await store.find("a", "00000001"))?.name, "Edited barcode food");
  assert.equal((await store.find("a", barcode))?.name, "Original barcode food");
  assert.notEqual(foods[0].localId, foods[1].localId);
  await store.save("a", { ...legacyFood(), name: "Updated original barcode food" });
  assert.equal((await store.list("a")).length, 2);
  assert.equal((await store.find("a", barcode))?.name, "Updated original barcode food");
  assert.equal((await store.find("a", "00000001"))?.name, "Edited barcode food");
});
test("local filtering matches names and brands case-insensitively without touching providers", async () => {
  const store = createSavedFoodStore(storageFixture()); await store.save("a", customFood()); await store.save("a", legacyFood());
  const foods = await store.list("a");
  assert.equal(filterSavedFoods(foods, " SOUP ")[0].name, "Homemade soup");
  assert.equal(filterSavedFoods(foods, "kItChEn")[0].brand, "Kitchen");
  assert.equal(filterSavedFoods(foods, "FIXTURE")[0].barcode, barcode);
  assert.equal(filterSavedFoods(foods, "").length, 2); assert.deepEqual(filterSavedFoods(foods, "unmatched"), []);
});
test("barcode-free custom food reaches transport with complete nutrition and correct serving calculations", () => {
  const food = deserializeFoodResult(serializeFoodResult({ ...customFood(), savedForUserId: "a" }))!;
  assert.equal(food.localId, "local:fixture"); assert.equal(food.barcode, undefined); assert.equal(food.sourceUrl, undefined);
  assert.equal(food.attributionLabel, "Your saved food"); assert.equal(food.savedForUserId, "a");
  assert.deepEqual(initialFoodServing(food), { servingId: "my-default", grams: "150", quantity: "1" });
  assert.deepEqual(recalculateFoodInputs(food, "150", "2"), { calories: "120", protein: "6", carbs: "15", fat: "0" });
});
test("optional serving weight falls back to 100 g and optional barcode keeps all digits", () => {
  const inputs = libraryFoodInputs(customFood()); inputs.servingGrams = ""; inputs.barcode = barcode;
  const food = libraryFoodFromInputs(inputs, "local:fixture")!;
  assert.equal(food.barcode, barcode); assert.equal(food.nutritionPer100g.fat, 0); assert.equal(initialFoodServing(food).grams, "100");
});
for (const key of ["calories", "protein", "carbs", "fat"] as const) {
  test(`custom library requires ${key} and preserves genuine zero`, () => {
    const inputs = libraryFoodInputs(customFood());
    assert.equal(libraryFoodFromInputs({ ...inputs, [key]: "" }, "local:fixture"), null);
    assert.equal(libraryFoodFromInputs({ ...inputs, [key]: "-1" }, "local:fixture"), null);
    assert.equal(libraryFoodFromInputs({ ...inputs, [key]: "0" }, "local:fixture")?.nutritionPer100g[key], 0);
  });
}
test("invalid optional fields, missing names and incomplete custom transport are rejected", () => {
  const inputs = libraryFoodInputs(customFood());
  for (const change of [{ name: " " }, { barcode: "123" }, { barcode: " 0012345678905" }, { servingGrams: "0" }, { servingGrams: "Infinity" }]) assert.equal(libraryFoodFromInputs({ ...inputs, ...change }, "local:fixture"), null);
  assert.equal(validateTransportFood({ ...customFood(), nutritionPer100g: { ...customFood().nutritionPer100g, fat: null } }), null);
  assert.equal(validateTransportFood({ ...customFood(), localId: undefined }), null);
});
test("editing nutrition and deleting library foods never reads or writes existing food-log storage", async () => {
  const storage = storageFixture(); const key = "caloribite_food_logs:user:a";
  const history = JSON.stringify([{ id: "old", foodName: "Homemade soup", calories: 60, protein: 3, carbs: 7.5, fat: 0, mealType: "Lunch", loggedDate: "2026-10-17", createdAt: "2026-10-17T12:00:00Z" }]);
  storage.data.set(key, history); const store = createSavedFoodStore(storage);
  await store.save("a", customFood()); await store.save("a", { ...customFood(), name: "New name", nutritionPer100g: { calories: 99, protein: 0, carbs: 0, fat: 0 } });
  await store.remove("a", "local:fixture");
  assert.equal(storage.data.get(key), history); assert.ok(storage.touched.every((key) => key === savedFoodsKey("a")));
});
test("library list/update/delete operations are isolated between accounts", async () => {
  const store = createSavedFoodStore(storageFixture()); await store.save("a", customFood()); await store.save("b", { ...customFood(), name: "B's soup" });
  await store.remove("b", "local:fixture"); assert.equal((await store.list("a"))[0].name, "Homemade soup");
  assert.deepEqual(await store.list("b"), []); assert.deepEqual(await store.list(""), []);
});
test("corrupted records recover without discarding valid library or legacy foods", async () => {
  const storage = storageFixture(); storage.data.set(savedFoodsKey("a"), JSON.stringify({ version: 2, foods: [null, { bad: true }, customFood(), { ...customFood("local:foreign"), savedForUserId: "b" }] }));
  const store = createSavedFoodStore(storage); assert.equal((await store.list("a")).length, 1);
  await store.save("a", legacyFood()); assert.equal((await store.list("a")).length, 2);
  storage.data.set(savedFoodsKey("b"), "{"); assert.deepEqual(await store.list("b"), []);
  await store.save("b", customFood()); assert.equal((await store.list("b")).length, 1);
});
test("unknown schema and oversized data remain untouched by library writes or deletes", async () => {
  const storage = storageFixture(); const store = createSavedFoodStore(storage);
  for (const raw of [JSON.stringify({ version: 99, foods: [customFood()] }), "x".repeat(3_000_001)]) {
    storage.data.set(savedFoodsKey("a"), raw); await assert.rejects(store.list("a"));
    await assert.rejects(store.save("a", customFood())); await assert.rejects(store.remove("a", "local:fixture"));
    assert.equal(storage.data.get(savedFoodsKey("a")), raw);
  }
});
test("logout suppresses list results and cancels queued edits and deletes", async () => {
  const store = createSavedFoodStore(storageFixture()); await store.save("a", customFood());
  let owner: { userId: string; generation: number } | null = { userId: "a", generation: 1 };
  const provider = createFoodSearchService(async () => { throw new Error("No provider requests"); });
  const service = createUserFoodSearchService(provider, store, () => owner);
  const pending = service.listFoods(); owner = null; await assert.rejects(pending);
  assert.deepEqual(await service.listFoods(), []); assert.equal(await service.deleteFood("local:fixture"), false);
  assert.equal((await store.list("a")).length, 1);
});
test("subscribers refresh only their own account and unsubscribe safely", async () => {
  const store = createSavedFoodStore(storageFixture()); const provider = createFoodSearchService(async () => ({ data: null, error: null }));
  const service = createUserFoodSearchService(provider, store, () => ({ userId: "a", generation: 1 }));
  let notifications = 0; const unsubscribe = service.subscribeFoods(() => { notifications++; });
  await store.save("b", customFood()); assert.equal(notifications, 0);
  await service.saveFood(customFood()); assert.equal(notifications, 1);
  unsubscribe(); await service.deleteFood("local:fixture"); assert.equal(notifications, 1);
});
test("migration is deterministic and idempotent", () => {
  const first = migrateSavedFoods(JSON.stringify({ version: 1, foods: [legacyFood()] }), "a");
  assert.deepEqual(migrateSavedFoods(JSON.stringify({ version: 2, foods: first.foods }), "a"), first);
});
