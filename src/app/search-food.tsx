import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const STARTER_FOODS = [
  { foodName: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0 },
  { foodName: "Boiled egg", calories: 78, protein: 6, carbs: 1, fat: 5 },
  {
    foodName: "Chicken breast 100g",
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 4,
  },
  {
    foodName: "Cooked white rice 1 cup",
    calories: 205,
    protein: 4,
    carbs: 45,
    fat: 0,
  },
  {
    foodName: "Salmon fillet 100g",
    calories: 208,
    protein: 20,
    carbs: 0,
    fat: 13,
  },
  {
    foodName: "Greek yogurt 100g",
    calories: 59,
    protein: 10,
    carbs: 4,
    fat: 0,
  },
  { foodName: "Chicken curry", calories: 450, protein: 35, carbs: 40, fat: 15 },
  {
    foodName: "Vegetable biryani",
    calories: 420,
    protein: 9,
    carbs: 70,
    fat: 12,
  },
];

export default function SearchFoodScreen() {
  const router = useRouter();
  const [searchText, setSearchText] = useState("");

  const filteredFoods = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) return STARTER_FOODS;

    return STARTER_FOODS.filter((food) =>
      food.foodName.toLowerCase().includes(query),
    );
  }, [searchText]);

  const handleSelectFood = (food: (typeof STARTER_FOODS)[number]) => {
    router.push({
      pathname: "/confirm-food",
      params: {
        foodName: food.foodName,
        calories: String(food.calories),
        protein: String(food.protein),
        carbs: String(food.carbs),
        fat: String(food.fat),
      },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Search food</Text>

      <Text style={styles.subtitle}>
        Search our starter food database. Select a food, then confirm or edit
        the details before saving.
      </Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search banana, rice, chicken..."
        value={searchText}
        onChangeText={setSearchText}
        autoFocus
      />

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>Results</Text>
        <Text style={styles.resultsCount}>{filteredFoods.length} found</Text>
      </View>

      {filteredFoods.map((food) => (
        <Pressable
          key={food.foodName}
          style={styles.foodCard}
          onPress={() => handleSelectFood(food)}
        >
          <View style={styles.foodInfo}>
            <Text style={styles.foodName}>{food.foodName}</Text>
            <Text style={styles.foodMacros}>
              P {food.protein}g • C {food.carbs}g • F {food.fat}g
            </Text>
          </View>

          <View style={styles.foodRight}>
            <Text style={styles.foodCalories}>{food.calories} kcal</Text>
            <Text style={styles.addText}>Select</Text>
          </View>
        </Pressable>
      ))}

      <Pressable onPress={() => router.back()}>
        <Text style={styles.backText}>Back</Text>
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
    marginBottom: 22,
  },
  searchInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6DCD6",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 22,
  },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  resultsTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#143D3C",
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF6B4A",
  },
  foodCard: {
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
    marginBottom: 6,
  },
  addText: {
    color: "#143D3C",
    fontSize: 13,
    fontWeight: "800",
  },
  backText: {
    color: "#FF6B4A",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 20,
  },
});
