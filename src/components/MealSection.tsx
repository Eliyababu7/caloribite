import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";
import type { FoodLog, MealType } from "../types/food";
import { FoodCard } from "./FoodCard";

type MealSectionProps = {
  mealType: MealType;
  foods: FoodLog[];
  onDeleteFood: (id: string) => void;
};

export function MealSection({
  mealType,
  foods,
  onDeleteFood,
}: MealSectionProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const totalCalories = foods.reduce((sum, food) => sum + food.calories, 0);

  const itemLabel = foods.length === 1 ? "item" : "items";

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {mealType}
        </Text>

        <Text
          style={styles.summary}
          accessibilityLabel={`${foods.length} ${itemLabel}, ${totalCalories} kilocalories`}
        >
          {foods.length} {itemLabel} • {totalCalories} kcal
        </Text>
      </View>

      {foods.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No food added to this meal.</Text>
        </View>
      ) : (
        foods.map((food) => (
          <FoodCard
            key={food.id}
            food={food}
            onDelete={() => onDeleteFood(food.id)}
          />
        ))
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const { colors } = theme;

  return StyleSheet.create({
    section: {
      marginBottom: 18,
    },

    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 10,
    },

    title: {
      fontSize: 19,
      fontWeight: "800",
      color: colors.text,
    },

    summary: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
      textAlign: "right",
    },

    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
    },

    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
  });
}
