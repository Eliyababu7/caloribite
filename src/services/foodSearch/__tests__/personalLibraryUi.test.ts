import assert from "node:assert/strict";
import { test } from "node:test";
import { componentHarness } from "./componentHarness";
import * as confirmation from "../confirmationNutrition";
import * as library from "../libraryFood";
import { filterSavedFoods, type SavedFood } from "../savedFoods";
import * as transport from "../foodResultTransport";
import { createSearchController } from "../searchController";
import { FOOD_SEARCH_MESSAGES, FoodSearchError } from "../foodSearchService";
import type { FoodSearchResult } from "../../../types/foodSearch";

const food: SavedFood = { source: "custom", localId: "local:soup", savedForUserId: "a", name: "Soup", brand: "Kitchen",
  nutritionPer100g: { calories: 40, protein: 2, carbs: 5, fat: 0 }, servingOptions: [{ id: "bowl", label: "Bowl", grams: 150 }], defaultServingId: "bowl", attributionLabel: "Your saved food" };
const native = {
  View: "View", Text: "Text", TextInput: "TextInput", Pressable: "Pressable", ScrollView: "ScrollView", ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (styles: any) => styles }, Alert: { alert() {} },
};
const theme = { "../theme/theme": { useAppTheme: () => ({ colors: {} }) } };
function libraryHarness(options: { loading?: boolean; fail?: boolean; foods?: SavedFood[] } = {}) {
  let client: any;
  let deleted = 0; let saved = 0; let selected: FoodSearchResult | null = null; let fail = options.fail ?? false;
  let finish!: (foods: SavedFood[]) => void; let notify: () => void = () => {};
  let foods = options.foods ?? [food];
  const makeClient = (rows: SavedFood[]) => ({ listFoods: async () => {
    if (fail) throw new Error("PRIVATE_STORAGE_DETAIL");
    return options.loading ? new Promise<SavedFood[]>((resolve) => { finish = resolve; }) : rows;
  }, subscribeFoods: (listener: () => void) => { notify = listener; return () => {}; },
  deleteFood: async () => { deleted++; foods = []; client.listFoods = async () => foods; notify(); return true; },
  saveFood: async () => { saved++; return true; } });
  client = makeClient(foods);
  const h = componentHarness("src/components/MyFoodsLibrary.tsx", "MyFoodsLibrary", { query: "", onSelect: (value: FoodSearchResult) => { selected = value; return true; } }, {
    ...theme, "react-native": native,
    "../services/foodSearch/savedFoods": { filterSavedFoods },
    "../services/foodSearch/useAccountFoodSearch": { useAccountFoodSearch: () => client },
    "./SavedFoodForm": { SavedFoodForm: "SavedFoodForm" },
  });
  return { h, selected: () => selected, deleted: () => deleted, saved: () => saved,
    finish: (rows: SavedFood[]) => finish(rows), setFailure: (value: boolean) => { fail = value; },
    switchAccount() { client = makeClient([]); h.render(); },
  };
}
function formHarness(onSave: (food: FoodSearchResult) => Promise<boolean>, existing?: FoodSearchResult) {
  return componentHarness("src/components/SavedFoodForm.tsx", "SavedFoodForm", { food: existing, onSave, onCancel() {} }, {
    ...theme, "react-native": native, "expo-crypto": { randomUUID: () => "fixture-id" },
    "../services/foodSearch/libraryFood": library,
    "../services/foodSearch/confirmationNutrition": confirmation,
  });
}
function enter(h: ReturnType<typeof formHarness>, label: string, value: string) {
  h.input(label).props.onChangeText(value); h.render();
}

