import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { MealType, NewFoodLog } from "../types/food";
import { formatDiaryDate } from "../utils/date";
import { getDefaultMealType, MEAL_TYPES } from "../utils/meal";

export type FoodEntryInitialValues = {
  mealType?: MealType;
  foodName?: string;
  calories?: string | number;
  protein?: string | number;
  carbs?: string | number;
  fat?: string | number;
};

type FoodEntryFormProps = {
  title: string;
  subtitle: string;
  loggedDate: string;
  initialValues?: FoodEntryInitialValues;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (foodLog: NewFoodLog) => void;
  onCancel: () => void;
};

function getInputValue(value: string | number | undefined): string {
  return value === undefined ? "" : String(value);
}

function parseNutritionNumber(
  value: string,
  label: string,
  required = false,
): number | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    if (required) {
      Alert.alert(
        "Missing information",
        `Please enter ${label.toLowerCase()}.`,
      );
      return null;
    }

    return 0;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    Alert.alert(
      "Invalid value",
      `${label} must be a valid number greater than or equal to zero.`,
    );
    return null;
  }

  return parsedValue;
}

export function FoodEntryForm({
  title,
  subtitle,
  loggedDate,
  initialValues = {},
  submitLabel = "Save to diary",
  cancelLabel = "Back",
  onSubmit,
  onCancel,
}: FoodEntryFormProps) {
  const [mealType, setMealType] = useState<MealType>(
    initialValues.mealType ?? getDefaultMealType(),
  );

  const [foodName, setFoodName] = useState(
    getInputValue(initialValues.foodName),
  );

  const [calories, setCalories] = useState(
    getInputValue(initialValues.calories),
  );

  const [protein, setProtein] = useState(getInputValue(initialValues.protein));

  const [carbs, setCarbs] = useState(getInputValue(initialValues.carbs));

  const [fat, setFat] = useState(getInputValue(initialValues.fat));

  const handleSubmit = () => {
    const trimmedFoodName = foodName.trim();

    if (!trimmedFoodName) {
      Alert.alert("Missing information", "Please enter a food name.");
      return;
    }

    const parsedCalories = parseNutritionNumber(calories, "Calories", true);

    if (parsedCalories === null) {
      return;
    }

    const parsedProtein = parseNutritionNumber(protein, "Protein");

    if (parsedProtein === null) {
      return;
    }

    const parsedCarbs = parseNutritionNumber(carbs, "Carbs");

    if (parsedCarbs === null) {
      return;
    }

    const parsedFat = parseNutritionNumber(fat, "Fat");

    if (parsedFat === null) {
      return;
    }

    onSubmit({
      foodName: trimmedFoodName,
      calories: parsedCalories,
      protein: parsedProtein,
      carbs: parsedCarbs,
      fat: parsedFat,
      mealType,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>

        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.dateCard}>
          <Text style={styles.dateLabel}>Diary date</Text>

          <Text style={styles.dateValue}>{formatDiaryDate(loggedDate)}</Text>
        </View>

        <Text style={styles.label}>Meal</Text>

        <View style={styles.mealRow}>
          {MEAL_TYPES.map((meal) => {
            const isSelected = mealType === meal;

            return (
              <Pressable
                key={meal}
                style={[styles.mealChip, isSelected && styles.mealChipActive]}
                onPress={() => setMealType(meal)}
              >
                <Text
                  style={[
                    styles.mealChipText,
                    isSelected && styles.mealChipTextActive,
                  ]}
                >
                  {meal}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Food name</Text>

        <TextInput
          style={styles.input}
          value={foodName}
          onChangeText={setFoodName}
          placeholder="Food name"
          placeholderTextColor="#82908F"
        />

        <Text style={styles.label}>Calories</Text>

        <TextInput
          style={styles.input}
          value={calories}
          onChangeText={setCalories}
          keyboardType="decimal-pad"
          placeholder="Calories"
          placeholderTextColor="#82908F"
        />

        <Text style={styles.label}>Protein (g)</Text>

        <TextInput
          style={styles.input}
          value={protein}
          onChangeText={setProtein}
          keyboardType="decimal-pad"
          placeholder="Protein"
          placeholderTextColor="#82908F"
        />

        <Text style={styles.label}>Carbs (g)</Text>

        <TextInput
          style={styles.input}
          value={carbs}
          onChangeText={setCarbs}
          keyboardType="decimal-pad"
          placeholder="Carbs"
          placeholderTextColor="#82908F"
        />

        <Text style={styles.label}>Fat (g)</Text>

        <TextInput
          style={styles.input}
          value={fat}
          onChangeText={setFat}
          keyboardType="decimal-pad"
          placeholder="Fat"
          placeholderTextColor="#82908F"
        />

        <Pressable style={styles.primaryButton} onPress={handleSubmit}>
          <Text style={styles.primaryButtonText}>{submitLabel}</Text>
        </Pressable>

        <Pressable onPress={onCancel}>
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </Pressable>
      </View>
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

  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },

  title: {
    fontSize: 36,
    fontWeight: "800",
    color: "#143D3C",
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 16,
    color: "#425756",
    lineHeight: 24,
    marginBottom: 22,
  },

  dateCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6DCD6",
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
  },

  dateLabel: {
    fontSize: 13,
    color: "#425756",
    marginBottom: 4,
  },

  dateValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#143D3C",
  },

  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#143D3C",
    marginBottom: 8,
  },

  mealRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },

  mealChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6DCD6",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },

  mealChipActive: {
    backgroundColor: "#143D3C",
    borderColor: "#143D3C",
  },

  mealChipText: {
    color: "#143D3C",
    fontWeight: "700",
  },

  mealChipTextActive: {
    color: "#FFFFFF",
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6DCD6",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: "#143D3C",
    marginBottom: 16,
  },

  primaryButton: {
    backgroundColor: "#143D3C",
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 18,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  cancelText: {
    color: "#FF6B4A",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
});
