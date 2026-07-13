import { StyleSheet, Text, View } from "react-native";

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
  const totalCalories = foods.reduce((sum, food) => sum + food.calories, 0);

  const itemLabel = foods.length === 1 ? "item" : "items";

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {mealType}
        </Text>

        <Text style={styles.summary}>
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

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },

  title: {
    fontSize: 19,
    fontWeight: "800",
    color: "#143D3C",
  },

  summary: {
    fontSize: 13,
    fontWeight: "700",
    color: "#425756",
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E6DCD6",
  },

  emptyText: {
    fontSize: 14,
    color: "#7A8A89",
  },
});
