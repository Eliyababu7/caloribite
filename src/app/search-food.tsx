import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { STARTER_FOODS, type StarterFood } from "../data/starterFoods";
import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";
import { formatDiaryDate } from "../utils/date";
import { resolveDiaryDateParam } from "../utils/diaryRoute";

export default function SearchFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [searchText, setSearchText] = useState("");

  const loggedDate = resolveDiaryDateParam(params.loggedDate);

  const filteredFoods = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return STARTER_FOODS;
    }

    return STARTER_FOODS.filter((food) =>
      food.foodName.toLowerCase().includes(query),
    );
  }, [searchText]);

  const handleSelectFood = (food: StarterFood) => {
    router.push({
      pathname: "/confirm-food",
      params: {
        foodName: food.foodName,
        calories: String(food.calories),
        protein: String(food.protein),
        carbs: String(food.carbs),
        fat: String(food.fat),
        loggedDate,
      },
    });
  };

  const handleManualEntry = () => {
    router.push({
      pathname: "/add-food",
      params: {
        loggedDate,
      },
    });
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
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Search food
        </Text>

        <Text style={styles.subtitle}>
          Search our starter food database. Select a food, then confirm or edit
          its nutrition details.
        </Text>

        <View style={styles.dateCard}>
          <Text style={styles.dateLabel}>Adding food to</Text>

          <Text style={styles.dateValue}>{formatDiaryDate(loggedDate)}</Text>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search banana, rice, chicken..."
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accent}
          value={searchText}
          onChangeText={setSearchText}
          autoFocus
          returnKeyType="search"
          accessibilityLabel="Search foods"
        />

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Results</Text>

          <Text style={styles.resultsCount} accessibilityLiveRegion="polite">
            {filteredFoods.length} found
          </Text>
        </View>

        {filteredFoods.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No food found</Text>

            <Text style={styles.emptyText}>
              Try another search or enter the food manually.
            </Text>
          </View>
        ) : (
          filteredFoods.map((food) => (
            <Pressable
              key={food.foodName}
              style={styles.foodCard}
              onPress={() => handleSelectFood(food)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${food.foodName}`}
              accessibilityHint="Opens the food confirmation screen"
            >
              <View style={styles.foodInfo}>
                <Text style={styles.foodName}>{food.foodName}</Text>

                <Text style={styles.foodMacros}>
                  P {food.protein}g • C {food.carbs}g • F {food.fat}g
                </Text>
              </View>

              <View style={styles.foodRight}>
                <Text style={styles.foodCalories}>{food.calories} kcal</Text>

                <Text style={styles.selectText}>Select</Text>
              </View>
            </Pressable>
          ))
        )}

        <Pressable
          style={styles.manualButton}
          onPress={handleManualEntry}
          accessibilityRole="button"
          accessibilityLabel="Enter food manually"
        >
          <Text style={styles.manualButtonText}>Enter food manually</Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to diary"
          hitSlop={8}
        >
          <Text style={styles.backText}>Back to diary</Text>
        </Pressable>
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
      maxWidth: 820,
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
      marginBottom: 18,
    },

    dateCard: {
      backgroundColor: colors.accentMuted,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 22,
      alignItems: "center",
    },

    dateLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      marginBottom: 3,
    },

    dateValue: {
      color: colors.accent,
      fontSize: 18,
      fontWeight: "800",
      textAlign: "center",
    },

    searchInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 16,
      fontSize: 16,
      color: colors.text,
      marginBottom: 22,
    },

    resultsHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 14,
    },

    resultsTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
    },

    resultsCount: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.accent,
    },

    foodCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },

    foodInfo: {
      flex: 1,
      minWidth: 0,
    },

    foodName: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 6,
    },

    foodMacros: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },

    foodRight: {
      alignItems: "flex-end",
    },

    foodCalories: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.accent,
      marginBottom: 6,
      textAlign: "right",
    },

    selectText: {
      color: colors.brand,
      fontSize: 13,
      fontWeight: "800",
    },

    emptyCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 22,
      marginBottom: 12,
    },

    emptyTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "800",
      marginBottom: 6,
    },

    emptyText: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },

    manualButton: {
      minHeight: 52,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.brand,
      borderRadius: 999,
      paddingVertical: 15,
      paddingHorizontal: 20,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 10,
    },

    manualButtonText: {
      color: colors.brand,
      fontSize: 15,
      fontWeight: "800",
      textAlign: "center",
    },

    backText: {
      color: colors.accent,
      textAlign: "center",
      fontSize: 15,
      fontWeight: "700",
      marginTop: 20,
    },
  });
}
