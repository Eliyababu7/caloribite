import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DateNavigator } from "../components/DateNavigator";
import { MacroCard } from "../components/MacroCard";
import { MealSection } from "../components/MealSection";
import { ProgressBar } from "../components/ProgressBar";
import { useFoodLogs } from "../context/FoodLogContext";
import {
  calculateNutritionTotals,
  createNutritionSummary,
} from "../services/nutrition/nutritionService";
import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";
import type { FoodLog, MealType } from "../types/food";
import type { NutritionTargets } from "../types/nutrition";
import { addDaysToDateKey, getLocalDateKey } from "../utils/date";
import { resolveDiaryDateParam } from "../utils/diaryRoute";
import { MEAL_TYPES } from "../utils/meal";

const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  calories: 2000,
  protein: 120,
  carbs: 220,
  fat: 65,
};

export default function DashboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { foodLogs, deleteFoodLog, clearFoodLogsForDate } = useFoodLogs();

  const todayDateKey = getLocalDateKey();
  const requestedDateKey = resolveDiaryDateParam(params.loggedDate);

  const [selectedDateKey, setSelectedDateKey] = useState(requestedDateKey);

  useEffect(() => {
    setSelectedDateKey(requestedDateKey);
  }, [requestedDateKey]);

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
      groupedFoods[food.mealType].push(food);
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
    router.push({
      pathname: "/search-food",
      params: {
        loggedDate: selectedDateKey,
      },
    });
  };

  const handleClearDay = () => {
    Alert.alert(
      "Clear this diary day?",
      "This will permanently delete every food entry recorded for this date.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear day",
          style: "destructive",
          onPress: () => clearFoodLogsForDate(selectedDateKey),
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Math.max(insets.top + 24, 24),
          paddingBottom: Math.max(insets.bottom + 24, 24),
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.greeting}>Hello, Eliya 👋</Text>

        <Text style={styles.title} accessibilityRole="header">
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
            <View style={styles.cardLead}>
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
            accessibilityLabel="Calorie progress"
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
            style={styles.lastMacroCard}
          />
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={handleAddFood}
          accessibilityRole="button"
          accessibilityLabel={
            isViewingToday ? "Add food" : "Add food to the selected diary day"
          }
        >
          <Text style={styles.primaryButtonText}>
            {isViewingToday ? "Add food" : "Add food to this day"}
          </Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderTitle} accessibilityRole="header">
            {isViewingToday ? "Today’s food" : "Food diary"}
          </Text>

          {selectedFoodLogs.length > 0 && (
            <Pressable
              onPress={handleClearDay}
              accessibilityRole="button"
              accessibilityLabel="Clear all food for this diary day"
              hitSlop={8}
            >
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
      </View>
    </ScrollView>
  );
}

function createStyles(theme: AppTheme) {
  const { colors } = theme;

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },

    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
    },

    content: {
      width: "100%",
      maxWidth: 1100,
      alignSelf: "center",
    },

    greeting: {
      fontSize: 18,
      color: colors.textSecondary,
      marginBottom: 8,
    },

    title: {
      fontSize: 34,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 24,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 24,
      marginBottom: 22,
      borderWidth: 1,
      borderColor: colors.border,
    },

    cardTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },

    cardLead: {
      flex: 1,
      minWidth: 0,
    },

    cardLabel: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 10,
    },

    calorieNumber: {
      fontSize: 42,
      lineHeight: 50,
      fontWeight: "800",
      color: colors.accent,
      marginBottom: 18,
    },

    targetBadge: {
      backgroundColor: colors.accentMuted,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
    },

    targetBadgeText: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: "800",
    },

    calorieProgressBar: {
      marginBottom: 18,
    },

    calorieSummaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 16,
      marginBottom: 14,
    },

    remainingSummary: {
      alignItems: "flex-end",
    },

    summaryLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 4,
    },

    summaryValue: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text,
    },

    cardSubText: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 22,
    },

    sectionTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 14,
    },

    macroCard: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 20,
      marginBottom: 28,
      borderWidth: 1,
      borderColor: colors.border,
    },

    lastMacroCard: {
      marginBottom: 0,
    },

    primaryButton: {
      minHeight: 52,
      backgroundColor: colors.brand,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 30,
    },

    primaryButtonText: {
      color: colors.onBrand,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    },

    sectionHeader: {
      marginBottom: 14,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },

    sectionHeaderTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
    },

    clearText: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: "800",
    },

    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 22,
      borderWidth: 1,
      borderColor: colors.border,
    },

    emptyTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 6,
    },

    emptyText: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 22,
    },
  });
}
