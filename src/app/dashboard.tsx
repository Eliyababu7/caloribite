import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function DashboardScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Hello, Eliya 👋</Text>

      <Text style={styles.title}>Today’s progress</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Calories consumed</Text>
        <Text style={styles.calorieNumber}>0 kcal</Text>
        <Text style={styles.cardSubText}>
          Your daily tracking will appear here.
        </Text>
      </View>

      <View style={styles.row}>
        <View style={styles.smallCard}>
          <Text style={styles.smallLabel}>Protein</Text>
          <Text style={styles.smallValue}>0g</Text>
        </View>

        <View style={styles.smallCard}>
          <Text style={styles.smallLabel}>Carbs</Text>
          <Text style={styles.smallValue}>0g</Text>
        </View>

        <View style={styles.smallCard}>
          <Text style={styles.smallLabel}>Fat</Text>
          <Text style={styles.smallValue}>0g</Text>
        </View>
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={() => router.push("/add-food")}
      >
        <Text style={styles.primaryButtonText}>Add food</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
