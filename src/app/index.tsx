import { Pressable, StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoText}>CB</Text>
      </View>

      <Text style={styles.title}>CaloriBite</Text>

      <Text style={styles.tagline}>Every bite. Every rep. Every result.</Text>

      <Text style={styles.description}>
        Track your meals, calories, protein, and fitness progress in one simple
        app.
      </Text>

      <Pressable style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Get Started</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>
          I already have an account
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF7F2",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#FF6B4A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  logoText: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
  },
  title: {
    fontSize: 42,
    fontWeight: "800",
    color: "#143D3C",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FF6B4A",
    marginBottom: 18,
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    color: "#425756",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
    maxWidth: 360,
  },
  primaryButton: {
    backgroundColor: "#143D3C",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 999,
    marginBottom: 14,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: "#143D3C",
    fontSize: 15,
    fontWeight: "600",
  },
});
