import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";
import type { FoodLog } from "../types/food";
import { formatCalories, formatMacroGrams } from "../utils/formatNutrition";

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
          {food.mealType} • P {formatMacroGrams(food.protein)} g • C {formatMacroGrams(food.carbs)} g • F {formatMacroGrams(food.fat)} g
        </Text>
      </View>

      <View style={styles.foodRight}>
        <Text style={styles.foodCalories} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatCalories(food.calories)} kcal</Text>

        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${food.foodName}`}
          accessibilityHint="Removes this food from your diary"
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={8}
          style={styles.deleteButton}
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
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },

    foodInfo: {
      flex: 1,
      flexBasis: 140,
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
      flexShrink: 1,
      maxWidth: "100%",
      alignItems: "flex-end",
    },

    foodCalories: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.accent,
      textAlign: "right",
    },

    deleteButton: {
      minWidth: 48,
      minHeight: 48,
      marginTop: 6,
      paddingHorizontal: 8,
      alignItems: "center",
      justifyContent: "center",
    },

    deleteText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "700",
    },

    disabledText: {
      color: colors.disabledText,
    },
  });
}
