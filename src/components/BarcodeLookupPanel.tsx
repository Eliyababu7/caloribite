import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createBarcodeController, type BarcodeState } from "../services/foodSearch/barcodeController";
import { useAccountFoodSearch } from "../services/foodSearch/useAccountFoodSearch";
import { hasIncompleteNutrition, INCOMPLETE_NUTRITION_WARNING } from "../services/foodSearch/confirmationNutrition";
import { FOOD_SEARCH_MESSAGES } from "../services/foodSearch/foodSearchService";
import type { FoodSearchResult } from "../types/foodSearch";
import { useAppTheme, type AppTheme } from "../theme/theme";

export function BarcodeLookupPanel({ onContinue }: { onContinue: (food: FoodSearchResult) => boolean }) {
  const foodSearchClient = useAccountFoodSearch();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [barcode, setBarcode] = useState("");
  const [state, setState] = useState<BarcodeState>({ status: "idle", product: null });
  const controller = useMemo(() => createBarcodeController(foodSearchClient, setState), [foodSearchClient]);
  const [continueError, setContinueError] = useState(false);
  const continuing = useRef(false);
  useEffect(() => {
    setState({ status: "idle", product: null });
    setBarcode(""); continuing.current = false; setContinueError(false);
    return () => controller.invalidate();
  }, [controller]);
  const loading = state.status === "loading";
  const error = state.status in FOOD_SEARCH_MESSAGES ? state.status as keyof typeof FOOD_SEARCH_MESSAGES : null;
  const nutrient = (value: number | null, unit: string) => value === null ? "Unavailable" : `${value}${unit}`;

  return <View style={styles.panel}>
    <Text style={styles.title} accessibilityRole="header">Find a packaged food</Text>
    <Text style={styles.text}>Enter all barcode digits from the packaging, including leading zeroes. Press Find product to look it up.</Text>
    <TextInput
      style={styles.input}
      value={barcode}
      onChangeText={(value) => {
        const digits = value.replace(/[^0-9]/g, "");
        setBarcode(digits);
        controller.setBarcode(digits);
        setContinueError(false);
      }}
      accessibilityLabel="Product barcode digits"
      accessibilityHint="Enter an 8, 12, 13 or 14 digit barcode"
      inputMode="numeric"
      keyboardType="number-pad"
      returnKeyType="search"
      onSubmitEditing={() => void controller.submit()}
      maxLength={14}
      autoCorrect={false}
      autoCapitalize="none"
      placeholder="Product barcode"
      placeholderTextColor={theme.colors.placeholder}
      selectionColor={theme.colors.accent}
    />
    <Pressable style={styles.button} accessibilityRole="button" accessibilityLabel="Find product by barcode"
      accessibilityState={{ disabled: loading, busy: loading }} disabled={loading}
      onPress={() => void controller.submit()}>
      {loading ? <ActivityIndicator color={theme.colors.onBrand} accessibilityLabel="Looking up barcode" /> : <Text style={styles.buttonText}>Find product</Text>}
    </Pressable>
    <View accessibilityLiveRegion="polite">
      {loading && <Text style={styles.text}>Looking up this product in Open Food Facts...</Text>}
      {error && <>
        <Text style={styles.text} accessibilityRole="alert">{error === "rate-limited"
          ? "Open Food Facts is busy. Please wait before retrying. USDA search and manual entry are still available."
          : FOOD_SEARCH_MESSAGES[error]}</Text>
        {!["invalid-barcode", "unauthorized", "not-found"].includes(error) &&
          <Pressable style={styles.retry} accessibilityRole="button" accessibilityLabel="Retry barcode lookup" onPress={() => void controller.submit()}>
            <Text style={styles.retryText}>Retry lookup</Text>
          </Pressable>}
      </>}
    </View>
    {state.product && <View style={styles.product}>
      <Text style={styles.source}>{state.product.source === "custom" ? "Your saved food" : "Open Food Facts"}</Text>
      <Text style={styles.title}>{state.product.name}</Text>
      {state.product.brand && <Text style={styles.text}>{state.product.brand}</Text>}
      <Text style={styles.text}>Barcode: {state.product.barcode}</Text>
      <Text style={styles.text}>Per 100 g: {nutrient(state.product.nutritionPer100g.calories, " kcal")}</Text>
      <Text style={styles.text}>Protein: {nutrient(state.product.nutritionPer100g.protein, " g")} | Carbohydrates: {nutrient(state.product.nutritionPer100g.carbs, " g")} | Fat: {nutrient(state.product.nutritionPer100g.fat, " g")}</Text>
      <Text style={styles.text}>Data: {state.product.attributionLabel}</Text>
      {hasIncompleteNutrition(state.product) && <Text style={styles.text} accessibilityRole="alert">{INCOMPLETE_NUTRITION_WARNING}</Text>}
      {continueError && <Text style={styles.text} accessibilityRole="alert">This product could not be opened. Try another barcode or add food manually.</Text>}
      <Pressable style={styles.button} accessibilityRole="button" accessibilityLabel={`Confirm ${state.product.name}`}
        onPress={() => {
          if (continuing.current || !state.product) return;
          continuing.current = true;
          if (!onContinue(state.product)) { continuing.current = false; setContinueError(true); }
        }}>
        <Text style={styles.buttonText}>Continue to Confirm Food</Text>
      </Pressable>
    </View>}
  </View>;
}

function createStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    panel: { padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, marginBottom: 20 },
    title: { fontSize: 20, fontWeight: "800", color: colors.text, marginBottom: 10 },
    text: { fontSize: 15, lineHeight: 23, color: colors.textSecondary, marginBottom: 10 },
    input: { minHeight: 52, fontSize: 17, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, color: colors.text, backgroundColor: colors.background, marginBottom: 12 },
    button: { minHeight: 52, borderRadius: 999, padding: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, marginBottom: 12 },
    buttonText: { color: colors.onBrand, fontSize: 15, fontWeight: "800", textAlign: "center" },
    retry: { minHeight: 48, justifyContent: "center", marginBottom: 8 },
    retryText: { color: colors.accent, fontWeight: "800", fontSize: 15 },
    product: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 16 },
    source: { color: colors.accent, fontSize: 14, fontWeight: "800", marginBottom: 8 },
  });
}
