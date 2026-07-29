import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DateNavigator } from "../components/DateNavigator";
import { MacroCard } from "../components/MacroCard";
import { MealSection } from "../components/MealSection";
import { ProgressBar } from "../components/ProgressBar";
import { type AuthIdentity, useAuth } from "../context/AuthContext";
import { useFoodLogs } from "../context/FoodLogContext";
import { useNutritionTargets } from "../context/NutritionTargetsContext";
import {
  calculateNutritionTotals,
  createNutritionSummary,
} from "../services/nutrition/nutritionService";
import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";
import type { FoodLog, MealType } from "../types/food";
import { addDaysToDateKey, getLocalDateKey } from "../utils/date";
import { resolveDiaryDateParam } from "../utils/diaryRoute";
import { confirmAction } from "../utils/confirmAction";
import { MEAL_TYPES } from "../utils/meal";

type SignOutError = {
  message: string;
  owner: AuthIdentity;
};

function getValidFirstName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const firstName = value.trim().split(/\s+/)[0];

  if (/^(null|undefined)$/i.test(firstName)) {
    return null;
  }

  return /^[\p{L}\p{M}][\p{L}\p{M}'’-]*$/u.test(firstName)
    ? firstName
    : null;
}

export default function DashboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user, authIdentity, signOut, isSigningOut } = useAuth();
  const authIdentityRef = useRef(authIdentity);
  authIdentityRef.current = authIdentity;
  const clearDayPendingRef = useRef(false);

  const {
    foodLogs,
    deleteFoodLog,
    clearFoodLogsForDate,
    isFoodLogMutationPending,
  } = useFoodLogs();
  const {
    nutritionTargets,
    hydrationState: targetsHydrationState,
    hydrationError: targetsHydrationError,
    retryHydration: retryTargetsHydration,
  } = useNutritionTargets();

  const todayDateKey = getLocalDateKey();
  const requestedDateKey = resolveDiaryDateParam(params.loggedDate);

  const [selectedDateKey, setSelectedDateKey] = useState(requestedDateKey);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<SignOutError | null>(null);

  const greetingName = useMemo(() => {
    const metadataName = getValidFirstName(user?.user_metadata.full_name);

    if (metadataName) {
      return metadataName;
    }

    const emailName = user?.email?.split("@")[0].split(/[._-]+/)[0];
    return getValidFirstName(emailName) ?? "there";
  }, [user]);

  const visibleSignOutError =
    signOutError &&
    authIdentity?.userId === signOutError.owner.userId &&
    authIdentity.generation === signOutError.owner.generation
      ? signOutError.message
      : null;

  useEffect(() => {
    setSelectedDateKey(requestedDateKey);
  }, [requestedDateKey]);

  useEffect(() => {
    setSignOutError(null);
  }, [authIdentity]);

  const isViewingToday = selectedDateKey === todayDateKey;

  const selectedFoodLogs = useMemo(
    () => foodLogs.filter((food) => food.loggedDate === selectedDateKey),
    [foodLogs, selectedDateKey],
  );

  const foodsByMeal = useMemo(() => {
    const groupedFoods: Record<MealType, FoodLog[]> = {
      Breakfast: [],
      Lunch: [],
      Dinner: [],
      Snack: [],
    };

    selectedFoodLogs.forEach((food) => {
      groupedFoods[food.mealType].push(food);
    });

    return groupedFoods;
  }, [selectedFoodLogs]);

  const nutritionTotals = useMemo(
    () => calculateNutritionTotals(selectedFoodLogs),
    [selectedFoodLogs],
  );

  const nutritionSummary = nutritionTargets
    ? createNutritionSummary(nutritionTotals, nutritionTargets)
    : null;

  const handlePreviousDate = () => {
    setSelectedDateKey((currentDateKey) => {
      return addDaysToDateKey(currentDateKey, -1) ?? currentDateKey;
    });
  };

  const handleNextDate = () => {
    setSelectedDateKey((currentDateKey) => {
      const nextDateKey = addDaysToDateKey(currentDateKey, 1);

      if (!nextDateKey || nextDateKey > todayDateKey) {
        return currentDateKey;
      }

      return nextDateKey;
    });
  };

  const handleGoToToday = () => {
    setSelectedDateKey(todayDateKey);
  };

  const handleAddFood = () => {
    if (isFoodLogMutationPending) {
      return;
    }

    setMutationError(null);
    router.push({
      pathname: "/search-food",
      params: {
        loggedDate: selectedDateKey,
      },
    });
  };

  const handleClearDay = async () => {
    if (isFoodLogMutationPending || clearDayPendingRef.current) {
      return;
    }

    const capturedDateKey = selectedDateKey;
    clearDayPendingRef.current = true;

    try {
      const confirmed = await confirmAction({
        title: "Clear this diary day?",
        message:
          "This will permanently delete every food entry recorded for this date.",
        confirmLabel: "Clear day",
        destructive: true,
      });

      if (!confirmed) return;

      setMutationError(null);
      const succeeded = await clearFoodLogsForDate(capturedDateKey);

      if (!succeeded) {
        setMutationError(
          "This diary day could not be cleared. Please try again.",
        );
      }
    } finally {
      clearDayPendingRef.current = false;
    }
  };

  const handleEditTargets = () => {
    router.push("/nutrition-targets" as Href);
  };

  const handleHealthProfile = () => {
    router.push("/health-profile" as Href);
  };

  const handleDeleteFood = async (id: string) => {
    setMutationError(null);
    const succeeded = await deleteFoodLog(id);

    if (!succeeded) {
      setMutationError(
        "This food could not be deleted. Please try again.",
      );
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setSignOutError(null);
    const initiatingIdentity = authIdentity;

    try {
      const succeeded = await signOut();

      if (
        !succeeded &&
        initiatingIdentity &&
        authIdentityRef.current?.userId === initiatingIdentity.userId &&
        authIdentityRef.current.generation === initiatingIdentity.generation
      ) {
        setSignOutError({
          message: "We couldn't sign you out. Please try again.",
          owner: initiatingIdentity,
        });
      }
    } catch {
      if (
        initiatingIdentity &&
        authIdentityRef.current?.userId === initiatingIdentity.userId &&
        authIdentityRef.current.generation === initiatingIdentity.generation
      ) {
        setSignOutError({
          message: "We couldn't sign you out. Please try again.",
          owner: initiatingIdentity,
        });
      }
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Math.max(insets.top + 24, 24),
          paddingBottom: Math.max(insets.bottom + 24, 24),
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.greetingRow}>
          <Text style={styles.greeting}>Hello, {greetingName} 👋</Text>

          <Pressable
            onPress={handleSignOut}
            disabled={isSigningOut}
            accessibilityRole="button"
            accessibilityLabel={isSigningOut ? "Signing out" : "Sign out"}
            accessibilityState={{
              busy: isSigningOut,
              disabled: isSigningOut,
            }}
            hitSlop={8}
            style={styles.signOutButton}
          >
            <Text
              style={[
                styles.signOutText,
                isSigningOut && styles.disabledText,
              ]}
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </Text>
          </Pressable>
        </View>

        {visibleSignOutError && (
          <Text
            style={styles.signOutError}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {visibleSignOutError}
          </Text>
        )}

        <View style={styles.titleRow}>
          <Text style={styles.title} accessibilityRole="header">
            {isViewingToday ? "Today’s progress" : "Daily progress"}
          </Text>

          <View style={styles.titleActions}>
            <Pressable
              onPress={handleHealthProfile}
              accessibilityRole="button"
              accessibilityLabel="Open health profile"
              style={styles.editTargetsButton}
            >
              <Text style={styles.editTargetsText}>Health profile</Text>
            </Pressable>
            <Pressable
              onPress={handleEditTargets}
              accessibilityRole="button"
              accessibilityLabel="Edit nutrition targets"
              style={styles.editTargetsButton}
            >
              <Text style={styles.editTargetsText}>Edit targets</Text>
            </Pressable>
          </View>
        </View>

        <DateNavigator
          selectedDateKey={selectedDateKey}
          todayDateKey={todayDateKey}
          onPrevious={handlePreviousDate}
          onNext={handleNextDate}
          onToday={handleGoToToday}
        />

        {targetsHydrationState === "loading" && (
          <View
            style={styles.targetsStateCard}
            accessibilityRole="progressbar"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.targetsStateText}>
              Loading your nutrition targets…
            </Text>
          </View>
        )}

        {targetsHydrationState === "error" && (
          <View style={styles.targetsStateCard}>
            <Text
              style={styles.targetsErrorText}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {targetsHydrationError}
            </Text>

            <Pressable
              onPress={retryTargetsHydration}
              accessibilityRole="button"
              accessibilityLabel="Retry loading nutrition targets"
              style={styles.targetsRetryButton}
            >
              <Text style={styles.targetsRetryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {nutritionTargets && nutritionSummary && (
          <>
            <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <View style={styles.cardLead}>
              <Text style={styles.cardLabel}>Calories consumed</Text>

              <Text style={styles.calorieNumber}>
                {nutritionTotals.calories} kcal
              </Text>
            </View>

            <View style={styles.targetBadge}>
              <Text style={styles.targetBadgeText}>
                {nutritionSummary.calorieProgress}%
              </Text>
            </View>
          </View>

          <ProgressBar
            value={nutritionTotals.calories}
            max={nutritionTargets.calories}
            height={12}
            accessibilityLabel="Calorie progress"
            style={styles.calorieProgressBar}
          />

          <View style={styles.calorieSummaryRow}>
            <View>
              <Text style={styles.summaryLabel}>Target</Text>

              <Text style={styles.summaryValue}>
                {nutritionTargets.calories} kcal
              </Text>
            </View>

            <View style={styles.remainingSummary}>
              <Text style={styles.summaryLabel}>Remaining</Text>

              <Text style={styles.summaryValue}>
                {nutritionSummary.remainingCalories} kcal
              </Text>
            </View>
          </View>

          <Text style={styles.cardSubText}>
            {selectedFoodLogs.length === 0
              ? "No food was logged for this day."
              : `${selectedFoodLogs.length} food item${
                  selectedFoodLogs.length === 1 ? "" : "s"
                } logged ${isViewingToday ? "today" : "on this day"}.`}
          </Text>
            </View>

            <Text style={styles.sectionTitle}>Macro balance</Text>

            <View style={styles.macroCard}>
              <MacroCard
                label="Protein"
                current={nutritionTotals.protein}
                target={nutritionTargets.protein}
              />

              <MacroCard
                label="Carbs"
                current={nutritionTotals.carbs}
                target={nutritionTargets.carbs}
              />

              <MacroCard
                label="Fat"
                current={nutritionTotals.fat}
                target={nutritionTargets.fat}
                style={styles.lastMacroCard}
              />
            </View>
          </>
        )}

        <Pressable
          onPress={handleAddFood}
          disabled={isFoodLogMutationPending}
          accessibilityRole="button"
          accessibilityLabel={
            isViewingToday ? "Add food" : "Add food to the selected diary day"
          }
          accessibilityState={{ disabled: isFoodLogMutationPending }}
          style={[
            styles.primaryButton,
            isFoodLogMutationPending && styles.disabledButton,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isViewingToday ? "Add food" : "Add food to this day"}
          </Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderTitle} accessibilityRole="header">
            {isViewingToday ? "Today’s food" : "Food diary"}
          </Text>

          {selectedFoodLogs.length > 0 && (
            <Pressable
              onPress={() => void handleClearDay()}
              disabled={isFoodLogMutationPending}
              accessibilityRole="button"
              accessibilityLabel="Clear all food for this diary day"
              hitSlop={8}
              accessibilityState={{ disabled: isFoodLogMutationPending }}
              style={styles.clearButton}
            >
              <Text
                style={[
                  styles.clearText,
                  isFoodLogMutationPending && styles.disabledText,
                ]}
              >
                Clear day
              </Text>
            </Pressable>
          )}
        </View>

        {isFoodLogMutationPending && (
          <Text
            style={styles.mutationStatus}
            accessibilityRole="progressbar"
            accessibilityLiveRegion="polite"
          >
            Saving diary changes…
          </Text>
        )}

        {mutationError && (
          <Text
            style={styles.mutationError}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {mutationError}
          </Text>
        )}

        {selectedFoodLogs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No food logged</Text>

            <Text style={styles.emptyText}>
              No food entries were recorded for this date.
            </Text>
          </View>
        ) : (
          MEAL_TYPES.map((mealType) => (
            <MealSection
              key={mealType}
              mealType={mealType}
              foods={foodsByMeal[mealType]}
              onDeleteFood={handleDeleteFood}
              mutationPending={isFoodLogMutationPending}
            />
          ))
        )}
      </View>
    </ScrollView>
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
      paddingHorizontal: 24,
    },

    content: {
      width: "100%",
      maxWidth: 1100,
      alignSelf: "center",
    },

    greetingRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 8,
    },

    greeting: {
      flexShrink: 1,
      fontSize: 18,
      color: colors.textSecondary,
    },

    signOutText: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: "700",
    },

    signOutButton: {
      minWidth: 48,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    signOutError: {
      color: colors.danger,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 8,
    },

    titleRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 24,
    },

    title: {
      flexShrink: 1,
      fontSize: 34,
      fontWeight: "800",
      color: colors.text,
    },

    titleActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
    },

    editTargetsButton: {
      minWidth: 48,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },

    editTargetsText: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: "800",
    },

    targetsStateCard: {
      minHeight: 120,
      backgroundColor: colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      marginBottom: 22,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },

    targetsStateText: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },

    targetsErrorText: {
      color: colors.danger,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },

    targetsRetryButton: {
      minWidth: 96,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },

    targetsRetryText: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: "800",
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 24,
      marginBottom: 22,
      borderWidth: 1,
      borderColor: colors.border,
    },

    cardTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },

    cardLead: {
      flex: 1,
      minWidth: 0,
    },

    cardLabel: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 10,
    },

    calorieNumber: {
      fontSize: 42,
      lineHeight: 50,
      fontWeight: "800",
      color: colors.accent,
      marginBottom: 18,
    },

    targetBadge: {
      backgroundColor: colors.accentMuted,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
    },

    targetBadgeText: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: "800",
    },

    calorieProgressBar: {
      marginBottom: 18,
    },

    calorieSummaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 16,
      marginBottom: 14,
    },

    remainingSummary: {
      alignItems: "flex-end",
    },

    summaryLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 4,
    },

    summaryValue: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text,
    },

    cardSubText: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 22,
    },

    sectionTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 14,
    },

    macroCard: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 20,
      marginBottom: 28,
      borderWidth: 1,
      borderColor: colors.border,
    },

    lastMacroCard: {
      marginBottom: 0,
    },

    primaryButton: {
      minHeight: 52,
      backgroundColor: colors.brand,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 30,
    },

    primaryButtonText: {
      color: colors.onBrand,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    },

    disabledButton: {
      opacity: 0.6,
    },

    disabledText: {
      color: colors.disabledText,
    },

    mutationStatus: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 14,
    },

    mutationError: {
      color: colors.danger,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 14,
    },

    sectionHeader: {
      marginBottom: 14,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },

    sectionHeaderTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
    },

    clearButton: {
      minWidth: 48,
      minHeight: 48,
      paddingHorizontal: 8,
      alignItems: "center",
      justifyContent: "center",
    },

    clearText: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: "800",
    },

    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 22,
      borderWidth: 1,
      borderColor: colors.border,
    },

    emptyTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 6,
    },

    emptyText: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 22,
    },
  });
}
