import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FoodCard } from "../components/FoodCard";
import { MacroCard } from "../components/MacroCard";
import { ProgressBar } from "../components/ProgressBar";
import { useFoodLogs } from "../context/FoodLogContext";
import { createNutritionSummary } from "../services/nutrition/nutritionService";
import type { NutritionTargets } from "../types/nutrition";
/**
 * Temporary default targets.
 *
 * Later, these values will come from the signed-in user's profile,
 * activity level, weight goal, and nutrition calculation service.
 */
const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  calories: 2000,
  protein: 120,
  carbs: 220,
  fat: 65,
};

export default function DashboardScreen() {
  const router = useRouter();

  const {
    foodLogs,
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
    deleteFoodLog,
    clearFoodLogs,
  } = useFoodLogs();

  const nutritionTargets = DEFAULT_NUTRITION_TARGETS;

  const nutritionSummary = createNutritionSummary(
    {
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fat: totalFat,
    },
    nutritionTargets,
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.greeting}>Hello, Eliya 👋</Text>

      <Text style={styles.title}>Today’s progress</Text>

      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View>
            <Text style={styles.cardLabel}>Calories consumed</Text>

            <Text style={styles.calorieNumber}>{totalCalories} kcal</Text>
          </View>

          <View style={styles.targetBadge}>
            <Text style={styles.targetBadgeText}>
              {nutritionSummary.calorieProgress}%
            </Text>
          </View>
        </View>

        <ProgressBar
          value={totalCalories}
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
          {foodLogs.length === 0
            ? "Your daily tracking will appear here."
            : `${foodLogs.length} food item${
                foodLogs.length === 1 ? "" : "s"
              } logged today.`}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Macro balance</Text>
      <View style={styles.macroCard}>
        <MacroCard
          label="Protein"
          current={totalProtein}
          target={nutritionTargets.protein}
        />

        <MacroCard
          label="Carbs"
          current={totalCarbs}
          target={nutritionTargets.carbs}
        />

        <MacroCard
          label="Fat"
          current={totalFat}
          target={nutritionTargets.fat}
        />
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={() => router.push("/add-food")}
      >
        <Text style={styles.primaryButtonText}>Add food</Text>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today’s food</Text>

        {foodLogs.length > 0 && (
          <Pressable onPress={clearFoodLogs}>
            <Text style={styles.clearText}>Clear all</Text>
          </Pressable>
        )}
      </View>

      {foodLogs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No food logged yet</Text>

          <Text style={styles.emptyText}>
            Add your first meal to start tracking your calories.
          </Text>
        </View>
      ) : (
        foodLogs.map((food) => (
          <FoodCard
            key={food.id}
            food={food}
            onDelete={() => deleteFoodLog(food.id)}
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
