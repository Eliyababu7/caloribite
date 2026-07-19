import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
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

import { useAuth } from "../context/AuthContext";
import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";

function getLoginErrorMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "The email address or password is incorrect.";
    case "email_not_confirmed":
      return "Confirm your email address before logging in.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many login attempts. Please wait a moment and try again.";
    default:
      return "We couldn't log you in. Please check your connection and try again.";
  }
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setFormError(null);
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setFormError(null);
  };

  const handleLogin = async () => {
    if (isSubmitting) {
      return;
    }

    setFormError(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail && !password) {
      setFormError("Enter your email address and password.");
      return;
    }

    if (!normalizedEmail) {
      setFormError("Enter your email address.");
      return;
    }

    if (!password) {
      setFormError("Enter your password.");
      return;
    }

    setEmail(normalizedEmail);
    setIsSubmitting(true);

    try {
      const { data, error } = await signIn(normalizedEmail, password);

      if (error) {
        setFormError(getLoginErrorMessage(error.code));
        return;
      }

      if (data.session) {
        router.replace("/dashboard");
        return;
      }

      setFormError("We couldn't start your session. Please try again.");
    } catch {
      setFormError("Something went wrong while logging in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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
            style={[styles.input, isSubmitting && styles.inputDisabled]}
            value={email}
            onChangeText={handleEmailChange}
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
            accessibilityState={{ disabled: isSubmitting }}
            editable={!isSubmitting}
          />

          <Text style={styles.label}>Password</Text>

          <TextInput
            style={[styles.input, isSubmitting && styles.inputDisabled]}
            value={password}
            onChangeText={handlePasswordChange}
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
            accessibilityState={{ disabled: isSubmitting }}
            editable={!isSubmitting}
          />

          {formError ? (
            <View
              style={styles.errorContainer}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.primaryButton,
              isSubmitting && styles.primaryButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel={isSubmitting ? "Logging in" : "Log in"}
            accessibilityState={{
              busy: isSubmitting,
              disabled: isSubmitting,
            }}
          >
            <Text
              style={[
                styles.primaryButtonText,
                isSubmitting && styles.primaryButtonTextDisabled,
              ]}
            >
              {isSubmitting ? "Logging in..." : "Log in"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/signup")}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Create a CaloriBite account"
            accessibilityState={{ disabled: isSubmitting }}
            hitSlop={8}
          >
            <Text
              style={[
                styles.linkText,
                isSubmitting && styles.secondaryActionDisabled,
              ]}
            >
              New to CaloriBite? Create account
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityState={{ disabled: isSubmitting }}
            hitSlop={8}
          >
            <Text
              style={[
                styles.backText,
                isSubmitting && styles.secondaryActionDisabled,
              ]}
            >
              Back
            </Text>
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

    inputDisabled: {
      backgroundColor: colors.disabled,
      color: colors.disabledText,
    },

    errorContainer: {
      backgroundColor: colors.accentMuted,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
    },

    errorText: {
      color: colors.danger,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
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

    primaryButtonDisabled: {
      backgroundColor: colors.disabled,
    },

    primaryButtonTextDisabled: {
      color: colors.disabledText,
    },

    secondaryActionDisabled: {
      color: colors.disabledText,
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
