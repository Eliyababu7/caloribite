import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import type { MealType, NewFoodLog } from "../types/food";
import { formatDiaryDate } from "../utils/date";
import { getDefaultMealType, MEAL_TYPES } from "../utils/meal";

export type FoodEntryInitialValues = {
  mealType?: MealType;
  foodName?: string;
  calories?: string | number;
  protein?: string | number;
  carbs?: string | number;
  fat?: string | number;
};

type FoodEntryFormProps = {
  title: string;
  subtitle: string;
  loggedDate: string;
  initialValues?: FoodEntryInitialValues;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (foodLog: NewFoodLog) => Promise<boolean>;
  onCancel: () => void;
  disabled?: boolean;
};

function getInputValue(value: string | number | undefined): string {
  return value === undefined ? "" : String(value);
}

function parseNutritionNumber(
  value: string,
  label: string,
  required = false,
): number | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    if (required) {
      Alert.alert(
        "Missing information",
        `Please enter ${label.toLowerCase()}.`,
      );
      return null;
    }

    return 0;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    Alert.alert(
      "Invalid value",
      `${label} must be a valid number greater than or equal to zero.`,
    );

    return null;
  }

  return parsedValue;
}

export function FoodEntryForm({
  title,
  subtitle,
  loggedDate,
  initialValues = {},
  submitLabel = "Save to diary",
  cancelLabel = "Back",
  onSubmit,
  onCancel,
  disabled = false,
}: FoodEntryFormProps) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [mealType, setMealType] = useState<MealType>(
    initialValues.mealType ?? getDefaultMealType(),
  );

  const [foodName, setFoodName] = useState(
    getInputValue(initialValues.foodName),
  );

  const [calories, setCalories] = useState(
    getInputValue(initialValues.calories),
  );

  const [protein, setProtein] = useState(getInputValue(initialValues.protein));

  const [carbs, setCarbs] = useState(getInputValue(initialValues.carbs));
  const [fat, setFat] = useState(getInputValue(initialValues.fat));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submissionPending = useRef(false);

  const handleSubmit = async () => {
    if (disabled || submissionPending.current) {
      return;
    }

    const trimmedFoodName = foodName.trim();

    if (!trimmedFoodName) {
      Alert.alert("Missing information", "Please enter a food name.");
      return;
    }

    const parsedCalories = parseNutritionNumber(calories, "Calories", true);

    if (parsedCalories === null) {
      return;
    }

    const parsedProtein = parseNutritionNumber(protein, "Protein");

    if (parsedProtein === null) {
      return;
    }

    const parsedCarbs = parseNutritionNumber(carbs, "Carbs");

    if (parsedCarbs === null) {
      return;
    }

    const parsedFat = parseNutritionNumber(fat, "Fat");

    if (parsedFat === null) {
      return;
    }

    submissionPending.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const succeeded = await onSubmit({
        foodName: trimmedFoodName,
        calories: parsedCalories,
        protein: parsedProtein,
        carbs: parsedCarbs,
        fat: parsedFat,
        mealType,
      });

      if (!succeeded) {
        setSubmitError(
          "This food could not be saved. Please try again.",
        );
      }
    } catch {
      setSubmitError(
        "This food could not be saved. Please try again.",
      );
    } finally {
      submissionPending.current = false;
      setIsSubmitting(false);
    }
  };

  const actionsDisabled = disabled || isSubmitting;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Math.max(insets.top + 24, 24),
          paddingBottom: Math.max(insets.bottom + 24, 24),
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>

        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.dateCard}>
          <Text style={styles.dateLabel}>Diary date</Text>

          <Text style={styles.dateValue}>{formatDiaryDate(loggedDate)}</Text>
        </View>

        <Text style={styles.label}>Meal</Text>

        <View style={styles.mealRow}>
          {MEAL_TYPES.map((meal) => {
            const isSelected = mealType === meal;

            return (
              <Pressable
                key={meal}
                style={[
                  styles.mealChip,
                  isSelected && styles.mealChipActive,
                  actionsDisabled && styles.disabledButton,
                ]}
                onPress={() => setMealType(meal)}
                disabled={actionsDisabled}
                accessibilityState={{ disabled: actionsDisabled }}
              >
                <Text
                  style={[
                    styles.mealChipText,
                    isSelected && styles.mealChipTextActive,
                  ]}
                >
                  {meal}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Food name</Text>

        <TextInput
          style={styles.input}
          value={foodName}
          onChangeText={setFoodName}
          placeholder="Food name"
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accent}
          editable={!actionsDisabled}
        />

        <Text style={styles.label}>Calories</Text>

        <TextInput
          style={styles.input}
          value={calories}
          onChangeText={setCalories}
          keyboardType="decimal-pad"
          placeholder="Calories"
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accent}
          editable={!actionsDisabled}
        />

        <Text style={styles.label}>Protein (g)</Text>

        <TextInput
          style={styles.input}
          value={protein}
          onChangeText={setProtein}
          keyboardType="decimal-pad"
          placeholder="Protein"
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accent}
          editable={!actionsDisabled}
        />

        <Text style={styles.label}>Carbs (g)</Text>

        <TextInput
          style={styles.input}
          value={carbs}
          onChangeText={setCarbs}
          keyboardType="decimal-pad"
          placeholder="Carbs"
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accent}
          editable={!actionsDisabled}
        />

        <Text style={styles.label}>Fat (g)</Text>

        <TextInput
          style={styles.input}
          value={fat}
          onChangeText={setFat}
          keyboardType="decimal-pad"
          placeholder="Fat"
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accent}
          editable={!actionsDisabled}
        />

        {submitError && (
          <Text
            style={styles.errorText}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {submitError}
          </Text>
        )}

        <Pressable
          style={[
            styles.primaryButton,
            actionsDisabled && styles.disabledButton,
          ]}
          onPress={handleSubmit}
          disabled={actionsDisabled}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          accessibilityState={{ disabled: actionsDisabled, busy: isSubmitting }}
        >
          {isSubmitting ? (
            <ActivityIndicator
              color={theme.colors.onBrand}
              accessibilityLabel="Saving food"
            />
          ) : (
            <Text style={styles.primaryButtonText}>{submitLabel}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={onCancel}
          disabled={actionsDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: actionsDisabled }}
        >
          <Text
            style={[
              styles.cancelText,
              actionsDisabled && styles.disabledActionText,
            ]}
          >
            {cancelLabel}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(theme: AppTheme) {
  const { colors } = theme;

  return StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      padding: 24,
    },

    content: {
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
    },

    title: {
      fontSize: 36,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 10,
    },

    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      lineHeight: 24,
      marginBottom: 22,
    },

    dateCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 18,
      marginBottom: 24,
    },

    dateLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 4,
    },

    dateValue: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text,
    },

    label: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
    },

    mealRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 18,
    },

    mealChip: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 999,
    },

    mealChipActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },

    mealChipText: {
      color: colors.text,
      fontWeight: "700",
    },

    mealChipTextActive: {
      color: colors.onBrand,
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
      marginBottom: 16,
    },

    primaryButton: {
      backgroundColor: colors.brand,
      paddingVertical: 16,
      borderRadius: 999,
      alignItems: "center",
      marginTop: 10,
      marginBottom: 18,
    },

    primaryButtonText: {
      color: colors.onBrand,
      fontSize: 16,
      fontWeight: "700",
    },

    disabledButton: {
      opacity: 0.6,
    },

    errorText: {
      color: colors.danger,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 4,
    },

    disabledActionText: {
      color: colors.disabledText,
    },

    cancelText: {
      color: colors.accent,
      textAlign: "center",
      fontSize: 15,
      fontWeight: "700",
    },
  });
}
