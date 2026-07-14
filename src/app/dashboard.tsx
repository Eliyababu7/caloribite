import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { DateNavigator } from "../components/DateNavigator";
import { MacroCard } from "../components/MacroCard";
import { MealSection } from "../components/MealSection";
import { ProgressBar } from "../components/ProgressBar";
import { useFoodLogs } from "../context/FoodLogContext";
import {
  calculateNutritionTotals,
  createNutritionSummary,
} from "../services/nutrition/nutritionService";
import type { FoodLog, MealType } from "../types/food";
import type { NutritionTargets } from "../types/nutrition";
import { addDaysToDateKey, getLocalDateKey } from "../utils/date";

const MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  calories: 2000,
  protein: 120,
  carbs: 220,
  fat: 65,
};

export default function DashboardScreen() {
  const router = useRouter();

  const { foodLogs, deleteFoodLog, clearFoodLogsForDate } = useFoodLogs();

  const todayDateKey = getLocalDateKey();

  const [selectedDateKey, setSelectedDateKey] = useState(todayDateKey);

  const isViewingToday = selectedDateKey === todayDateKey;

  const selectedFoodLogs = useMemo(
    () => foodLogs.filter((food) => food.loggedDate === selectedDateKey),
    [foodLogs, selectedDateKey],
  );

  const foodsByMeal = useMemo(() => {
    const groupedFoods: Record<MealType, FoodLog[]> = {
      Breakfast: [],
      Lunch: [],
      Dinner: [],
      Snack: [],
    };

    selectedFoodLogs.forEach((food) => {
      const mealType = MEAL_TYPES.includes(food.mealType)
        ? food.mealType
        : "Snack";

      groupedFoods[mealType].push(food);
    });

    return groupedFoods;
  }, [selectedFoodLogs]);

  const nutritionTotals = useMemo(
    () => calculateNutritionTotals(selectedFoodLogs),
    [selectedFoodLogs],
  );

  const nutritionTargets = DEFAULT_NUTRITION_TARGETS;

  const nutritionSummary = createNutritionSummary(
    nutritionTotals,
    nutritionTargets,
  );

  const handlePreviousDate = () => {
    setSelectedDateKey((currentDateKey) => {
      return addDaysToDateKey(currentDateKey, -1) ?? currentDateKey;
    });
  };

  const handleNextDate = () => {
    setSelectedDateKey((currentDateKey) => {
      const nextDateKey = addDaysToDateKey(currentDateKey, 1);

      if (!nextDateKey || nextDateKey > todayDateKey) {
        return currentDateKey;
      }

      return nextDateKey;
    });
  };

  const handleGoToToday = () => {
    setSelectedDateKey(todayDateKey);
  };

  const handleAddFood = () => {
    setSelectedDateKey(todayDateKey);
    router.push("/add-food");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.greeting}>Hello, Eliya 👋</Text>

      <Text style={styles.title}>
        {isViewingToday ? "Today’s progress" : "Daily progress"}
      </Text>

      <DateNavigator
        selectedDateKey={selectedDateKey}
        todayDateKey={todayDateKey}
        onPrevious={handlePreviousDate}
        onNext={handleNextDate}
        onToday={handleGoToToday}
      />

      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View>
            <Text style={styles.cardLabel}>Calories consumed</Text>

            <Text style={styles.calorieNumber}>
              {nutritionTotals.calories} kcal
            </Text>
          </View>

          <View style={styles.targetBadge}>
            <Text style={styles.targetBadgeText}>
              {nutritionSummary.calorieProgress}%
            </Text>
          </View>
        </View>

        <ProgressBar
          value={nutritionTotals.calories}
          max={nutritionTargets.calories}
          height={12}
          trackColor="#F0E3DC"
          fillColor="#FF6B4A"
          style={styles.calorieProgressBar}
        />

        <View style={styles.calorieSummaryRow}>
          <View>
            <Text style={styles.summaryLabel}>Target</Text>

            <Text style={styles.summaryValue}>
              {nutritionTargets.calories} kcal
            </Text>
          </View>

          <View style={styles.remainingSummary}>
            <Text style={styles.summaryLabel}>Remaining</Text>

            <Text style={styles.summaryValue}>
              {nutritionSummary.remainingCalories} kcal
            </Text>
          </View>
        </View>

        <Text style={styles.cardSubText}>
          {selectedFoodLogs.length === 0
            ? "No food was logged for this day."
            : `${selectedFoodLogs.length} food item${
                selectedFoodLogs.length === 1 ? "" : "s"
              } logged ${isViewingToday ? "today" : "on this day"}.`}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Macro balance</Text>

      <View style={styles.macroCard}>
        <MacroCard
          label="Protein"
          current={nutritionTotals.protein}
          target={nutritionTargets.protein}
        />

        <MacroCard
          label="Carbs"
          current={nutritionTotals.carbs}
          target={nutritionTargets.carbs}
        />

        <MacroCard
          label="Fat"
          current={nutritionTotals.fat}
          target={nutritionTargets.fat}
        />
      </View>

      <Pressable style={styles.primaryButton} onPress={handleAddFood}>
        <Text style={styles.primaryButtonText}>
          {isViewingToday ? "Add food" : "Add food for today"}
        </Text>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {isViewingToday ? "Today’s food" : "Food diary"}
        </Text>

        {selectedFoodLogs.length > 0 && (
          <Pressable onPress={() => clearFoodLogsForDate(selectedDateKey)}>
            <Text style={styles.clearText}>Clear day</Text>
          </Pressable>
        )}
      </View>

      {selectedFoodLogs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No food logged</Text>

          <Text style={styles.emptyText}>
            No food entries were recorded for this date.
          </Text>
        </View>
      ) : (
        MEAL_TYPES.map((mealType) => (
          <MealSection
            key={mealType}
            mealType={mealType}
            foods={foodsByMeal[mealType]}
            onDeleteFood={deleteFoodLog}
          />
        ))
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#FFF7F2",
    padding: 24,
    paddingTop: 70,
  },

  greeting: {
    fontSize: 18,
    color: "#425756",
    marginBottom: 8,
  },

  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#143D3C",
    marginBottom: 24,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "#E6DCD6",
  },

  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  cardLabel: {
    fontSize: 16,
    color: "#425756",
    marginBottom: 10,
  },

  calorieNumber: {
    fontSize: 42,
    fontWeight: "800",
    color: "#FF6B4A",
    marginBottom: 18,
  },

  targetBadge: {
    backgroundColor: "#FFF0E9",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },

  targetBadgeText: {
    color: "#FF6B4A",
    fontSize: 15,
    fontWeight: "800",
  },

  calorieProgressBar: {
    marginBottom: 18,
  },

  calorieSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  remainingSummary: {
    alignItems: "flex-end",
  },

  summaryLabel: {
    fontSize: 13,
    color: "#425756",
    marginBottom: 4,
  },

  summaryValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#143D3C",
  },

  cardSubText: {
    fontSize: 15,
    color: "#425756",
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#143D3C",
    marginBottom: 14,
  },

  macroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "#E6DCD6",
  },

  primaryButton: {
    backgroundColor: "#143D3C",
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    marginBottom: 30,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  sectionHeader: {
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  clearText: {
    color: "#FF6B4A",
    fontSize: 15,
    fontWeight: "800",
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E6DCD6",
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#143D3C",
    marginBottom: 6,
  },

  emptyText: {
    fontSize: 15,
    color: "#425756",
    lineHeight: 22,
  },
});
