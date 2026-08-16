import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

function getVerificationErrorMessage(code: string | undefined): string {
  switch (code) {
    case "otp_expired":
      return "That code has expired. Request a new code and try again.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "That code is invalid or has expired. Check the code and try again.";
  }
}

function getResendErrorMessage(code: string | undefined): string {
  switch (code) {
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Please wait before requesting another code.";
    default:
      return "We couldn't send another code. Please try again.";
  }
}

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { verifySignupCode, resendSignupCode } = useAuth();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const inputRef = useRef<TextInput>(null);
  const verifyInFlightRef = useRef(false);
  const resendInFlightRef = useRef(false);

  const email = useMemo(() => {
    const value = Array.isArray(emailParam) ? emailParam[0] : emailParam;
    return value?.trim().toLowerCase() ?? "";
  }, [emailParam]);
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (!email) {
      router.replace({
        pathname: "/signup",
        params: { verification: "missing-email" },
      });
    }
  }, [email, router]);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const handleCodeChange = (value: string) => {
    setCode(value.replace(/\D/g, "").slice(0, CODE_LENGTH));
    setFeedback(null);
  };

  const handleVerify = async () => {
    if (!email || code.length !== CODE_LENGTH || verifyInFlightRef.current) return;

    verifyInFlightRef.current = true;
    setIsVerifying(true);
    setFeedback(null);

    try {
      const { data, error } = await verifySignupCode(email, code);

      if (error) {
        setFeedback(getVerificationErrorMessage(error.code));
        inputRef.current?.focus();
        return;
      }

      if (!data.session) {
        setFeedback("We couldn't start your session. Please try again.");
      }
    } catch {
      setFeedback("Something went wrong while verifying your email. Please try again.");
    } finally {
      verifyInFlightRef.current = false;
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email || cooldown > 0 || resendInFlightRef.current) return;

    resendInFlightRef.current = true;
    setIsResending(true);
    setFeedback(null);

    try {
      const { error } = await resendSignupCode(email);

      if (error) {
        setFeedback(getResendErrorMessage(error.code));
        return;
      }

      setCooldown(RESEND_COOLDOWN_SECONDS);
      setCode("");
      setFeedback("A new verification code has been sent.");
      inputRef.current?.focus();
    } catch {
      setFeedback("We couldn't send another code. Please try again.");
    } finally {
      resendInFlightRef.current = false;
      setIsResending(false);
    }
  };

  if (!email) return null;

  const isBusy = isVerifying || isResending;
  const canVerify = code.length === CODE_LENGTH && !isBusy;
  const canResend = cooldown === 0 && !isBusy;

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
            Verify your email
          </Text>

          <Text style={styles.subtitle}>
            Enter the six-digit code sent to{" "}
            <Text style={styles.email}>{email}</Text>.
          </Text>

          <Text style={styles.label}>Verification code</Text>
          <TextInput
            ref={inputRef}
            style={[styles.codeInput, isBusy && styles.inputDisabled]}
            value={code}
            onChangeText={handleCodeChange}
            placeholder="000000"
            placeholderTextColor={theme.colors.placeholder}
            selectionColor={theme.colors.accent}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={CODE_LENGTH}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            returnKeyType="done"
            onSubmitEditing={handleVerify}
            autoFocus
            editable={!isBusy}
            accessibilityLabel="Six-digit verification code"
            accessibilityHint="Enter or paste the code from your email"
            accessibilityState={{ disabled: isBusy }}
          />

          {feedback ? (
            <View
              style={styles.feedbackContainer}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.feedbackText}>{feedback}</Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.primaryButton, !canVerify && styles.primaryButtonDisabled]}
            onPress={handleVerify}
            disabled={!canVerify}
            accessibilityRole="button"
            accessibilityLabel={isVerifying ? "Verifying email" : "Verify and continue"}
            accessibilityState={{ busy: isVerifying, disabled: !canVerify }}
          >
            <Text style={[styles.primaryButtonText, !canVerify && styles.primaryButtonTextDisabled]}>
              {isVerifying ? "Verifying..." : "Verify and continue"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={handleResend}
            disabled={!canResend}
            accessibilityRole="button"
            accessibilityLabel={
              cooldown > 0 ? `Resend code available in ${cooldown} seconds` : "Resend verification code"
            }
            accessibilityState={{ busy: isResending, disabled: !canResend }}
          >
            <Text style={[styles.linkText, !canResend && styles.secondaryActionDisabled]}>
              {isResending
                ? "Sending..."
                : cooldown > 0
                  ? `Resend code in ${cooldown}s`
                  : "Resend code"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.replace("/signup")}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Change email address"
            accessibilityState={{ disabled: isBusy }}
          >
            <Text style={[styles.backText, isBusy && styles.secondaryActionDisabled]}>
              Change email
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
    email: { color: colors.text, fontWeight: "700" },
    label: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
    },
    codeInput: {
      minHeight: 64,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 14,
      color: colors.text,
      fontSize: 28,
      fontWeight: "700",
      letterSpacing: 10,
      textAlign: "center",
      marginBottom: 14,
    },
    inputDisabled: { backgroundColor: colors.disabled, color: colors.disabledText },
    feedbackContainer: {
      backgroundColor: colors.accentMuted,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
    },
    feedbackText: {
      color: colors.text,
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
      marginBottom: 8,
    },
    primaryButtonDisabled: { backgroundColor: colors.disabled },
    primaryButtonText: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
    primaryButtonTextDisabled: { color: colors.disabledText },
    secondaryButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    linkText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
    backText: { color: colors.brand, fontSize: 15, fontWeight: "600" },
    secondaryActionDisabled: { color: colors.disabledText },
  });
}
