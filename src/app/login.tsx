import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleLogin = () => {
    // Temporary navigation until Supabase authentication is added.
    router.replace("/dashboard");
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(insets.top + 24, 24),
            paddingBottom: Math.max(insets.bottom + 24, 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.content}>
          <Text style={styles.title} accessibilityRole="header">
            Welcome back
          </Text>

          <Text style={styles.subtitle}>
            Log in to continue tracking your calories and progress.
          </Text>

          <Text style={styles.label}>Email address</Text>

          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={theme.colors.placeholder}
            selectionColor={theme.colors.accent}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            accessibilityLabel="Email address"
          />

          <Text style={styles.label}>Password</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor={theme.colors.placeholder}
            selectionColor={theme.colors.accent}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            accessibilityLabel="Password"
          />

          <Pressable
            style={styles.primaryButton}
            onPress={handleLogin}
            accessibilityRole="button"
            accessibilityLabel="Log in"
          >
            <Text style={styles.primaryButtonText}>Log in</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/signup")}
            accessibilityRole="button"
            accessibilityLabel="Create a CaloriBite account"
            hitSlop={8}
          >
            <Text style={styles.linkText}>
              New to CaloriBite? Create account
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
      justifyContent: "center",
      paddingHorizontal: 24,
    },

    content: {
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
    },

    title: {
      fontSize: 34,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 10,
    },

    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      lineHeight: 24,
      marginBottom: 28,
    },

    label: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
    },

    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 16,
      fontSize: 16,
      color: colors.text,
      marginBottom: 14,
    },

    primaryButton: {
      minHeight: 52,
      backgroundColor: colors.brand,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 10,
      marginBottom: 18,
    },

    primaryButtonText: {
      color: colors.onBrand,
      fontSize: 16,
      fontWeight: "700",
    },

    linkText: {
      color: colors.accent,
      textAlign: "center",
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 18,
    },

    backText: {
      color: colors.brand,
      textAlign: "center",
      fontSize: 15,
      fontWeight: "600",
    },
  });
}
