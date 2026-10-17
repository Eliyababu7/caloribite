import assert from "node:assert/strict";
import { test } from "node:test";
import type { FoodSearchResult } from "../../../types/foodSearch";
import * as confirmation from "../confirmationNutrition";
import { componentHarness } from "./componentHarness";
import { deserializeFoodResult, serializeFoodResult } from "../foodResultTransport";

const food: FoodSearchResult = { source: "open-food-facts", name: "Cereal", brand: "Fixture", barcode: "0012345678905", externalId: "0012345678905",
  nutritionPer100g: { calories: 200, protein: null, carbs: null, fat: 0 },
  servingOptions: [{ id: "package", label: "Package serving", grams: 30 }], attributionLabel: "Open Food Facts (ODbL)" };
const completed = confirmation.completeBarcodeNutrition(food, { calories: "200", protein: "5", carbs: "30", fat: "0" })!;
const native = {
  View: "View", Text: "Text", TextInput: "TextInput", Pressable: "Pressable", ScrollView: "ScrollView", ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (styles: any) => styles }, Alert: { alert() {} },
};
const common = {
  "react-native": native,
  "../theme/theme": { useAppTheme: () => ({ colors: {} }) },
  "../services/foodSearch/confirmationNutrition": confirmation,
};
function editor(props: Record<string, any> = {}) {
  return componentHarness("src/components/BarcodeNutritionEditor.tsx", "BarcodeNutritionEditor", {
    food, name: food.name, disabled: false, onApply() {}, ...props,
  }, common);
}
function form(props: Record<string, any> = {}) {
  return componentHarness("src/components/FoodEntryForm.tsx", "FoodEntryForm", {
    title: "Confirm food", subtitle: "Review", loggedDate: "2026-10-17", onSubmit: async () => true, onCancel() {}, ...props,
  }, { ...common,
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "./BarcodeNutritionEditor": { BarcodeNutritionEditor: "BarcodeNutritionEditor" },
    "../utils/date": { formatDiaryDate: (value: string) => value },
    "../utils/meal": { getDefaultMealType: () => "Snack", MEAL_TYPES: ["Breakfast", "Lunch", "Dinner", "Snack"] },
  });
}
function fill(h: ReturnType<typeof editor>) {
  h.input("Protein per 100 g (g)").props.onChangeText("5"); h.render();
  h.input("Carbohydrates per 100 g (g)").props.onChangeText("30"); h.render();
}

