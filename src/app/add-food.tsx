import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MealType, useFoodLogs } from "../context/FoodLogContext";

export default function ConfirmFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { addFoodLog } = useFoodLogs();

  const [mealType, setMealType] = useState<MealType>("Breakfast");
  const [foodName, setFoodName] = useState(String(params.foodName ?? ""));
  const [calories, setCalories] = useState(String(params.calories ?? ""));
  const [protein, setProtein] = useState(String(params.protein ?? ""));
  const [carbs, setCarbs] = useState(String(params.carbs ?? ""));
  const [fat, setFat] = useState(String(params.fat ?? ""));

  const handleSave = () => {
    if (!foodName.trim()) {
      alert("Please enter a food name.");
      return;
    }

    if (!calories.trim()) {
      alert("Please enter calories.");
      return;
    }

    addFoodLog({
      foodName: foodName.trim(),
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fat: Number(fat) || 0,
      mealType,
    });

    router.replace("/dashboard");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Confirm food</Text>

      <Text style={styles.subtitle}>
        Review and edit the nutrition details before saving this food to your
        diary.
      </Text>

      <Text style={styles.label}>Meal</Text>

      <View style={styles.mealRow}>
        {(["Breakfast", "Lunch", "Dinner", "Snack"] as MealType[]).map(
          (meal) => (
            <Pressable
              key={meal}
              style={[
                styles.mealChip,
                mealType === meal && styles.mealChipActive,
              ]}
              onPress={() => setMealType(meal)}
            >
              <Text
                style={[
                  styles.mealChipText,
                  mealType === meal && styles.mealChipTextActive,
                ]}
              >
                {meal}
              </Text>
            </Pressable>
          ),
        )}
      </View>

      <Text style={styles.label}>Food name</Text>
      <TextInput
        style={styles.input}
        value={foodName}
        onChangeText={setFoodName}
        placeholder="Food name"
      />

      <Text style={styles.label}>Calories</Text>
      <TextInput
        style={styles.input}
        value={calories}
        onChangeText={setCalories}
        keyboardType="numeric"
        placeholder="Calories"
      />

      <Text style={styles.label}>Protein</Text>
      <TextInput
        style={styles.input}
        value={protein}
        onChangeText={setProtein}
        keyboardType="numeric"
        placeholder="Protein"
      />

      <Text style={styles.label}>Carbs</Text>
      <TextInput
        style={styles.input}
        value={carbs}
        onChangeText={setCarbs}
        keyboardType="numeric"
        placeholder="Carbs"
      />

      <Text style={styles.label}>Fat</Text>
      <TextInput
        style={styles.input}
        value={fat}
        onChangeText={setFat}
        keyboardType="numeric"
        placeholder="Fat"
      />

      <Pressable style={styles.primaryButton} onPress={handleSave}>
        <Text style={styles.primaryButtonText}>Save to diary</Text>
      </Pressable>

      <Pressable onPress={() => router.back()}>
        <Text style={styles.backText}>Back to search</Text>
      </Pressable>
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
    marginBottom: 26,
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
  backText: {
    color: "#FF6B4A",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
});
