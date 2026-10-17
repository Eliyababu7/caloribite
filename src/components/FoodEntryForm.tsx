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

import { initialFoodServing, recalculateFoodInputs } from "../services/foodSearch/confirmationNutrition";
import type { FoodSearchResult } from "../types/foodSearch";
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
  foodResult?: FoodSearchResult;
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
  foodResult,
  submitLabel = "Save to diary",
  cancelLabel = "Back",
  onSubmit,
  onCancel,
  disabled = false,
}: FoodEntryFormProps) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const initialServing = foodResult ? initialFoodServing(foodResult) : { servingId: "", grams: "", quantity: "1" };
  const providerInputs = foodResult ? recalculateFoodInputs(foodResult, initialServing.grams, initialServing.quantity) : null;
  const [servingId, setServingId] = useState(initialServing.servingId);
  const [servingGrams, setServingGrams] = useState(initialServing.grams);
  const [quantity, setQuantity] = useState(initialServing.quantity);
  const [mealType, setMealType] = useState<MealType>(
    initialValues.mealType ?? getDefaultMealType(),
  );

  const [foodName, setFoodName] = useState(
    getInputValue(foodResult?.name ?? initialValues.foodName),
  );

  const [calories, setCalories] = useState(
    getInputValue(providerInputs?.calories ?? initialValues.calories),
  );

  const [protein, setProtein] = useState(getInputValue(providerInputs?.protein ?? initialValues.protein));

  const [carbs, setCarbs] = useState(getInputValue(providerInputs?.carbs ?? initialValues.carbs));
  const [fat, setFat] = useState(getInputValue(providerInputs?.fat ?? initialValues.fat));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submissionPending = useRef(false);

  const recalculate = (grams: string, nextQuantity: string) => {
    if (!foodResult) return;
    const totals = recalculateFoodInputs(foodResult, grams, nextQuantity);
    setCalories(totals.calories);
    setProtein(totals.protein);
    setCarbs(totals.carbs);
    setFat(totals.fat);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (disabled || submissionPending.current) {
      return;
    }

    if (foodResult) {
      if (!Number.isFinite(Number(servingGrams)) || Number(servingGrams) <= 0 ||
        !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
        setSubmitError("Enter a valid serving weight in grams and a quantity greater than zero.");
        return;
      }
      if ([calories, protein, carbs, fat].some((value) => !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0)) {
        setSubmitError("Enter a non-negative number for every nutrient. USDA values marked unavailable must be entered before saving.");
        return;
      }
      if (!foodName.trim()) {
        setSubmitError("Please enter a food name.");
        return;
      }
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
                accessibilityRole="button"
                accessibilityLabel={`${meal} meal`}
                accessibilityState={{ disabled: actionsDisabled, selected: isSelected }}
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
          accessibilityLabel="Food name"
          maxLength={300}
          onChangeText={setFoodName}
          placeholder="Food name"
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accent}
          editable={!actionsDisabled}
        />

        {foodResult && <>
          <Text style={styles.label}>Serving</Text>
          <Text style={styles.subtitle}>{foodResult.attributionLabel}{foodResult.brand ? ` | ${foodResult.brand}` : ""}</Text>
          <View style={styles.mealRow}>
            {foodResult.servingOptions.map((option) => <Pressable key={option.id}
              style={[styles.mealChip, servingId === option.id && styles.mealChipActive]}
              disabled={actionsDisabled} accessibilityRole="button"
              accessibilityLabel={`${option.label}, ${option.grams} grams`}
              accessibilityState={{ selected: servingId === option.id, disabled: actionsDisabled }}
              onPress={() => {
                if (servingId === option.id && servingGrams === String(option.grams)) return;
                setServingId(option.id); setServingGrams(String(option.grams));
                recalculate(String(option.grams), quantity);
              }}>
              <Text style={[styles.mealChipText, servingId === option.id && styles.mealChipTextActive]}>{option.label} ({option.grams} g)</Text>
            </Pressable>)}
          </View>
          {!foodResult.servingOptions.length && <Text style={styles.subtitle}>
            {initialServing.grams === "100" ? "No provider serving weight is available. Starting with an explicit 100 g serving." : "No reliable serving weight or per-100-g nutrition is available. Enter grams and nutrition manually."}
          </Text>}
          <Text style={styles.label}>Serving weight (g)</Text>
          <TextInput style={styles.input} value={servingGrams} keyboardType="decimal-pad"
            accessibilityLabel="Serving weight in grams" placeholder="Enter grams" maxLength={20}
            placeholderTextColor={theme.colors.placeholder} selectionColor={theme.colors.accent}
            editable={!actionsDisabled} onChangeText={(value) => {
              if (value === servingGrams) return;
              setServingId(""); setServingGrams(value); recalculate(value, quantity);
            }} />
          <Text style={styles.label}>Quantity</Text>
          <TextInput style={styles.input} value={quantity} keyboardType="decimal-pad"
            accessibilityLabel="Serving quantity" maxLength={20}
            selectionColor={theme.colors.accent} editable={!actionsDisabled}
            onChangeText={(value) => { if (value !== quantity) { setQuantity(value); recalculate(servingGrams, value); } }} />
          <Text style={styles.subtitle}>Totals below are editable. Changing serving weight, serving option, or quantity recalculates from USDA nutrition and replaces your nutrient edits. Unavailable values must be entered before saving.</Text>
        </>}

        <Text style={styles.label}>Calories</Text>

        <TextInput
          style={styles.input}
          value={calories}
          accessibilityLabel="Calories"
          maxLength={20}
          onChangeText={setCalories}
          keyboardType="decimal-pad"
          placeholder={foodResult ? "Unavailable - enter value" : "Calories"}
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accent}
          editable={!actionsDisabled}
        />

        <Text style={styles.label}>Protein (g)</Text>

        <TextInput
          style={styles.input}
          value={protein}
          accessibilityLabel="Protein in grams"
          maxLength={20}
          onChangeText={setProtein}
          keyboardType="decimal-pad"
          placeholder={foodResult ? "Unavailable - enter value" : "Protein"}
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accent}
          editable={!actionsDisabled}
        />

        <Text style={styles.label}>Carbs (g)</Text>

        <TextInput
          style={styles.input}
          value={carbs}
          accessibilityLabel="Carbohydrates in grams"
          maxLength={20}
          onChangeText={setCarbs}
          keyboardType="decimal-pad"
          placeholder={foodResult ? "Unavailable - enter value" : "Carbs"}
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accent}
          editable={!actionsDisabled}
        />

        <Text style={styles.label}>Fat (g)</Text>

        <TextInput
          style={styles.input}
          value={fat}
          accessibilityLabel="Fat in grams"
          maxLength={20}
          onChangeText={setFat}
          keyboardType="decimal-pad"
          placeholder={foodResult ? "Unavailable - enter value" : "Fat"}
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
      minHeight: 48,
      justifyContent: "center",
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
      minHeight: 48,
      color: colors.accent,
      textAlign: "center",
      fontSize: 15,
      fontWeight: "700",
    },
  });
}
