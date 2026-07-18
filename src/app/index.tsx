import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Math.max(insets.top + 24, 24),
          paddingBottom: Math.max(insets.bottom + 24, 24),
        },
      ]}
    >
      <View
        style={styles.logoCircle}
        accessible
        accessibilityLabel="CaloriBite logo"
      >
        <Text style={styles.logoText}>CB</Text>
      </View>

      <Text style={styles.title} accessibilityRole="header">
        CaloriBite
      </Text>

      <Text style={styles.tagline}>Every bite. Every rep. Every result.</Text>

      <Text style={styles.description}>
        Track your meals, calories, protein, and fitness progress in one simple
        app.
      </Text>

      <Pressable
        style={styles.primaryButton}
        onPress={() => router.push("/signup")}
        accessibilityRole="button"
        accessibilityLabel="Get started"
        accessibilityHint="Opens account registration"
      >
        <Text style={styles.primaryButtonText}>Get Started</Text>
      </Pressable>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => router.push("/login")}
        accessibilityRole="button"
        accessibilityLabel="I already have an account"
        accessibilityHint="Opens the login screen"
      >
        <Text style={styles.secondaryButtonText}>
          I already have an account
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(theme: AppTheme) {
  const { colors } = theme;

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },

    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },

    logoCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },

    logoText: {
      color: colors.onAccent,
      fontSize: 32,
      fontWeight: "800",
    },

    title: {
      fontSize: 42,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 8,
      textAlign: "center",
    },

    tagline: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.accent,
      marginBottom: 18,
      textAlign: "center",
    },

    description: {
      width: "100%",
      maxWidth: 420,
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 24,
      marginBottom: 32,
    },

    primaryButton: {
      width: "100%",
      maxWidth: 340,
      minHeight: 52,
      backgroundColor: colors.brand,
      paddingVertical: 16,
      paddingHorizontal: 32,
      borderRadius: 999,
      marginBottom: 14,
      alignItems: "center",
      justifyContent: "center",
    },

    primaryButtonText: {
      color: colors.onBrand,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    },

    secondaryButton: {
      minHeight: 48,
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: "center",
      justifyContent: "center",
    },

    secondaryButtonText: {
      color: colors.brand,
      fontSize: 15,
      fontWeight: "600",
      textAlign: "center",
    },
  });
}
