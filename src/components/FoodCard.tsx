import { Pressable, StyleSheet, Text, View } from "react-native";

import type { FoodLog } from "../types/food";

type FoodCardProps = {
  food: FoodLog;
  onDelete: () => void;
};

export function FoodCard({ food, onDelete }: FoodCardProps) {
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
        >
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E6DCD6",
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  foodInfo: {
    flex: 1,
  },

  foodName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#143D3C",
    marginBottom: 6,
  },

  foodMacros: {
    fontSize: 14,
    color: "#425756",
  },

  foodRight: {
    alignItems: "flex-end",
  },

  foodCalories: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FF6B4A",
  },

  deleteText: {
    color: "#C0392B",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
  },
});
