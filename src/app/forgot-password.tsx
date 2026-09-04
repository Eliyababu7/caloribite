import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
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
import { isValidEmail, normalizeEmail } from "../utils/authValidation";

type Feedback = { type: "error" | "success"; message: string };

const GENERIC_SUCCESS =
  "If an account exists for that email, we’ve sent password-reset instructions.";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { requestPasswordReset } = useAuth();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const submissionRef = useRef(false);
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submissionRef.current) return;

    setFeedback(null);
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      setFeedback({ type: "error", message: "Enter a valid email address." });
      return;
    }

    submissionRef.current = true;
    setEmail(normalizedEmail);
    setIsSubmitting(true);

    try {
      const result = await requestPasswordReset(normalizedEmail);

      if (result.status === "sent") {
        setFeedback({ type: "success", message: GENERIC_SUCCESS });
      } else if (result.status === "rate-limit") {
        setFeedback({
          type: "error",
          message: "Too many requests. Please wait before trying again.",
        });
      } else if (result.status === "network") {
        setFeedback({
          type: "error",
          message: "Check your connection and try again.",
        });
      } else {
        setFeedback({
          type: "error",
          message: "Password recovery is temporarily unavailable. Please try again later.",
        });
      }
    } finally {
      submissionRef.current = false;
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
            Reset your password
          </Text>
          <Text style={styles.subtitle}>
            Enter your account email and we’ll send password-reset instructions.
          </Text>

          <Text style={styles.label}>Email address</Text>
          <TextInput
            style={[styles.input, isSubmitting && styles.inputDisabled]}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setFeedback(null);
            }}
            placeholder="you@example.com"
            placeholderTextColor={theme.colors.placeholder}
            selectionColor={theme.colors.accent}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
            editable={!isSubmitting}
            accessibilityLabel="Email address"
            accessibilityState={{ disabled: isSubmitting }}
          />

          {feedback ? (
            <View
              style={[
                styles.feedback,
                feedback.type === "success" && styles.successFeedback,
              ]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.feedbackText}>{feedback.message}</Text>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.primaryButton,
              isSubmitting && styles.primaryButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel={
              isSubmitting ? "Sending reset instructions" : "Send reset instructions"
            }
            accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
          >
            <Text
              style={[
                styles.primaryButtonText,
                isSubmitting && styles.disabledText,
              ]}
            >
              {isSubmitting ? "Sending…" : "Send reset instructions"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.replace("/login")}
            disabled={isSubmitting}
            accessibilityRole="link"
            accessibilityLabel="Back to login"
            accessibilityState={{ disabled: isSubmitting }}
          >
            <Text style={[styles.linkText, isSubmitting && styles.disabledText]}>
              Back to login
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
    screen: { flex: 1, backgroundColor: colors.background },
    container: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      backgroundColor: colors.background,
    },
    content: { width: "100%", maxWidth: 520, alignSelf: "center" },
    title: {
      color: colors.text,
      fontSize: 34,
      fontWeight: "800",
      marginBottom: 10,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 28,
    },
    label: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 8,
    },
    input: {
      minHeight: 54,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 16,
      color: colors.text,
      fontSize: 16,
      marginBottom: 14,
    },
    inputDisabled: { backgroundColor: colors.disabled, color: colors.disabledText },
    feedback: {
      backgroundColor: colors.accentMuted,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
    },
    successFeedback: { borderColor: colors.accent },
    feedbackText: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "600" },
    primaryButton: {
      minHeight: 52,
      backgroundColor: colors.brand,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 10,
      marginBottom: 8,
    },
    primaryButtonDisabled: { backgroundColor: colors.disabled },
    primaryButtonText: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
    secondaryButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    linkText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
    disabledText: { color: colors.disabledText },
  });
}
