import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFoodLogs } from "../context/FoodLogContext";

export default function DashboardScreen() {
  const router = useRouter();

  const { foodLogs, totalCalories, totalProtein, totalCarbs, totalFat } =
    useFoodLogs();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.greeting}>Hello, Eliya 👋</Text>

      <Text style={styles.title}>Today’s progress</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Calories consumed</Text>

        <Text style={styles.calorieNumber}>{totalCalories} kcal</Text>

        <Text style={styles.cardSubText}>
          {foodLogs.length === 0
            ? "Your daily tracking will appear here."
            : `${foodLogs.length} food item${
                foodLogs.length > 1 ? "s" : ""
              } logged today.`}
        </Text>
      </View>

      <View style={styles.row}>
        <View style={styles.smallCard}>
          <Text style={styles.smallLabel}>Protein</Text>
          <Text style={styles.smallValue}>{totalProtein}g</Text>
        </View>

        <View style={styles.smallCard}>
          <Text style={styles.smallLabel}>Carbs</Text>
          <Text style={styles.smallValue}>{totalCarbs}g</Text>
        </View>

        <View style={styles.smallCard}>
          <Text style={styles.smallLabel}>Fat</Text>
          <Text style={styles.smallValue}>{totalFat}g</Text>
        </View>
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={() => router.push("/add-food")}
      >
        <Text style={styles.primaryButtonText}>Add food</Text>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today’s food</Text>
      </View>

      {foodLogs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No food logged yet</Text>
          <Text style={styles.emptyText}>
            Add your first meal to start tracking your calories.
          </Text>
        </View>
      ) : (
        foodLogs.map((food) => (
          <View key={food.id} style={styles.foodCard}>
            <View style={styles.foodInfo}>
              <Text style={styles.foodName}>{food.foodName}</Text>
              <Text style={styles.foodMacros}>
                P {food.protein}g • C {food.carbs}g • F {food.fat}g
              </Text>
            </View>

            <Text style={styles.foodCalories}>{food.calories} kcal</Text>
          </View>
        ))
      )}
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
  greeting: {
    fontSize: 18,
    color: "#425756",
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#143D3C",
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E6DCD6",
  },
  cardLabel: {
    fontSize: 16,
    color: "#425756",
    marginBottom: 10,
  },
  calorieNumber: {
    fontSize: 42,
    fontWeight: "800",
    color: "#FF6B4A",
    marginBottom: 8,
  },
  cardSubText: {
    fontSize: 15,
    color: "#425756",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },
  smallCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E6DCD6",
  },
  smallLabel: {
    fontSize: 14,
    color: "#425756",
    marginBottom: 8,
  },
  smallValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#143D3C",
  },
  primaryButton: {
    backgroundColor: "#143D3C",
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    marginBottom: 30,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#143D3C",
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E6DCD6",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#143D3C",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 15,
    color: "#425756",
    lineHeight: 22,
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
  foodCalories: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FF6B4A",
  },
});