test("My Foods is accessible, filters saved names/brands while typing and selects complete nutrition", async () => {
  const { h, selected } = libraryHarness(); await h.settle();
  assert.ok(h.button("My Foods")); assert.ok(h.button("Select saved Soup"));
  h.setProps({ query: "KITCHEN" }); assert.ok(h.button("Select saved Soup"));
  h.setProps({ query: "missing" }); assert.equal(h.button("Select saved Soup"), undefined);
  assert.match(h.text(), /No saved foods match/);
  h.button("My Foods").props.onPress(); h.render();
  assert.ok(h.input("Filter My Foods by name or brand"));
  enter(h, "Filter My Foods by name or brand", "sOuP");
  h.button("Select saved Soup").props.onPress(); assert.equal(selected()?.nutritionPer100g.fat, 0);
  assert.equal(selected()?.localId, food.localId);
});
test("delete requires an explicit confirmation and cancel never invokes storage", async () => {
  const { h, deleted } = libraryHarness(); await h.settle();
  h.button("My Foods").props.onPress(); h.render();
  h.button("Delete Soup").props.onPress(); h.render(); assert.equal(deleted(), 0);
  assert.match(h.text(), /Existing diary entries will remain unchanged/);
  h.button("Keep saved food").props.onPress(); h.render(); assert.equal(deleted(), 0);
  h.button("Delete Soup").props.onPress(); h.render();
  h.button("Confirm delete saved food").props.onPress(); await h.settle();
  assert.equal(deleted(), 1); assert.match(h.text(), /No saved foods yet/);
});
test("library exposes loading, empty and retryable error states without leaking storage details", async () => {
  const loading = libraryHarness({ loading: true }); assert.ok(loading.h.nodes().some((node) => node.props?.accessibilityLabel === "Loading My Foods"));
  loading.finish([]); await loading.h.settle(); assert.match(loading.h.text(), /No saved foods yet/);
  const failed = libraryHarness({ fail: true }); await failed.h.settle();
  assert.match(failed.h.text(), /could not be loaded/); assert.equal(failed.h.text().includes("PRIVATE_STORAGE_DETAIL"), false);
  failed.setFailure(false); failed.h.button("Retry My Foods").props.onPress(); await failed.h.settle();
  assert.ok(failed.h.button("Select saved Soup"));
});
test("switching accounts hides loaded foods and open edit/delete state immediately", async () => {
  const account = libraryHarness(); await account.h.settle();
  account.h.button("My Foods").props.onPress(); account.h.render();
  account.h.button("Edit Soup").props.onPress(); account.h.render(); assert.ok(account.h.node("SavedFoodForm"));
  account.switchAccount(); assert.equal(account.h.button("Select saved Soup"), undefined); assert.equal(account.h.node("SavedFoodForm"), undefined);
  await account.h.settle(); assert.equal(account.h.button("Select saved Soup"), undefined);
});
test("create and edit actions reuse the saved-food form and cancel creates nothing", async () => {
  const { h, saved } = libraryHarness(); await h.settle(); h.button("My Foods").props.onPress(); h.render();
  h.button("Create reusable food").props.onPress(); h.render(); assert.equal(h.node("SavedFoodForm").props.food, undefined);
  h.node("SavedFoodForm").props.onCancel(); h.render(); assert.equal(saved(), 0);
  h.button("Edit Soup").props.onPress(); h.render(); assert.equal(h.node("SavedFoodForm").props.food.localId, food.localId);
  await h.node("SavedFoodForm").props.onSave(food); h.render(); assert.equal(saved(), 1); assert.equal(h.node("SavedFoodForm"), undefined);
});
test("reusable food form requires all four nutrients and preserves zeroes, optional leading-zero barcode and serving", async () => {
  let result: FoodSearchResult | null = null;
  const h = formHarness(async (value) => { result = value; return true; });
  h.button("Save reusable food").props.onPress(); await h.settle(); assert.equal(result, null);
  assert.match(h.text(), /all four non-negative nutrient values per 100 g/);
  for (const [label, value] of [["Saved food name", "Soup"], ["Calories per 100 g", "40"], ["Protein per 100 g (g)", "2"], ["Carbohydrates per 100 g (g)", "5"], ["Fat per 100 g (g)", "0"], ["Barcode (optional)", "0012345678905"], ["Default serving weight in grams (optional)", "150"]]) enter(h, label, value);
  h.button("Save reusable food").props.onPress(); await h.settle();
  const completed = result as FoodSearchResult | null; assert.ok(completed);
  assert.equal(completed.localId, "local:fixture-id"); assert.equal(completed.barcode, "0012345678905"); assert.equal(completed.nutritionPer100g.fat, 0);
});
test("edit form retains local identity and never converts empty input to zero", async () => {
  let calls = 0; const h = formHarness(async (value) => { calls++; assert.equal(value.localId, food.localId); return true; }, food);
  assert.equal(h.input("Fat per 100 g (g)").props.value, "0");
  enter(h, "Fat per 100 g (g)", ""); h.button("Save reusable food").props.onPress(); await h.settle(); assert.equal(calls, 0);
  enter(h, "Fat per 100 g (g)", "0"); h.button("Save reusable food").props.onPress(); await h.settle(); assert.equal(calls, 1);
});
test("failed library saves stay editable and do not claim success", async () => {
  const h = formHarness(async () => { throw new Error("PRIVATE_DETAIL"); }, food);
  h.button("Save reusable food").props.onPress(); await h.settle();
  assert.match(h.text(), /could not be saved/); assert.equal(h.text().includes("PRIVATE_DETAIL"), false);
  assert.equal(h.input("Saved food name").props.editable, true);
});

