import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BarcodeLookupPanel } from "../components/BarcodeLookupPanel";
import { MyFoodsLibrary } from "../components/MyFoodsLibrary";
import { foodSearchClient } from "../services/foodSearch/foodSearchClient";
import { FOOD_SEARCH_MESSAGES, FoodSearchError, type FoodSearchErrorKind } from "../services/foodSearch/foodSearchService";
import { serializeFoodResult } from "../services/foodSearch/foodResultTransport";
import { createSearchController, type SearchState } from "../services/foodSearch/searchController";
import type { FoodSearchResult } from "../types/foodSearch";
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

  const [showBarcode, setShowBarcode] = useState(params.barcodeEntry === "1");
  useEffect(() => { if (params.barcodeEntry === "1") setShowBarcode(true); }, [params.barcodeEntry]);
  const [searchText, setSearchText] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle", results: [] });
  const [controller] = useState(() => createSearchController(foodSearchClient, setSearchState));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<FoodSearchErrorKind | null>(null);
  const [retryFood, setRetryFood] = useState<FoodSearchResult | null>(null);
  const selectionGeneration = useRef(0);
  const selectionPending = useRef(false);
  const lastQuery = useRef("");
  useEffect(() => () => {
    controller.invalidate();
    selectionGeneration.current++;
  }, [controller]);

  const invalidateSelection = () => {
    selectionGeneration.current++;
    selectionPending.current = false;
    setSelectedId(null);
    setSelectionError(null);
    setRetryFood(null);
  };
  const submitSearch = (query = searchText) => {
    if (controller.isPending()) return;
    invalidateSelection();
    lastQuery.current = query;
    void controller.submit(query);
  };
  const leaveSearch = () => {
    setShowBarcode(false);
    controller.invalidate();
    setSearchState((state) => state.status === "loading" ? { status: "idle", results: [] } : state);
    invalidateSelection();
  };
  const selectUsdaFood = async (food: FoodSearchResult) => {
    if (selectionPending.current || !food.externalId) return;
    selectionPending.current = true;
    const generation = ++selectionGeneration.current;
    setSelectedId(food.externalId);
    setSelectionError(null);
    setRetryFood(food);
    try {
      const detail = await foodSearchClient.detail(food.externalId);
      if (generation !== selectionGeneration.current) return;
      const foodResult = serializeFoodResult(detail);
      if (!foodResult) throw new FoodSearchError("provider-error");
      leaveSearch();
      router.push({ pathname: "/confirm-food", params: { foodResult, loggedDate } });
    } catch (error) {
      if (generation === selectionGeneration.current) setSelectionError(error instanceof FoodSearchError ? error.kind : "provider-error");
    } finally {
      if (generation === selectionGeneration.current) {
        selectionPending.current = false;
        setSelectedId(null);
      }
    }
  };
  const searchError = searchState.status in FOOD_SEARCH_MESSAGES ? searchState.status as FoodSearchErrorKind : null;
  const showStarterFoods = searchState.status === "idle" || searchState.status === "empty" || searchError !== null;
  const nutrientText = (value: number | null, unit: string) => value === null ? "Unavailable" : `${value}${unit}`;

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
    leaveSearch();
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

  const handleBarcodeContinue = (food: FoodSearchResult): boolean => {
    const foodResult = serializeFoodResult(food);
    if (!foodResult) return false;
    leaveSearch();
    router.push({ pathname: "/confirm-food", params: { foodResult, loggedDate } });
    return true;
  };

  const handleManualEntry = () => {
    leaveSearch();
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
          Search USDA foods, then review serving sizes and nutrition. Starter foods and manual entry are always available as fallbacks.
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
          onChangeText={(value) => { setSearchText(value); controller.setQuery(value); }}
          onSubmitEditing={() => submitSearch()}
          maxLength={120}
          autoFocus
          returnKeyType="search"
          accessibilityLabel="Search foods"
        />

        <Pressable style={styles.searchButton} onPress={() => submitSearch()}
          disabled={searchState.status === "loading"}
          accessibilityRole="button" accessibilityLabel="Search USDA foods"
          accessibilityState={{ disabled: searchState.status === "loading", busy: searchState.status === "loading" }}>
          {searchState.status === "loading" ? <ActivityIndicator color={theme.colors.onBrand} accessibilityLabel="Searching USDA foods" /> :
            <Text style={styles.searchButtonText}>Search</Text>}
        </Pressable>
        <Pressable
          style={styles.manualButton}
          onPress={handleManualEntry}
          accessibilityRole="button"
          accessibilityLabel="Add food manually"
        >
          <Text style={styles.manualButtonText}>Add food manually</Text>
        </Pressable>

        <Pressable style={styles.manualButton} accessibilityRole="button"
          accessibilityLabel="Enter product barcode" accessibilityState={{ expanded: showBarcode }}
          onPress={() => setShowBarcode((visible) => !visible)}>
          <Text style={styles.manualButtonText}>{showBarcode ? "Close barcode entry" : "Enter product barcode"}</Text>
        </Pressable>
        <Pressable style={styles.manualButton} accessibilityRole="button" accessibilityLabel="Scan barcode"
          onPress={() => { leaveSearch(); router.push({ pathname: "/scan-barcode", params: { loggedDate } }); }}>
          <Text style={styles.manualButtonText}>Scan barcode</Text>
        </Pressable>
        <MyFoodsLibrary query={searchText} onSelect={handleBarcodeContinue} />
        {showBarcode && <BarcodeLookupPanel onContinue={handleBarcodeContinue} />}

        <View accessibilityLiveRegion="polite">
          {searchState.status === "idle" && <Text style={styles.emptyText}>Enter a food and press Search to find USDA results.</Text>}
          {searchState.status === "loading" && <Text style={styles.emptyText}>Searching USDA foods...</Text>}
          {searchState.status === "empty" && <Text style={styles.emptyText}>No USDA foods found. Try another query or add food manually.</Text>}
          {searchError && <View style={styles.emptyCard}>
            <Text style={styles.emptyText} accessibilityRole="alert">{FOOD_SEARCH_MESSAGES[searchError]}</Text>
            {searchError !== "unauthorized" && searchError !== "invalid-query" &&
              <Pressable style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Retry USDA search" onPress={() => submitSearch(lastQuery.current)}>
                <Text style={styles.selectText}>Retry search</Text>
              </Pressable>}
          </View>}
        </View>
        {searchState.status === "results" && <>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>USDA results</Text>
            <Text style={styles.resultsCount}>{searchState.results.length} found</Text>
          </View>
          {searchState.results.map((food) => <Pressable key={food.externalId}
            style={styles.foodCard} onPress={() => void selectUsdaFood(food)} disabled={selectedId !== null}
            accessibilityRole="button" accessibilityLabel={`Select USDA ${food.name}`}
            accessibilityHint="Loads serving and nutrition details" accessibilityState={{ disabled: selectedId !== null, busy: selectedId === food.externalId }}>
            <View style={styles.foodInfo}>
              <Text style={styles.selectText}>USDA</Text>
              <Text style={styles.foodName}>{food.name}</Text>
              {food.brand && <Text style={styles.foodMacros}>{food.brand}</Text>}
              <Text style={styles.foodCalories}>{nutrientText(food.nutritionPer100g.calories, " kcal")} per 100 g</Text>
              <Text style={styles.foodMacros}>P {nutrientText(food.nutritionPer100g.protein, " g")} | C {nutrientText(food.nutritionPer100g.carbs, " g")} | F {nutrientText(food.nutritionPer100g.fat, " g")}</Text>
            </View>
            {selectedId === food.externalId ? <ActivityIndicator color={theme.colors.accent} accessibilityLabel={`Loading ${food.name} details`} /> : <Text style={styles.selectText}>Select</Text>}
          </Pressable>)}
        </>}
        {selectionError && <View style={styles.emptyCard}>
          <Text style={styles.emptyText} accessibilityRole="alert">{FOOD_SEARCH_MESSAGES[selectionError]}</Text>
          {selectionError !== "unauthorized" && retryFood && <Pressable style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Retry loading food details" onPress={() => void selectUsdaFood(retryFood)}><Text style={styles.selectText}>Retry details</Text></Pressable>}
        </View>}
        {showStarterFoods && <>
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Starter foods</Text>
          <Text style={styles.resultsCount}>{filteredFoods.length} found</Text>
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

        </>}



        <Pressable
          onPress={() => { leaveSearch(); router.back(); }}
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
    searchButton: { minHeight: 52, backgroundColor: colors.brand, borderRadius: 999, alignItems: "center", justifyContent: "center", marginBottom: 20 },
    searchButtonText: { color: colors.onBrand, fontSize: 16, fontWeight: "800" },
    retryButton: { minHeight: 48, justifyContent: "center", paddingHorizontal: 12 },
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
      marginBottom: 18,
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
      minHeight: 48,
      color: colors.accent,
      textAlign: "center",
      fontSize: 15,
      fontWeight: "700",
      marginTop: 20,
    },
  });
}
