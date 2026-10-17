import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { completeBarcodeNutrition, hasIncompleteNutrition, INCOMPLETE_NUTRITION_WARNING, NUTRITION_INPUT_FIELDS, nutritionInputs } from "../services/foodSearch/confirmationNutrition";
import { useAppTheme } from "../theme/theme";
import type { FoodSearchResult } from "../types/foodSearch";

type Props = {
  food: FoodSearchResult;
  name: string;
  disabled: boolean;
  onApply: (food: FoodSearchResult) => void;
  onSave?: (food: FoodSearchResult) => Promise<boolean>;
};

export function BarcodeNutritionEditor({ food, name, disabled, onApply, onSave }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    panel: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 16, gap: 12, marginBottom: 20 },
    text: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
    label: { color: colors.text, fontWeight: "700", fontSize: 16 },
    input: { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 52, fontSize: 16 },
    button: { minHeight: 52, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.brand, borderRadius: 16, padding: 12 },
    buttonText: { color: colors.brand, fontSize: 16, fontWeight: "700", textAlign: "center" },
    error: { color: colors.danger, fontSize: 16, lineHeight: 24 },
  }), [colors]);
  const [inputs, setInputs] = useState(() => nutritionInputs(food.nutritionPer100g));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function apply(save: boolean) {
    if (disabled || pending.current) return;
    const completed = completeBarcodeNutrition(food, inputs, name);
    if (!completed) {
      setError("Enter a food name and a non-negative number for every nutrient per 100 g. Leave genuine zero values as 0.");
      setMessage("");
      return;
    }
    onApply(completed);
    setError("");
    setMessage("Package nutrition applied. Review the serving totals below before saving to your diary.");
    if (!save || !onSave) return;
    pending.current = true;
    try {
      const saved = await onSave(completed);
      if (mounted.current) {
        if (saved) setMessage("Saved privately on this device for your account. This barcode will use your completed nutrition next time.");
        else { setMessage(""); setError("This food could not be saved privately. Please try again. Your diary has not been changed."); }
      }
    } catch {
      if (mounted.current) { setMessage(""); setError("This food could not be saved privately. Please try again. Your diary has not been changed."); }
    } finally { pending.current = false; }
  }

  return <View style={styles.panel}>
    {hasIncompleteNutrition(food) && <Text style={styles.text} accessibilityRole="alert">{INCOMPLETE_NUTRITION_WARNING}</Text>}
    <Text style={styles.label}>Package nutrition per 100 g</Text>
    <Text style={styles.text}>Barcode: {food.barcode}{food.brand ? ` | ${food.brand}` : ""}</Text>
    <Text style={styles.text}>Enter values from the package per 100 g, then apply them to calculate your serving. Saving here remembers the food only for your account on this device; it does not add a diary entry.</Text>
    {NUTRITION_INPUT_FIELDS.map(([key, label]) => <View key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={inputs[key]} accessibilityLabel={label} keyboardType="decimal-pad"
        maxLength={20} editable={!disabled} placeholder="Unavailable - enter value"
        placeholderTextColor={colors.placeholder} selectionColor={colors.accent}
        onChangeText={(value) => { setInputs((current) => ({ ...current, [key]: value })); setMessage(""); setError(""); }} />
    </View>)}
    {error !== "" && <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">{error}</Text>}
    {message !== "" && <Text style={styles.text} accessibilityLiveRegion="polite">{message}</Text>}
    <Pressable style={styles.button} accessibilityRole="button" accessibilityLabel="Apply package nutrition"
      accessibilityState={{ disabled }} disabled={disabled} onPress={() => void apply(false)}>
      <Text style={styles.buttonText}>Apply package nutrition</Text>
    </Pressable>
    {onSave && <Pressable style={styles.button} accessibilityRole="button" accessibilityLabel="Save food privately on this device"
      accessibilityState={{ disabled }} disabled={disabled} onPress={() => void apply(true)}>
      <Text style={styles.buttonText}>Save food privately on this device</Text>
    </Pressable>}
  </View>;
}