test("Search Food keeps My Foods above providers; typing is local and only Search sends provider requests", async () => {
  let requests = 0; let route: any;
  const providerFood = { ...food, source: "usda" as const, externalId: "123", localId: undefined };
  const client = { search: async () => { requests++; return [providerFood]; }, detail: async () => providerFood };
  const h = componentHarness("src/app/search-food.tsx", "default", {}, {
    ...theme, "react-native": native,
    "expo-router": { useRouter: () => ({ push: (value: any) => { route = value; }, back() {} }), useLocalSearchParams: () => ({ loggedDate: "2026-10-17" }) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "../components/BarcodeLookupPanel": { BarcodeLookupPanel: "BarcodeLookupPanel" },
    "../components/MyFoodsLibrary": { MyFoodsLibrary: "MyFoodsLibrary" },
    "../services/foodSearch/foodSearchClient": { foodSearchClient: client },
    "../services/foodSearch/foodSearchService": { FOOD_SEARCH_MESSAGES, FoodSearchError },
    "../services/foodSearch/foodResultTransport": transport,
    "../services/foodSearch/searchController": { createSearchController },
    "../data/starterFoods": { STARTER_FOODS: [] },
    "../utils/date": { formatDiaryDate: (date: string) => date },
    "../utils/diaryRoute": { resolveDiaryDateParam: () => "2026-10-17" },
  });
  for (const query of ["s", "so", "soup"]) enter(h, "Search foods", query);
  assert.equal(requests, 0); assert.equal(h.node("MyFoodsLibrary").props.query, "soup");
  h.button("Search USDA foods").props.onPress(); await h.settle(); assert.equal(requests, 1);
  const nodes = h.nodes();
  assert.ok(nodes.findIndex((node) => node.type === "MyFoodsLibrary") < nodes.findIndex((node) => node.type === "Text" && node.props.children === "USDA results"));
  assert.equal(h.node("MyFoodsLibrary").props.onSelect(food), true);
  assert.equal(route.pathname, "/confirm-food"); assert.equal(route.params.loggedDate, "2026-10-17");
  const selected = transport.deserializeFoodResult(route.params.foodResult)!;
  assert.equal(selected.localId, food.localId); assert.equal(selected.savedForUserId, "a"); assert.equal(selected.nutritionPer100g.fat, 0);
});

test("saved food confirmation reuses meal, logged date and serving calculations without barcode editing", async () => {
  let log: any;
  const h = componentHarness("src/components/FoodEntryForm.tsx", "FoodEntryForm", { title: "Confirm", subtitle: "Review", loggedDate: "2026-10-17", foodResult: food,
    initialValues: { mealType: "Lunch" }, onSubmit: async (value: any) => { log = value; return true; }, onCancel() {} }, {
    ...theme, "react-native": native,
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "../services/foodSearch/confirmationNutrition": confirmation,
    "./BarcodeNutritionEditor": { BarcodeNutritionEditor: "BarcodeNutritionEditor" },
    "../utils/date": { formatDiaryDate: (value: string) => value },
    "../utils/meal": { getDefaultMealType: () => "Snack", MEAL_TYPES: ["Breakfast", "Lunch", "Dinner", "Snack"] },
  });
  assert.equal(h.node("BarcodeNutritionEditor"), undefined); assert.ok(h.text().includes("2026-10-17"));
  assert.equal(h.input("Calories").props.value, "60");
  enter(h, "Serving quantity", "2"); await h.button("Save to diary").props.onPress();
  assert.equal(log.calories, 120); assert.equal(log.fat, 0); assert.equal(log.mealType, "Lunch");
});
