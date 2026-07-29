import { useRouter } from "expo-router";
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
import { useHealthProfile } from "../context/HealthProfileContext";
import { useNutritionTargets } from "../context/NutritionTargetsContext";
import {
  estimateNutritionTargets,
  type NutritionEstimate,
  type NutritionEstimateResult,
} from "../services/nutrition/nutritionEstimator";
import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";
import {
  ACTIVITY_LEVELS,
  CALCULATION_SEX_OPTIONS,
  HEALTH_PROFILE_LIMITS,
  NUTRITION_GOALS,
  type ActivityLevel,
  type CalculationSex,
  type HealthProfile,
  type NutritionGoal,
} from "../types/healthProfile";

type Drafts = { age: string; heightCm: string; weightKg: string };
type DraftField = keyof Drafts;
type OwnedMessage = { owner: AuthIdentity; message: string };
type ConfirmationOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
};

const SAFETY_WORDING =
  "This estimate is for general wellness tracking and is not medical advice. It may not be suitable for people under 18, during pregnancy or breastfeeding, or for anyone with a medical condition or a history of disordered eating. Speak with a qualified healthcare professional for personalised guidance.";

function confirmAction({
  title,
  message,
  confirmLabel,
  destructive = false,
}: ConfirmationOptions): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(globalThis.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (confirmed: boolean) => {
      if (!settled) {
        settled = true;
        resolve(confirmed);
      }
    };

    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => settle(false) },
        {
          text: confirmLabel,
          style: destructive ? "destructive" : "default",
          onPress: () => settle(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => settle(false),
      },
    );
  });
}

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

function snapshot(identity: AuthIdentity): AuthIdentity {
  return Object.freeze({ ...identity });
}

function createDrafts(profile: HealthProfile | null): Drafts {
  return {
    age: profile ? String(profile.age) : "",
    heightCm: profile ? String(profile.heightCm) : "",
    weightKg: profile ? String(profile.weightKg) : "",
  };
}

function parseWholeNumber(
  value: string,
  label: string,
  limits: Readonly<{ min: number; max: number }>,
) {
  if (!/^\d+$/.test(value.trim())) return `${label} must be a whole number.`;
  const number = Number(value);
  if (number < limits.min || number > limits.max) {
    if (label === "Age" && number < 18) {
      return "Automatic calculation is not available for people under 18.";
    }
    return `${label} must be between ${limits.min} and ${limits.max}.`;
  }
  return null;
}

function parseMeasurement(
  value: string,
  label: string,
  limits: Readonly<{ min: number; max: number }>,
) {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return `${label} must be a number.`;
  }
  const number = Number(trimmed);
  if (!Number.isFinite(number) || number < limits.min || number > limits.max) {
    return `${label} must be between ${limits.min} and ${limits.max}.`;
  }
  return null;
}

