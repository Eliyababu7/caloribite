import assert from "node:assert/strict";
import { test } from "node:test";
import { componentHarness } from "../../services/foodSearch/__tests__/componentHarness";
import * as nutrition from "../../services/nutrition/nutritionService";
import * as date from "../date";
import * as diaryRoute from "../diaryRoute";
import * as meal from "../meal";
import type { FoodLog } from "../../types/food";

const adapters = {
  "react-native": { View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView",
    StyleSheet: { create: (styles: unknown) => styles } },
  "../theme/theme": { useAppTheme: () => ({ colors: {} }) },
  "../services/nutrition/nutritionService": nutrition,
  "./ProgressBar": { ProgressBar: "ProgressBar" },
};
type Harness = ReturnType<typeof componentHarness>;
const text = (h: Harness) => h.nodes().filter(n => n.type === "Text")
  .map(n => Array.isArray(n.props.children) ? n.props.children.flat(Infinity).join("") : n.props.children).join(" | ");
const food: FoodLog = Object.freeze({ id: "fixture", foodName: "Fixture food", calories: 123.99999999999999,
  protein: 0.1 + 0.2, carbs: 10, fat: 2.36, mealType: "Lunch", loggedDate: date.getLocalDateKey(), createdAt: "2026-01-01T00:00:00Z" });

test("FoodCard formats nutrients while keeping the original food and delete action intact", () => {
  const onDelete = async () => {};
  const h = componentHarness("src/components/FoodCard.tsx", "FoodCard", { food, onDelete }, adapters);
  assert.match(text(h), /124 kcal/);
  assert.match(text(h), /P 0.3 g • C 10 g • F 2.4 g/);
  assert.equal(h.button("Delete Fixture food").props.onPress, onDelete);
  assert.equal(food.protein, 0.1 + 0.2);
  const number = h.nodes().find(n => n.type === "Text" && n.props.numberOfLines === 1);
  assert.equal(number?.props.adjustsFontSizeToFit, true);
  h.setProps({ food: { ...food, calories: NaN, protein: null, carbs: 0 } });
  assert.match(text(h), /Unavailable kcal/);
  assert.match(text(h), /P Unavailable g • C 0 g/);
});

test("MacroCard formats grams and whole progress but sends full precision to the bar", () => {
  const current = 0.1 + 0.2;
  const h = componentHarness("src/components/MacroCard.tsx", "MacroCard", { label: "Protein", current, target: 1 }, adapters);
  assert.match(text(h), /0.3 g \/ 1 g/);
  assert.match(text(h), /30% of daily target/);
  assert.equal(h.node("ProgressBar").props.value, current);
  h.setProps({ current: 2 });
  assert.match(text(h), /100% of daily target/);
  h.setProps({ current: Infinity });
  assert.match(text(h), /Daily target progress unavailable/);
  h.setProps({ current: 0 });
  assert.match(text(h), /0 g \/ 1 g/);
  assert.match(text(h), /0% of daily target/);
});

test("meal totals and their accessibility labels share the same display rounding", () => {
  const h = componentHarness("src/components/MealSection.tsx", "MealSection", {
    mealType: "Lunch", foods: [food, food], onDeleteFood: async () => {},
  }, { ...adapters, "./FoodCard": { FoodCard: "FoodCard" } });
  assert.match(text(h), /2 items • 248 kcal/);
  assert.ok(h.nodes().some(n => n.props.accessibilityLabel === "2 items, 248 kilocalories"));
});

test("invalid progress exposes unavailable instead of a genuine zero to accessibility", () => {
  const h = componentHarness("src/components/ProgressBar.tsx", "ProgressBar", { value: Infinity, max: 100 }, adapters);
  let bar = h.nodes().find(n => n.props.accessibilityRole === "progressbar");
  assert.equal(bar?.props.accessibilityValue.text, "Unavailable");
  assert.equal(bar?.props.accessibilityValue.now, undefined);
  h.setProps({ value: 0 });
  bar = h.nodes().find(n => n.props.accessibilityRole === "progressbar");
  assert.equal(bar?.props.accessibilityValue.now, 0);
});

test("dashboard rounds totals and summaries only at render time and preserves over-target logic", () => {
  let targets = { calories: 500.6, protein: 100, carbs: 100, fat: 100 };
  const logs = [{ ...food, calories: 100.1 }, { ...food, calories: 200.2 }];
  const h = componentHarness("src/app/dashboard.tsx", "default", {}, {
    ...adapters,
    "expo-router": { useRouter: () => ({}), useLocalSearchParams: () => ({}) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "../context/AuthContext": { useAuth: () => ({ user: { email: "fixture@example.test", user_metadata: {} }, authIdentity: null }) },
    "../context/FoodLogContext": { useFoodLogs: () => ({ foodLogs: logs }) },
    "../context/NutritionTargetsContext": { useNutritionTargets: () => ({ nutritionTargets: targets, hydrationState: "ready" }) },
    "../utils/date": date, "../utils/diaryRoute": diaryRoute, "../utils/meal": meal,
    "../utils/confirmAction": { confirmAction: async () => false },
    ...Object.fromEntries(["DiaryCloudBackup", "DateNavigator", "MacroCard", "MealSection", "ProgressBar"]
      .map(name => [`../components/${name}`, { [name]: name }])),
  });
  assert.match(text(h), /300 kcal/);
  assert.match(text(h), /501 kcal/);
  assert.match(text(h), /200 kcal/);
  assert.match(text(h), /60%/);
  assert.equal(h.node("ProgressBar").props.value, 100.1 + 200.2);
  targets = { ...targets, calories: 100 }; h.render();
  assert.match(text(h), /100%/);
  assert.match(text(h), /Remaining \| 0 kcal/);
  targets = { ...targets, calories: Infinity }; h.render();
  assert.match(text(h), /Remaining \| Unavailable kcal/);
  assert.doesNotMatch(text(h), /Infinity|NaN/);
});
