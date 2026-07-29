import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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

import { PasswordInput } from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";
import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";

type FormFeedback = {
  type: "error" | "success";
  message: string;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getSignupErrorMessage(code: string | undefined): string {
  switch (code) {
    case "email_address_invalid":
      return "Enter a valid email address.";
    case "weak_password":
      return "Choose a stronger password and try again.";
    case "signup_disabled":
      return "Account creation is currently unavailable. Please try again later.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many signup attempts. Please wait a moment and try again.";
    default:
      return "We couldn't create your account. Please check your connection and try again.";
  }
}

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();

  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!password) setIsPasswordVisible(false);
  }, [password]);

  useEffect(() => {
    if (!confirmPassword) setIsConfirmPasswordVisible(false);
  }, [confirmPassword]);

  useFocusEffect(
    useCallback(
      () => () => {
        setIsPasswordVisible(false);
        setIsConfirmPasswordVisible(false);
      },
      [],
    ),
  );

  const clearFeedback = () => {
    setFeedback(null);
  };

  const handleCreateAccount = async () => {
    if (isSubmitting) {
      return;
    }

    setFeedback(null);

    const normalizedFullName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedFullName) {
      setFeedback({ type: "error", message: "Enter your full name." });
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setFeedback({ type: "error", message: "Enter a valid email address." });
      return;
    }

    if (password.length < 8) {
      setFeedback({
        type: "error",
        message: "Create a password with at least 8 characters.",
      });
      return;
    }

    if (confirmPassword !== password) {
      setFeedback({ type: "error", message: "The passwords do not match." });
      return;
    }

    setFullName(normalizedFullName);
    setEmail(normalizedEmail);
    setIsSubmitting(true);

    try {
      const { data, error } = await signUp(
        normalizedFullName,
        normalizedEmail,
        password,
      );

      if (error) {
        setFeedback({
          type: "error",
          message: getSignupErrorMessage(error.code),
        });
        return;
      }

      if (data.session) {
        setIsPasswordVisible(false);
        setIsConfirmPasswordVisible(false);
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setIsPasswordVisible(false);
      setIsConfirmPasswordVisible(false);
      setFeedback({
        type: "success",
        message:
          "Please check your inbox. If this address is eligible for registration, you'll receive confirmation instructions shortly.",
      });
    } catch {
      setFeedback({
        type: "error",
        message: "Something went wrong while creating your account. Please try again.",
      });
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
            Create your account
          </Text>

          <Text style={styles.subtitle}>
            Start tracking your meals and fitness progress with CaloriBite.
          </Text>

          <Text style={styles.label}>Full name</Text>

          <TextInput
            style={[styles.input, isSubmitting && styles.inputDisabled]}
            value={fullName}
            onChangeText={(value) => {
              setFullName(value);
              clearFeedback();
            }}
            placeholder="Your full name"
            placeholderTextColor={theme.colors.placeholder}
            selectionColor={theme.colors.accent}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            accessibilityLabel="Full name"
            accessibilityState={{ disabled: isSubmitting }}
            editable={!isSubmitting}
          />

          <Text style={styles.label}>Email address</Text>

          <TextInput
            style={[styles.input, isSubmitting && styles.inputDisabled]}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              clearFeedback();
            }}
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

          <PasswordInput
            label="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              clearFeedback();
            }}
            isVisible={isPasswordVisible}
            onToggleVisibility={() =>
              setIsPasswordVisible((visible) => !visible)
            }
            disabled={isSubmitting}
            placeholder="Create a password"
            placeholderTextColor={theme.colors.placeholder}
            selectionColor={theme.colors.accent}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            accessibilityLabel="Password"
            accessibilityState={{ disabled: isSubmitting }}
          />

          <PasswordInput
            label="Confirm password"
            value={confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              clearFeedback();
            }}
            isVisible={isConfirmPasswordVisible}
            onToggleVisibility={() =>
              setIsConfirmPasswordVisible((visible) => !visible)
            }
            disabled={isSubmitting}
            placeholder="Confirm your password"
            placeholderTextColor={theme.colors.placeholder}
            selectionColor={theme.colors.accent}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleCreateAccount}
            accessibilityLabel="Confirm password"
            accessibilityState={{ disabled: isSubmitting }}
          />

          {feedback ? (
            <View
              style={[
                styles.feedbackContainer,
                feedback.type === "success" && styles.successContainer,
              ]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Text
                style={[
                  styles.feedbackText,
                  feedback.type === "success" && styles.successText,
                ]}
              >
                {feedback.message}
              </Text>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.primaryButton,
              isSubmitting && styles.primaryButtonDisabled,
            ]}
            onPress={handleCreateAccount}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel={
              isSubmitting ? "Creating account" : "Create account"
            }
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
              {isSubmitting ? "Creating account..." : "Create account"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace("/login")}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Log in to an existing account"
            accessibilityState={{ disabled: isSubmitting }}
            hitSlop={8}
          >
            <Text
              style={[
                styles.linkText,
                isSubmitting && styles.secondaryActionDisabled,
              ]}
            >
              Already have an account? Log in
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

    feedbackContainer: {
      backgroundColor: colors.accentMuted,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
    },

    feedbackText: {
      color: colors.danger,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },

    successContainer: {
      borderColor: colors.accent,
    },

    successText: {
      color: colors.brand,
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