function parseWeight(value: string) {
  return parseMeasurement(value, "Weight", HEALTH_PROFILE_LIMITS.weightKg);
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  styles,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<Readonly<{ value: T; label: string }>>;
  onChange: (value: T) => void;
  disabled: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={styles.choiceGroup}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              style={[
                styles.choice,
                selected && styles.choiceSelected,
                disabled && styles.disabled,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  selected && styles.choiceTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function HealthProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { authIdentity } = useAuth();
  const authRef = useRef(authIdentity);
  authRef.current = authIdentity;
  const {
    healthProfile,
    hydrationState,
    hydrationError,
    onboardingStatus,
    isSaving,
    isDeleting,
    isOnboardingMutationPending,
    saveHealthProfile,
    skipHealthOnboarding,
    deleteHealthProfile,
    retryHydration,
  } = useHealthProfile();
  const { nutritionTargets, isSaving: targetsSaving, saveTargets } =
    useNutritionTargets();

  const [drafts, setDrafts] = useState<Drafts>(() => createDrafts(null));
  const [calculationSex, setCalculationSex] =
    useState<CalculationSex>("prefer-not-to-say");
  const [activityLevel, setActivityLevel] =
    useState<ActivityLevel>("sedentary");
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  const [errors, setErrors] = useState<Partial<Record<DraftField, string>>>({});
  const [message, setMessage] = useState<OwnedMessage | null>(null);
  const initializedOwnerRef = useRef<AuthIdentity | null>(null);
  const operationPendingRef = useRef(false);

  useEffect(() => {
    if (
      hydrationState === "ready" &&
      authIdentity &&
      !identitiesMatch(initializedOwnerRef.current, authIdentity)
    ) {
      initializedOwnerRef.current = authIdentity;
      setDrafts(createDrafts(healthProfile));
      setCalculationSex(
        healthProfile?.calculationSex ?? "prefer-not-to-say",
      );
      setActivityLevel(healthProfile?.activityLevel ?? "sedentary");
      setGoal(healthProfile?.goal ?? "maintain");
      setErrors({});
      setMessage(null);
    }
  }, [authIdentity, healthProfile, hydrationState]);

  useEffect(() => {
    if (
      initializedOwnerRef.current &&
      !identitiesMatch(initializedOwnerRef.current, authIdentity)
    ) {
      initializedOwnerRef.current = null;
      setDrafts(createDrafts(null));
      setErrors({});
      setMessage(null);
    }
  }, [authIdentity]);

  const validate = () => {
    const nextErrors: Partial<Record<DraftField, string>> = {
      age:
        parseWholeNumber(drafts.age, "Age", HEALTH_PROFILE_LIMITS.age) ??
        undefined,
      heightCm:
        parseMeasurement(
          drafts.heightCm,
          "Height",
          HEALTH_PROFILE_LIMITS.heightCm,
        ) ?? undefined,
      weightKg:
        parseWeight(drafts.weightKg) ?? undefined,
    };
    Object.keys(nextErrors).forEach((key) => {
      if (!nextErrors[key as DraftField]) delete nextErrors[key as DraftField];
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return null;
    return {
      age: Number(drafts.age),
      heightCm: Number(drafts.heightCm),
      weightKg: Number(drafts.weightKg),
      calculationSex,
      activityLevel,
      goal,
    } satisfies HealthProfile;
  };

  const previewProfile: HealthProfile | null = useMemo(() => {
    if (
      !/^\d+$/.test(drafts.age.trim()) ||
      !/^\d+(?:\.\d+)?$/.test(drafts.heightCm.trim()) ||
      !/^\d+(?:\.\d+)?$/.test(drafts.weightKg.trim())
    ) return null;
    return {
      age: Number(drafts.age),
      heightCm: Number(drafts.heightCm),
      weightKg: Number(drafts.weightKg),
      calculationSex,
      activityLevel,
      goal,
    };
  }, [activityLevel, calculationSex, drafts, goal]);

  const preview: NutritionEstimateResult | null = previewProfile
    ? estimateNutritionTargets(previewProfile)
    : null;
  const isOnboarding = onboardingStatus === "required";
  const busy =
    isSaving ||
    isDeleting ||
    isOnboardingMutationPending ||
    targetsSaving;
  const visibleMessage =
    message && identitiesMatch(message.owner, authIdentity)
      ? message.message
      : null;

  const publish = (owner: AuthIdentity, nextMessage: string) => {
    if (identitiesMatch(authRef.current, owner)) {
      setMessage({ owner, message: nextMessage });
    }
  };

  const handleSave = async () => {
    if (busy || operationPendingRef.current || !authIdentity) return;
    const profile = validate();
    if (!profile) return;
    const owner = snapshot(authIdentity);
    const shouldFinishOnboarding = isOnboarding;
    operationPendingRef.current = true;
    setMessage(null);
    try {
      const saved = await saveHealthProfile(profile, owner);
      if (!identitiesMatch(authRef.current, owner)) return;
      publish(
        owner,
        saved
          ? "Health profile saved. Your nutrition targets were not changed."
          : "Your health profile could not be saved. Please try again.",
      );
      if (saved && shouldFinishOnboarding) router.replace("/dashboard");
    } finally {
      operationPendingRef.current = false;
    }
  };

  const applyTargets = async (
    profile: HealthProfile,
    estimate: NutritionEstimate,
    owner: AuthIdentity,
  ): Promise<boolean> => {
    const profileSaved = await saveHealthProfile(profile, owner);
    if (!profileSaved || !identitiesMatch(authRef.current, owner)) {
      publish(owner, "Your health profile could not be saved. No targets were changed.");
      return false;
    }
    const targetsSaved = await saveTargets(estimate.targets, owner);
    if (!identitiesMatch(authRef.current, owner)) return false;
    publish(
      owner,
      targetsSaved
        ? "Estimated nutrition targets applied."
        : "Your estimated targets could not be applied. Please try again.",
    );
    return targetsSaved;
  };

  const handleApply = async () => {
    if (
      busy ||
      operationPendingRef.current ||
      !authIdentity ||
      !nutritionTargets ||
      !preview?.ok
    ) return;
    const profile = validate();
    if (!profile) return;
    const owner = snapshot(authIdentity);
    const estimate: NutritionEstimate = {
      ...preview.estimate,
      targets: { ...preview.estimate.targets },
    };
    const shouldFinishOnboarding = isOnboarding;
    operationPendingRef.current = true;

    try {
      const confirmed = await confirmAction({
        title: "Replace current nutrition targets?",
        message:
          "This will replace your current targets with the estimated calories and macros shown in the preview.",
        confirmLabel: "Apply estimated targets",
      });

      if (!confirmed || !identitiesMatch(authRef.current, owner)) return;
      const applied = await applyTargets(profile, estimate, owner);
      if (
        applied &&
        shouldFinishOnboarding &&
        identitiesMatch(authRef.current, owner)
      ) {
        router.replace("/dashboard");
      }
    } finally {
      operationPendingRef.current = false;
    }
  };

  const handleDelete = async () => {
    if (
      busy ||
      operationPendingRef.current ||
      !authIdentity ||
      !healthProfile
    ) return;
    const owner = snapshot(authIdentity);
    operationPendingRef.current = true;

    try {
      const confirmed = await confirmAction({
        title: "Delete health profile?",
        message:
          "This removes only your health profile. Food logs and nutrition targets will not be deleted.",
        confirmLabel: "Delete profile",
        destructive: true,
      });

      if (!confirmed || !identitiesMatch(authRef.current, owner)) return;
      const deleted = await deleteHealthProfile(owner);
      if (deleted && identitiesMatch(authRef.current, owner)) {
        setDrafts(createDrafts(null));
        setCalculationSex("prefer-not-to-say");
        setActivityLevel("sedentary");
        setGoal("maintain");
        setErrors({});
      }
      publish(
        owner,
        deleted
          ? "Health profile deleted. Food logs and nutrition targets were not changed."
          : "Your health profile could not be deleted. Please try again.",
      );
    } finally {
      operationPendingRef.current = false;
    }
  };

  const handleSkip = async () => {
    if (
      busy ||
      operationPendingRef.current ||
      !isOnboarding ||
      !authIdentity
    ) return;
    const owner = snapshot(authIdentity);
    operationPendingRef.current = true;
    setMessage(null);
    try {
      const skipped = await skipHealthOnboarding(owner);
      if (!identitiesMatch(authRef.current, owner)) return;
      if (skipped) {
        router.replace("/dashboard");
      } else {
        publish(owner, "Your choice could not be saved. Please try again.");
      }
    } finally {
      operationPendingRef.current = false;
    }
  };

  const field = (
    key: DraftField,
    label: string,
    unit: string,
    limits: Readonly<{ min: number; max: number }>,
    allowDecimal = false,
  ) => {
    const error = errors[key];
    const inputId = `health-profile-${key}-input`;
    const labelId = `health-profile-${key}-label`;
    const guidanceId = `health-profile-${key}-guidance`;
    const errorId = `health-profile-${key}-error`;
    const technicalGuidance =
      `Technical input limit: ${limits.min} to ${limits.max} ${unit}. ` +
      "This is not a medical recommendation.";
    const accessibilityHint = error
      ? `${technicalGuidance} Current error: ${error}`
      : technicalGuidance;
    const inputRelationship =
      Platform.OS === "web"
        ? {
            "aria-labelledby": labelId,
            "aria-describedby": error
              ? `${guidanceId} ${errorId}`
              : guidanceId,
          }
        : Platform.OS === "android"
          ? { accessibilityLabelledBy: labelId }
          : {};

    return (
      <View style={styles.field}>
        <Text nativeID={labelId} style={styles.label}>
          {label} ({unit})
        </Text>
        <TextInput
          nativeID={inputId}
          value={drafts[key]}
          onChangeText={(value) => {
            setDrafts((current) => ({ ...current, [key]: value }));
            setErrors((current) => ({ ...current, [key]: undefined }));
            setMessage(null);
          }}
          editable={!busy}
          keyboardType={allowDecimal ? "decimal-pad" : "number-pad"}
          inputMode={allowDecimal ? "decimal" : "numeric"}
          maxLength={allowDecimal ? 6 : 3}
          accessibilityLabel={`${label} in ${unit}`}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ disabled: busy }}
          {...inputRelationship}
          style={[
            styles.input,
            error && styles.inputError,
            busy && styles.disabled,
          ]}
        />
        <Text nativeID={guidanceId} style={styles.hint}>
          Technical limit: {limits.min}–{limits.max} {unit}. This is not a
          medical recommendation.
        </Text>
        {error && (
          <Text
            nativeID={errorId}
            style={styles.error}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {error}
          </Text>
        )}
      </View>
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
          {!isOnboarding && (
            <Pressable
              onPress={() => router.back()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.backButton}
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          )}
          <Text style={styles.title} accessibilityRole="header">Health profile</Text>
          <Text style={styles.guidance}>
            {isOnboarding
              ? "Optional adult health details help estimate calorie and macro targets. You can save the profile without changing your current nutrition targets, apply the estimate, or set it up later."
              : "Add a minimal adult profile to preview personalised nutrition estimates. Saving it does not replace your nutrition targets."}
          </Text>
          <Text style={styles.safety}>{SAFETY_WORDING}</Text>

          {hydrationState === "loading" && (
            <Text accessibilityRole="progressbar" style={styles.stateText}>
              Loading your health profile…
            </Text>
          )}
          {hydrationState === "error" && (
            <View style={styles.card}>
              <Text accessibilityRole="alert" style={styles.error}>
                {hydrationError}
              </Text>
              <Pressable
                onPress={retryHydration}
                accessibilityRole="button"
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {hydrationState === "ready" &&
            identitiesMatch(initializedOwnerRef.current, authIdentity) && (
              <>
                <View style={styles.form}>
                  {field("age", "Age", "years", HEALTH_PROFILE_LIMITS.age)}
                  {field(
                    "heightCm",
                    "Height",
                    "cm",
                    HEALTH_PROFILE_LIMITS.heightCm,
                    true,
                  )}
                  {field(
                    "weightKg",
                    "Weight",
                    "kg",
                    HEALTH_PROFILE_LIMITS.weightKg,
                    true,
                  )}
                  <ChoiceGroup
                    label="Sex used by the calculation"
                    value={calculationSex}
                    options={CALCULATION_SEX_OPTIONS}
                    onChange={setCalculationSex}
                    disabled={busy}
                    styles={styles}
                  />
                  {calculationSex === "prefer-not-to-say" && (
                    <Text style={styles.hint}>
                      This remains saveable, but Mifflin–St Jeor requires a calculation sex. Manual nutrition targets remain available.
                    </Text>
                  )}
                  <ChoiceGroup
                    label="Activity level"
                    value={activityLevel}
                    options={ACTIVITY_LEVELS}
                    onChange={setActivityLevel}
                    disabled={busy}
                    styles={styles}
                  />
                  <ChoiceGroup
                    label="Goal"
                    value={goal}
                    options={NUTRITION_GOALS}
                    onChange={setGoal}
                    disabled={busy}
                    styles={styles}
                  />
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Estimated preview</Text>
                  {!preview && (
                    <Text style={styles.hint}>Complete the profile to see an estimate.</Text>
                  )}
                  {preview && !preview.ok && (
                    <Text accessibilityRole="alert" style={styles.error}>
                      {preview.reason}
                    </Text>
                  )}
                  {preview?.ok && (
                    <View style={styles.previewRows}>
                      <Text style={styles.previewText}>Estimated BMR: {preview.estimate.bmr} kcal/day</Text>
                      <Text style={styles.previewText}>Estimated maintenance: {preview.estimate.maintenanceCalories} kcal/day</Text>
                      <Text style={styles.previewText}>
                        Goal adjustment: {preview.estimate.goalAdjustment > 0 ? "+" : ""}{preview.estimate.goalAdjustment} kcal/day
                      </Text>
                      <Text style={styles.previewStrong}>Estimated calorie target: {preview.estimate.targets.calories} kcal/day</Text>
                      <Text style={styles.previewText}>
                        Estimated macros: {preview.estimate.targets.protein} g protein, {preview.estimate.targets.carbs} g carbs, {preview.estimate.targets.fat} g fat
                      </Text>
                    </View>
                  )}
                </View>

                {visibleMessage && (
                  <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="assertive"
                    style={styles.message}
                  >
                    {visibleMessage}
                  </Text>
                )}
                <Pressable
                  onPress={() => void handleSave()}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy, busy: isSaving }}
                  style={[styles.primaryButton, busy && styles.disabled]}
                >
                  <Text style={styles.primaryButtonText}>
                    {isSaving
                      ? "Saving…"
                      : isOnboarding
                        ? "Save profile without changing targets"
                        : "Save health profile"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleApply}
                  disabled={busy || !preview?.ok}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || !preview?.ok }}
                  style={[
                    styles.secondaryButton,
                    (busy || !preview?.ok) && styles.disabled,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>
                    {targetsSaving ? "Applying…" : "Apply estimated targets"}
                  </Text>
                </Pressable>
                {isOnboarding && (
                  <Pressable
                    onPress={() => void handleSkip()}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Set up health profile later"
                    accessibilityState={{
                      disabled: busy,
                      busy: isOnboardingMutationPending,
                    }}
                    style={[styles.skipButton, busy && styles.disabled]}
                  >
                    <Text style={styles.skipText}>
                      {isOnboardingMutationPending
                        ? "Saving…"
                        : "Set up later."}
                    </Text>
                  </Pressable>
                )}
                {healthProfile && (
                  <Pressable
                    onPress={handleDelete}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    style={[styles.deleteButton, busy && styles.disabled]}
                  >
                    <Text style={styles.deleteText}>
                      {isDeleting ? "Deleting…" : "Delete health profile"}
                    </Text>
                  </Pressable>
                )}
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
      paddingHorizontal: 20,
      backgroundColor: colors.background,
    },
    content: { width: "100%", maxWidth: 720, alignSelf: "center" },
    backButton: {
      minWidth: 48,
      minHeight: 48,
      alignSelf: "flex-start",
      alignItems: "center",
      justifyContent: "center",
    },
    backText: { color: colors.accent, fontSize: 16, fontWeight: "800" },
    title: {
      color: colors.text,
      fontSize: 34,
      lineHeight: 42,
      fontWeight: "800",
      marginTop: 8,
      marginBottom: 12,
    },
    guidance: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
    safety: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 12,
      marginBottom: 24,
    },
    form: { gap: 20 },
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
    hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    choiceGroup: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    choice: {
      minHeight: 48,
      minWidth: 48,
      flexGrow: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    choiceSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
    choiceText: { color: colors.text, fontSize: 15, fontWeight: "600", textAlign: "center" },
    choiceTextSelected: { color: colors.accent, fontWeight: "800" },
    card: {
      marginTop: 24,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      backgroundColor: colors.surface,
      padding: 18,
      gap: 10,
    },
    cardTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
    previewRows: { gap: 8 },
    previewText: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
    previewStrong: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: "800" },
    stateText: { color: colors.textSecondary, textAlign: "center", paddingVertical: 32 },
    message: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 20, textAlign: "center" },
    primaryButton: {
      minHeight: 52,
      marginTop: 24,
      borderRadius: 999,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    primaryButtonText: { color: colors.onBrand, fontSize: 16, fontWeight: "800" },
    secondaryButton: {
      minWidth: 48,
      minHeight: 48,
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    secondaryButtonText: { color: colors.accent, fontSize: 16, fontWeight: "800", textAlign: "center" },
    skipButton: {
      minHeight: 48,
      marginTop: 12,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    skipText: { color: colors.accent, fontSize: 16, fontWeight: "800" },
    deleteButton: {
      minHeight: 48,
      marginTop: 12,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    deleteText: { color: colors.danger, fontSize: 16, fontWeight: "800" },
    disabled: { opacity: 0.55 },
  });
}