test("incomplete editor shows the exact package warning with empty missing values and genuine zero", () => {
  const h = editor(); assert.ok(h.text().includes(confirmation.INCOMPLETE_NUTRITION_WARNING));
  assert.equal(h.input("Protein per 100 g (g)").props.value, "");
  assert.equal(h.input("Fat per 100 g (g)").props.value, "0");
  assert.match(h.text(), /0012345678905/); assert.match(h.text(), /Fixture/);
});
test("invalid package nutrition cannot apply or save and does not silently fill blanks", async () => {
  let applied = 0; let saved = 0;
  const h = editor({ onApply: () => { applied++; }, onSave: async () => { saved++; return true; } });
  h.button("Save food privately on this device").props.onPress(); await h.settle();
  assert.equal(applied, 0); assert.equal(saved, 0); assert.match(h.text(), /every nutrient per 100 g/);
  assert.equal(h.input("Protein per 100 g (g)").props.value, "");
});
test("applying validated package nutrition does not save privately without explicit action", async () => {
  let applied: FoodSearchResult | null = null; let saves = 0;
  const h = editor({ name: "Edited cereal", onApply: (value: FoodSearchResult) => { applied = value; }, onSave: async () => { saves++; return true; } });
  fill(h); h.button("Apply package nutrition").props.onPress(); await h.settle();
  assert.equal(saves, 0); assert.equal((applied as FoodSearchResult | null)?.name, "Edited cereal");
  assert.equal((applied as FoodSearchResult | null)?.nutritionPer100g.protein, 5);
});
test("private save uses per-100-g values and prevents repeated pending saves", async () => {
  let saves = 0; let finish!: (value: boolean) => void;
  const h = editor({ onSave: (value: FoodSearchResult) => {
    saves++; assert.equal(value.nutritionPer100g.calories, 200); assert.equal(value.barcode, food.barcode);
    return new Promise<boolean>((resolve) => { finish = resolve; });
  } });
  fill(h); h.button("Save food privately on this device").props.onPress(); h.button("Save food privately on this device").props.onPress();
  assert.equal(saves, 1); finish(true); await h.settle(); assert.match(h.text(), /Saved privately on this device for your account/);
});
test("private storage failure gives recovery without claiming diary or food was saved", async () => {
  const h = editor({ onSave: async () => { throw new Error("PRIVATE_STORAGE_DETAIL"); } });
  fill(h); h.button("Save food privately on this device").props.onPress(); await h.settle();
  assert.match(h.text(), /could not be saved privately/); assert.equal(h.text().includes("PRIVATE_STORAGE_DETAIL"), false);
});
test("completing missing package values recalculates serving totals and future quantity edits", async () => {
  let log: any;
  const h = form({ foodResult: food, onSubmit: async (value: any) => { log = value; return true; } });
  assert.equal(h.input("Protein in grams").props.value, ""); assert.equal(h.input("Fat in grams").props.value, "0");
  h.node("BarcodeNutritionEditor").props.onApply(completed); h.render();
  assert.equal(h.input("Calories").props.value, "60"); assert.equal(h.input("Protein in grams").props.value, "1.5");
  h.input("Serving quantity").props.onChangeText("2"); h.render();
  assert.equal(h.input("Calories").props.value, "120"); assert.equal(h.input("Carbohydrates in grams").props.value, "18");
  await h.button("Save to diary").props.onPress(); assert.equal(log.calories, 120); assert.equal(log.fat, 0);
});
test("fully missing barcode nutrition starts at explicit 100 g and remains empty until completed", () => {
  const missing = { ...food, servingOptions: [], nutritionPer100g: { calories: null, protein: null, carbs: null, fat: null } };
  const h = form({ foodResult: missing });
  assert.equal(h.input("Serving weight in grams").props.value, "100");
  assert.equal(h.input("Calories").props.value, ""); assert.ok(h.node("BarcodeNutritionEditor"));
});
test("saving a private record is separate from diary submission and disables diary while pending", async () => {
  let logs = 0; let finish!: (value: boolean) => void;
  const h = form({ foodResult: food, onSubmit: async () => { logs++; return true; }, onSaveFood: () => new Promise<boolean>((resolve) => { finish = resolve; }) });
  const pending = h.node("BarcodeNutritionEditor").props.onSave(completed); h.render();
  assert.equal(h.button("Save to diary").props.disabled, true);
  await h.button("Save to diary").props.onPress(); assert.equal(logs, 0);
  finish(true); await pending; h.render(); assert.equal(h.button("Save to diary").props.disabled, false);
});
test("saved barcode nutrition is editable and autofills serving totals", () => {
  const h = form({ foodResult: completed }); assert.ok(h.node("BarcodeNutritionEditor"));
  assert.equal(h.input("Calories").props.value, "60"); assert.equal(h.input("Protein in grams").props.value, "1.5");
  const updated = { ...completed, nutritionPer100g: { ...completed.nutritionPer100g, calories: 250 } };
  h.node("BarcodeNutritionEditor").props.onApply(updated); h.render();
  assert.equal(h.input("Calories").props.value, "75");
});
test("complete provider flows retain editable totals without the saved-food completion editor", async () => {
  for (const source of ["open-food-facts", "usda"] as const) {
    let log: any;
    const h = form({ foodResult: { ...food, source, nutritionPer100g: completed.nutritionPer100g }, onSubmit: async (value: any) => { log = value; return true; } });
    assert.equal(h.node("BarcodeNutritionEditor"), undefined); assert.equal(h.input("Calories").props.value, "60");
    h.input("Calories").props.onChangeText("70"); h.render(); await h.button("Save to diary").props.onPress();
    assert.equal(log.calories, 70); assert.equal(log.fat, 0);
  }
});
test("manual and starter food entry retain existing optional-macro semantics", async () => {
  for (const initialValues of [{}, { foodName: "Starter food", calories: 100, protein: 4, carbs: 10, fat: 2 }]) {
    let log: any;
    const h = form({ initialValues, onSubmit: async (value: any) => { log = value; return true; } });
    assert.equal(h.node("BarcodeNutritionEditor"), undefined);
    h.input("Food name").props.onChangeText("Manual food"); h.render();
    h.input("Calories").props.onChangeText("100"); h.render(); await h.button("Save to diary").props.onPress();
    assert.equal(log.calories, 100); assert.equal(log.protein, initialValues.protein ?? 0);
  }
});

test("confirmation rejects another user's saved result or an unscoped saved route", () => {
  for (const savedForUserId of ["a", "b", undefined]) {
    const h = componentHarness("src/app/confirm-food.tsx", "default", {}, {
      "expo-router": { Redirect: "Redirect", useRouter: () => ({ back() {}, replace() {} }),
        useLocalSearchParams: () => ({ foodResult: serializeFoodResult({ ...completed, savedForUserId }) }) },
      "../services/foodSearch/foodResultTransport": { deserializeFoodResult },
      "../services/foodSearch/useAccountFoodSearch": { useAccountFoodSearch: () => ({ saveFood: async () => true }) },
      "../components/FoodEntryForm": { FoodEntryForm: "FoodEntryForm" },
      "../context/FoodLogContext": { useFoodLogs: () => ({ addFoodLog: async () => true, isFoodLogMutationPending: false }) },
      "../context/AuthContext": { useAuth: () => ({ authIdentity: { userId: "a", generation: 1 } }) },
      "../utils/diaryRoute": { resolveDiaryDateParam: () => "2026-10-17" },
      "../utils/meal": { getDefaultMealType: () => "Snack", isMealType: () => false },
    });
    assert.equal(!!h.node("FoodEntryForm"), savedForUserId === "a");
    assert.equal(!!h.node("Redirect"), savedForUserId !== "a");
  }
});
