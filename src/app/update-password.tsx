import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { PasswordInput } from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";
import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";
import { passwordsMatch, validateNewPassword } from "../utils/authValidation";

export default function UpdatePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    recoveryState,
    updateRecoveryPassword,
    finishRecoverySession,
    cancelRecovery,
  } = useAuth();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const submissionRef = useRef(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!password) setPasswordVisible(false);
  }, [password]);

  useEffect(() => {
    if (!confirmation) setConfirmationVisible(false);
  }, [confirmation]);

  useFocusEffect(
    useCallback(
      () => () => {
        setPasswordVisible(false);
        setConfirmationVisible(false);
      },
      [],
    ),
  );

  const navigateToLogin = useCallback(() => {
    router.replace({
      pathname: "/login",
      params: { passwordReset: "success" },
    });
  }, [router]);

  useEffect(() => {
    if (recoveryState === "completed") navigateToLogin();
  }, [navigateToLogin, recoveryState]);

  const clearSensitiveFields = () => {
    setPassword("");
    setConfirmation("");
    setPasswordVisible(false);
    setConfirmationVisible(false);
  };

  const handleSubmit = async () => {
    if (submissionRef.current || recoveryState !== "ready") return;

    setFeedback(null);
    const passwordError = validateNewPassword(password);

    if (passwordError) {
      setFeedback(passwordError);
      return;
    }

    if (!passwordsMatch(password, confirmation)) {
      setFeedback("The passwords do not match.");
      return;
    }

    submissionRef.current = true;

    try {
      const result = await updateRecoveryPassword(
        password,
        clearSensitiveFields,
      );

      if (result.status === "completed") {
        navigateToLogin();
      } else if (result.status === "sign-out-failed") {
        setFeedback(
          "Your password was updated, but secure sign-out did not finish. Try again to complete recovery.",
        );
      } else if (result.status === "same-password") {
        setFeedback(
          "Choose a new password that is different from your current password.",
        );
      } else if (result.status === "weak-password") {
        setFeedback("Choose a stronger password and try again.");
      } else {
        setFeedback("We couldn’t update your password. Request a new link and try again.");
      }
    } finally {
      submissionRef.current = false;
    }
  };

  const handleCancel = async (destination: "/login" | "/forgot-password") => {
    if (submissionRef.current) return;
    submissionRef.current = true;
    await cancelRecovery();
    router.replace(destination);
  };

  const handleFinishSignOut = async () => {
    if (submissionRef.current) return;
    submissionRef.current = true;
    const finished = await finishRecoverySession();
    submissionRef.current = false;
    if (finished) navigateToLogin();
  };

  const isBusy = recoveryState === "processing" || recoveryState === "completing";

  if (isBusy) {
    return (
      <SafeAreaView style={styles.stateScreen} accessibilityRole="progressbar">
        <Text style={styles.stateText}>Preparing secure password recovery…</Text>
      </SafeAreaView>
    );
  }

  if (recoveryState === "completion-error") {
    return (
      <SafeAreaView style={styles.stateScreen}>
        <Text style={styles.title} accessibilityRole="header">
          Finish password recovery
        </Text>
        <Text style={styles.stateText} accessibilityRole="alert">
          Your password was updated, but secure sign-out did not finish.
        </Text>
        <Pressable
          style={styles.primaryButton}
          onPress={handleFinishSignOut}
          accessibilityRole="button"
          accessibilityLabel="Retry secure sign-out"
        >
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (recoveryState !== "ready") {
    return (
      <SafeAreaView style={styles.stateScreen}>
        <Text style={styles.title} accessibilityRole="header">
          Reset link unavailable
        </Text>
        <Text style={styles.stateText} accessibilityRole="alert">
          This password-reset link is invalid or has expired. Request a new link and try again.
        </Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => handleCancel("/forgot-password")}
          accessibilityRole="button"
          accessibilityLabel="Request a new password-reset link"
        >
          <Text style={styles.primaryButtonText}>Request a new link</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => handleCancel("/login")}
          accessibilityRole="link"
          accessibilityLabel="Back to login"
        >
          <Text style={styles.linkText}>Back to login</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

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
            Choose a new password
          </Text>
          <Text style={styles.subtitle}>
            Use at least eight characters for your new password.
          </Text>

          <PasswordInput
            label="New password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setFeedback(null);
            }}
            isVisible={passwordVisible}
            onToggleVisibility={() => setPasswordVisible((visible) => !visible)}
            placeholder="Enter a new password"
            placeholderTextColor={theme.colors.placeholder}
            selectionColor={theme.colors.accent}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            accessibilityLabel="New password"
          />

          <PasswordInput
            label="Confirm new password"
            value={confirmation}
            onChangeText={(value) => {
              setConfirmation(value);
              setFeedback(null);
            }}
            isVisible={confirmationVisible}
            onToggleVisibility={() =>
              setConfirmationVisible((visible) => !visible)
            }
            placeholder="Confirm your new password"
            placeholderTextColor={theme.colors.placeholder}
            selectionColor={theme.colors.accent}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            accessibilityLabel="Confirm new password"
          />

          {feedback ? (
            <View
              style={styles.feedback}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.feedbackText}>{feedback}</Text>
            </View>
          ) : null}

          <Pressable
            style={styles.primaryButton}
            onPress={handleSubmit}
            accessibilityRole="button"
            accessibilityLabel="Update password"
          >
            <Text style={styles.primaryButtonText}>Update password</Text>
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
    stateScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      backgroundColor: colors.background,
    },
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
      textAlign: "center",
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 28,
      textAlign: "center",
    },
    stateText: {
      color: colors.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      textAlign: "center",
      maxWidth: 520,
      marginBottom: 20,
    },
    feedback: {
      backgroundColor: colors.accentMuted,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
    },
    feedbackText: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: "600" },
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
      minWidth: 220,
    },
    primaryButtonText: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
    secondaryButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    linkText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  });
}
