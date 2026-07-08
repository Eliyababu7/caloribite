import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { useFoodLogs } from "../context/FoodLogContext";

export default function AddFoodScreen() {
  const router = useRouter();
  const { addFoodLog } = useFoodLogs();

  const [foodName, setFoodName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const handleSave = () => {
    if (!foodName.trim()) {
      alert("Please enter the food name.");
      return;
    }

    if (!calories.trim()) {
      alert("Please enter the calories.");
      return;
    }

    addFoodLog({
      foodName: foodName.trim(),
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fat: Number(fat) || 0,
    });

    router.replace("/dashboard");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Add food</Text>

      <Text style={styles.subtitle}>
        Enter the food details manually. Later we will add barcode scan and AI
        meal photo scanning.
      </Text>

      <Text style={styles.label}>Food name</Text>
      <TextInput
        style={styles.input}
        placeholder="Example: Chicken curry"
        value={foodName}
        onChangeText={setFoodName}
      />

      <Text style={styles.label}>Calories</Text>
      <TextInput
        style={styles.input}
        placeholder="Example: 450"
        keyboardType="numeric"
        value={calories}
        onChangeText={setCalories}
      />

      <Text style={styles.label}>Protein</Text>
      <TextInput
        style={styles.input}
        placeholder="Example: 35"
        keyboardType="numeric"
        value={protein}
        onChangeText={setProtein}
      />

      <Text style={styles.label}>Carbs</Text>
      <TextInput
        style={styles.input}
        placeholder="Example: 40"
        keyboardType="numeric"
        value={carbs}
        onChangeText={setCarbs}
      />

      <Text style={styles.label}>Fat</Text>
      <TextInput
        style={styles.input}
        placeholder="Example: 15"
        keyboardType="numeric"
        value={fat}
        onChangeText={setFat}
      />

      <Pressable style={styles.primaryButton} onPress={handleSave}>
        <Text style={styles.primaryButtonText}>Save food</Text>
      </Pressable>

      <Pressable onPress={() => router.back()}>
        <Text style={styles.backText}>Back to dashboard</Text>
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
