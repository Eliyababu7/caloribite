import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFoodLogs } from "../context/FoodLogContext";

export default function DashboardScreen() {
  const router = useRouter();

  const {
    foodLogs,
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
    deleteFoodLog,
    clearFoodLogs,
  } = useFoodLogs();

  const dailyCalorieTarget = 2000;
  const remainingCalories = Math.max(dailyCalorieTarget - totalCalories, 0);
  const progressPercentage = Math.min(
    Math.round((totalCalories / dailyCalorieTarget) * 100),
    100,
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.greeting}>Hello, Eliya 👋</Text>

      <Text style={styles.title}>Today’s progress</Text>

      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View>
            <Text style={styles.cardLabel}>Calories consumed</Text>
            <Text style={styles.calorieNumber}>{totalCalories} kcal</Text>
          </View>

          <View style={styles.targetBadge}>
            <Text style={styles.targetBadgeText}>{progressPercentage}%</Text>
          </View>
        </View>

        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${progressPercentage}%` },
            ]}
          />
        </View>

        <View style={styles.calorieSummaryRow}>
          <View>
            <Text style={styles.summaryLabel}>Target</Text>
            <Text style={styles.summaryValue}>{dailyCalorieTarget} kcal</Text>
          </View>

          <View>
            <Text style={styles.summaryLabel}>Remaining</Text>
            <Text style={styles.summaryValue}>{remainingCalories} kcal</Text>
          </View>
        </View>

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

        {foodLogs.length > 0 && (
          <Pressable onPress={clearFoodLogs}>
            <Text style={styles.clearText}>Clear all</Text>
          </Pressable>
        )}
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

            <View style={styles.foodRight}>
              <Text style={styles.foodCalories}>{food.calories} kcal</Text>

              <Pressable onPress={() => deleteFoodLog(food.id)}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
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
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
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
    marginBottom: 18,
  },
  targetBadge: {
    backgroundColor: "#FFF0E9",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  targetBadgeText: {
    color: "#FF6B4A",
    fontSize: 15,
    fontWeight: "800",
  },
  progressBarBackground: {
    height: 12,
    backgroundColor: "#F0E3DC",
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 18,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#FF6B4A",
    borderRadius: 999,
  },
  calorieSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#425756",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#143D3C",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#143D3C",
  },
  clearText: {
    color: "#FF6B4A",
    fontSize: 15,
    fontWeight: "800",
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
