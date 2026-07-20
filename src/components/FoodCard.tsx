import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";
import type { FoodLog } from "../types/food";

type FoodCardProps = {
  food: FoodLog;
  onDelete: () => Promise<void>;
  disabled?: boolean;
};

export function FoodCard({ food, onDelete, disabled = false }: FoodCardProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.card}>
      <View style={styles.foodInfo}>
        <Text style={styles.foodName}>{food.foodName}</Text>

        <Text style={styles.foodMacros}>
          {food.mealType} • P {food.protein}g • C {food.carbs}g • F {food.fat}g
        </Text>
      </View>

      <View style={styles.foodRight}>
        <Text style={styles.foodCalories}>{food.calories} kcal</Text>

        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${food.foodName}`}
          accessibilityHint="Removes this food from your diary"
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={8}
        >
          <Text style={[styles.deleteText, disabled && styles.disabledText]}>
            Delete
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const { colors } = theme;

  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },

    foodInfo: {
      flex: 1,
      minWidth: 0,
    },

    foodName: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 6,
    },

    foodMacros: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },

    foodRight: {
      alignItems: "flex-end",
    },

    foodCalories: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.accent,
      textAlign: "right",
    },

    deleteText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 6,
    },

    disabledText: {
      color: colors.disabledText,
    },
  });
}
