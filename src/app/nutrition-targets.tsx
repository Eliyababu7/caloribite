import { type Href, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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

import { type AuthIdentity, useAuth } from "../context/AuthContext";
import { useNutritionTargets } from "../context/NutritionTargetsContext";
import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";
import {
  DEFAULT_NUTRITION_TARGETS,
  NUTRITION_TARGET_LIMITS,
  type NutritionTargets,
} from "../types/nutrition";

type TargetField = keyof NutritionTargets;
type DraftTargets = Record<TargetField, string>;
type OwnedSaveError = { message: string; owner: AuthIdentity };
type SubmissionOperation = { id: symbol; owner: AuthIdentity };
type FieldDefinition = {
  key: TargetField;
  label: string;
  unit: string;
  min: number;
  max: number;
};

const TARGET_FIELDS: FieldDefinition[] = [
  {
    key: "calories",
    label: "Daily calories",
    unit: "kcal",
    ...NUTRITION_TARGET_LIMITS.calories,
  },
  {
    key: "protein",
    label: "Protein",
    unit: "g",
    ...NUTRITION_TARGET_LIMITS.protein,
  },
  {
    key: "carbs",
    label: "Carbohydrates",
    unit: "g",
    ...NUTRITION_TARGET_LIMITS.carbs,
  },
  {
    key: "fat",
    label: "Fat",
    unit: "g",
    ...NUTRITION_TARGET_LIMITS.fat,
  },
];

function identitiesMatch(
  first: AuthIdentity | null,
  second: AuthIdentity | null,
) {
  return (
    first !== null &&
    second !== null &&
    first.userId === second.userId &&
    first.generation === second.generation
  );
}

function createOwnershipSnapshot(identity: AuthIdentity): AuthIdentity {
  return Object.freeze({
    userId: identity.userId,
    generation: identity.generation,
  });
}

function createDrafts(targets: Readonly<NutritionTargets>): DraftTargets {
  return {
    calories: String(targets.calories),
    protein: String(targets.protein),
    carbs: String(targets.carbs),
    fat: String(targets.fat),
  };
}

function validateDraft(value: string, field: FieldDefinition) {
  const trimmedValue = value.trim();

  if (!/^\d+$/.test(trimmedValue)) {
    return `${field.label} must be a whole number.`;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isFinite(parsedValue)) {
    return `${field.label} must be a finite whole number.`;
  }

  if (parsedValue < field.min || parsedValue > field.max) {
    return `${field.label} must be between ${field.min.toLocaleString()} and ${field.max.toLocaleString()} ${field.unit}.`;
  }

  return null;
}

export default function NutritionTargetsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { authIdentity } = useAuth();
  const authIdentityRef = useRef(authIdentity);
  authIdentityRef.current = authIdentity;

  const {
    nutritionTargets,
    hydrationState,
    hydrationError,
    isSaving,
    saveTargets,
    retryHydration,
  } = useNutritionTargets();

  const [drafts, setDrafts] = useState<DraftTargets>(() =>
    createDrafts(DEFAULT_NUTRITION_TARGETS),
  );
  const [errors, setErrors] =
    useState<Partial<Record<TargetField, string>>>({});
  const [saveError, setSaveError] = useState<OwnedSaveError | null>(null);
  const initializedOwnerRef = useRef<AuthIdentity | null>(null);
  const submissionRef = useRef<SubmissionOperation | null>(null);

  useEffect(() => {
    if (
      nutritionTargets &&
      authIdentity &&
      !identitiesMatch(initializedOwnerRef.current, authIdentity)
    ) {
      initializedOwnerRef.current = authIdentity;
      setDrafts(createDrafts(nutritionTargets));
      setErrors({});
      setSaveError(null);
    }
  }, [authIdentity, nutritionTargets]);

  useEffect(() => {
    if (
      initializedOwnerRef.current &&
      !identitiesMatch(initializedOwnerRef.current, authIdentity)
    ) {
      initializedOwnerRef.current = null;
      setSaveError(null);
    }
  }, [authIdentity]);

  const visibleSaveError =
    saveError && identitiesMatch(saveError.owner, authIdentity)
      ? saveError.message
      : null;
  const draftsBelongToCurrentIdentity =
    nutritionTargets !== null &&
    identitiesMatch(initializedOwnerRef.current, authIdentity);

  const updateDraft = (field: TargetField, value: string) => {
    setDrafts((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSaveError(null);
  };

  const publishSaveFailure = (owner: AuthIdentity) => {
    if (identitiesMatch(authIdentityRef.current, owner)) {
      setSaveError({
        owner,
        message: "Your nutrition targets could not be saved. Please try again.",
      });
    }
  };

  const persistTargets = async (
    targets: NutritionTargets,
    owner: AuthIdentity,
  ) => {
    if (
      submissionRef.current &&
      identitiesMatch(submissionRef.current.owner, owner)
    ) {
      return;
    }

    const submission: SubmissionOperation = {
      id: Symbol("nutritionTargetsSubmission"),
      owner,
    };
    submissionRef.current = submission;

    try {
      const succeeded = await saveTargets(targets, owner);

      if (succeeded && identitiesMatch(authIdentityRef.current, owner)) {
        router.back();
        return;
      }

      publishSaveFailure(owner);
    } catch {
      publishSaveFailure(owner);
    } finally {
      if (submissionRef.current?.id === submission.id) {
        submissionRef.current = null;
      }
    }
  };

  const handleSave = async () => {
    if (isSaving || authIdentity === null || nutritionTargets === null) {
      return;
    }

    const nextErrors: Partial<Record<TargetField, string>> = {};

    for (const field of TARGET_FIELDS) {
      const error = validateDraft(drafts[field.key], field);
      if (error) nextErrors[field.key] = error;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const owner = createOwnershipSnapshot(authIdentity);
    const targets: NutritionTargets = {
      calories: Number(drafts.calories.trim()),
      protein: Number(drafts.protein.trim()),
      carbs: Number(drafts.carbs.trim()),
      fat: Number(drafts.fat.trim()),
    };

    setSaveError(null);
    await persistTargets(targets, owner);
  };

  const handleRestoreDefaults = () => {
    if (isSaving || authIdentity === null || nutritionTargets === null) return;
    const owner = createOwnershipSnapshot(authIdentity);
    const defaultDescription =
      `${DEFAULT_NUTRITION_TARGETS.calories.toLocaleString()} kcal, ` +
      `${DEFAULT_NUTRITION_TARGETS.protein} g protein, ` +
      `${DEFAULT_NUTRITION_TARGETS.carbs} g carbohydrates and ` +
      `${DEFAULT_NUTRITION_TARGETS.fat} g fat`;

    Alert.alert(
      "Restore default targets?",
      `This will replace your saved targets with ${defaultDescription}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore defaults",
          onPress: () => {
            void persistTargets({ ...DEFAULT_NUTRITION_TARGETS }, owner);
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(insets.top + 16, 16),
            paddingBottom: Math.max(insets.bottom + 24, 24),
          },
        ]}
      >
        <View style={styles.content}>
          <Pressable
            onPress={() => router.back()}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityState={{ disabled: isSaving }}
            style={styles.backButton}
          >
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Text style={styles.title} accessibilityRole="header">
            Nutrition targets
          </Text>

          <Text style={styles.guidance}>
            Set your own daily nutrition targets. CaloriBite provides general
            wellness tracking and does not provide medical advice. Speak with a
            qualified healthcare professional if you need personalised medical
            guidance.
          </Text>

          <Text style={styles.limitsNote}>
            The ranges below are broad input-safety limits, not medical
            recommendations.
          </Text>

          <Pressable
            onPress={() => router.push("/health-profile" as Href)}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Calculate nutrition targets from health profile"
            accessibilityState={{ disabled: isSaving }}
            style={[
              styles.profileButton,
              isSaving && styles.disabledControl,
            ]}
          >
            <Text style={styles.profileButtonText}>Calculate from profile</Text>
          </Pressable>

          {hydrationState === "loading" && (
            <Text
              style={styles.stateText}
              accessibilityRole="progressbar"
              accessibilityLiveRegion="polite"
            >
              Loading your nutrition targets…
            </Text>
          )}

          {hydrationState === "error" && (
            <View style={styles.stateCard}>
              <Text
                style={styles.errorText}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                {hydrationError}
              </Text>
              <Pressable
                onPress={retryHydration}
                accessibilityRole="button"
                accessibilityLabel="Retry loading nutrition targets"
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {draftsBelongToCurrentIdentity && (
            <>
              <View style={styles.form}>
                {TARGET_FIELDS.map((field) => {
                  const error = errors[field.key];
                  const inputId = `nutrition-target-${field.key}-input`;
                  const labelId = `nutrition-target-${field.key}-label`;
                  const hintId = `nutrition-target-${field.key}-hint`;
                  const errorId = `nutrition-target-${field.key}-error`;
                  const staticAccessibilityHint =
                    `Enter a whole number from ${field.min} to ${field.max}.`;
                  const accessibilityHint = error
                    ? `${staticAccessibilityHint} Current error: ${error}`
                    : staticAccessibilityHint;
                  const labelRelationship =
                    Platform.OS === "web"
                      ? { "aria-labelledby": labelId }
                      : Platform.OS === "android"
                        ? { accessibilityLabelledBy: labelId }
                        : {};

                  return (
                    <View key={field.key} style={styles.field}>
                      <Text nativeID={labelId} style={styles.label}>
                        {field.label} ({field.unit})
                      </Text>
                      <TextInput
                        nativeID={inputId}
                        value={drafts[field.key]}
                        onChangeText={(value) => updateDraft(field.key, value)}
                        editable={!isSaving}
                        keyboardType="number-pad"
                        inputMode="numeric"
                        maxLength={5}
                        selectTextOnFocus
                        accessibilityLabel={`${field.label} in ${field.unit}`}
                        accessibilityHint={accessibilityHint}
                        accessibilityState={{ disabled: isSaving }}
                        {...labelRelationship}
                        style={[
                          styles.input,
                          error && styles.inputError,
                          isSaving && styles.disabledControl,
                        ]}
                      />
                      <Text nativeID={hintId} style={styles.limitText}>
                        {field.min.toLocaleString()}–
                        {field.max.toLocaleString()} {field.unit}
                      </Text>
                      {error && (
                        <Text
                          nativeID={errorId}
                          style={styles.errorText}
                          accessibilityRole="alert"
                          accessibilityLiveRegion="assertive"
                        >
                          {error}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>

              {isSaving && (
                <Text
                  style={styles.savingText}
                  accessibilityRole="progressbar"
                  accessibilityLiveRegion="polite"
                >
                  Saving nutrition targets…
                </Text>
              )}

              {visibleSaveError && (
                <Text
                  style={styles.errorText}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                >
                  {visibleSaveError}
                </Text>
              )}

              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel={
                  isSaving ? "Saving nutrition targets" : "Save nutrition targets"
                }
                accessibilityState={{ busy: isSaving, disabled: isSaving }}
                style={[
                  styles.primaryButton,
                  isSaving && styles.disabledControl,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isSaving ? "Saving…" : "Save targets"}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleRestoreDefaults}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel="Restore default nutrition targets"
                accessibilityState={{ disabled: isSaving }}
                style={[
                  styles.secondaryButton,
                  isSaving && styles.disabledControl,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Restore defaults</Text>
              </Pressable>
            </>
          )}
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
      paddingHorizontal: 24,
      backgroundColor: colors.background,
    },
    content: { width: "100%", maxWidth: 680, alignSelf: "center" },
    backButton: {
      minWidth: 48,
      minHeight: 48,
      alignSelf: "flex-start",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    backText: { color: colors.accent, fontSize: 16, fontWeight: "800" },
    title: {
      color: colors.text,
      fontSize: 34,
      lineHeight: 42,
      fontWeight: "800",
      marginBottom: 14,
    },
    guidance: {
      color: colors.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 12,
    },
    limitsNote: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 16,
    },
    profileButton: {
      minHeight: 48,
      marginBottom: 24,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 20,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    profileButtonText: {
      color: colors.accent,
      fontSize: 16,
      fontWeight: "800",
      textAlign: "center",
    },
    form: { gap: 18 },
    field: { gap: 7 },
    label: { color: colors.text, fontSize: 16, fontWeight: "700" },
    input: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 18,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    inputError: { borderColor: colors.danger },
    limitText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    savingText: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 20,
      textAlign: "center",
    },
    stateText: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      paddingVertical: 32,
    },
    stateCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 20,
      gap: 12,
      alignItems: "center",
    },
    primaryButton: {
      minHeight: 52,
      marginTop: 24,
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
    },
    primaryButtonText: {
      color: colors.onBrand,
      fontSize: 16,
      fontWeight: "800",
    },
    secondaryButton: {
      minWidth: 48,
      minHeight: 48,
      marginTop: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 20,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    secondaryButtonText: {
      color: colors.accent,
      fontSize: 16,
      fontWeight: "800",
      textAlign: "center",
    },
    disabledControl: { opacity: 0.6 },
  });
}
