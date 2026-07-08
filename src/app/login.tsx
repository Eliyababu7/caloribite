import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function LoginScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>

      <Text style={styles.subtitle}>
        Log in to continue tracking your calories and progress.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email address"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput style={styles.input} placeholder="Password" secureTextEntry />

      <Pressable
        style={styles.primaryButton}
        onPress={() => router.push("/dashboard")}
      >
        <Text style={styles.primaryButtonText}>Log in</Text>
      </Pressable>

      <Pressable onPress={() => router.push("/signup")}>
        <Text style={styles.linkText}>New to CaloriBite? Create account</Text>
      </Pressable>

      <Pressable onPress={() => router.back()}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF7F2",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#143D3C",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#425756",
    lineHeight: 24,
    marginBottom: 28,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6DCD6",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 14,
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
  linkText: {
    color: "#FF6B4A",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 18,
  },
  backText: {
    color: "#143D3C",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
  },
});
