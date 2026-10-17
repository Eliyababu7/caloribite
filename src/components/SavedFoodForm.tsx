import { randomUUID } from "expo-crypto";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { libraryFoodFromInputs, libraryFoodInputs, type LibraryFoodInputs } from "../services/foodSearch/libraryFood";
import { NUTRITION_INPUT_FIELDS } from "../services/foodSearch/confirmationNutrition";
import { useAppTheme } from "../theme/theme";
import type { FoodSearchResult } from "../types/foodSearch";

type Props = { food?: FoodSearchResult; onSave: (food: FoodSearchResult) => Promise<boolean>; onCancel: () => void };
export function SavedFoodForm({ food, onSave, onCancel }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    panel: { gap: 12, padding: 16, borderColor: colors.border, borderWidth: 1, borderRadius: 16, marginBottom: 16 },
    title: { color: colors.text, fontSize: 22, fontWeight: "800" },
    label: { color: colors.text, fontSize: 16, fontWeight: "700" },
    text: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
    input: { minHeight: 52, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, color: colors.text, backgroundColor: colors.surface, fontSize: 16 },
    button: { minHeight: 52, padding: 14, borderColor: colors.brand, borderWidth: 1, borderRadius: 16, justifyContent: "center", alignItems: "center" },
    buttonText: { color: colors.brand, fontWeight: "700", fontSize: 16, textAlign: "center" },
    error: { color: colors.danger, fontSize: 16, lineHeight: 24 },
  }), [colors]);
  const [inputs, setInputs] = useState(() => libraryFoodInputs(food));
  const [localId] = useState(() => food?.localId ?? `local:${randomUUID()}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function save() {
    if (pending.current) return;
    const completed = libraryFoodFromInputs(inputs, localId, food);
    if (!completed) {
      setError("Enter a food name and all four non-negative nutrient values per 100 g. An optional barcode must contain 8, 12, 13 or 14 digits, and an optional serving weight must be greater than zero.");
      return;
    }
    pending.current = true; setSaving(true); setError("");
    try {
      if (!await onSave(completed)) setError("This food could not be saved. Please try again.");
    } catch { setError("This food could not be saved. Please try again. If this barcode is already used by another food you are editing, choose a different barcode."); }
    finally { pending.current = false; setSaving(false); }
  }
  function input(key: keyof LibraryFoodInputs, label: string, numeric = false, maxLength = 20) {
    return <View key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} accessibilityLabel={label} value={inputs[key]}
        editable={!saving} maxLength={maxLength} keyboardType={numeric ? "decimal-pad" : "default"}
        autoCapitalize={numeric ? "none" : "sentences"} placeholderTextColor={colors.placeholder} selectionColor={colors.accent}
        onChangeText={(value) => { setInputs((current) => ({ ...current, [key]: value })); setError(""); }} />
    </View>;
  }
  return <View style={styles.panel}>
    <Text style={styles.title} accessibilityRole="header">{food ? "Edit saved food" : "Create reusable food"}</Text>
    <Text style={styles.text}>Nutrition is per 100 g. All four nutrients are required; enter 0 for genuine zero values. This saves only to your account on this device. Existing diary entries stay unchanged.</Text>
    {input("name", "Saved food name", false, 300)}
    {input("brand", "Brand (optional)", false, 200)}
    {NUTRITION_INPUT_FIELDS.map(([key, label]) => input(key, label, true))}
    {input("barcode", "Barcode (optional)", true, 14)}
    {input("servingGrams", "Default serving weight in grams (optional)", true)}
    {error !== "" && <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">{error}</Text>}
    <Pressable style={styles.button} disabled={saving} accessibilityRole="button" accessibilityLabel="Save reusable food"
      accessibilityState={{ disabled: saving, busy: saving }} onPress={() => void save()}>
      {saving ? <ActivityIndicator color={colors.accent} accessibilityLabel="Saving reusable food" /> : <Text style={styles.buttonText}>Save reusable food</Text>}
    </Pressable>
    <Pressable style={styles.button} disabled={saving} accessibilityRole="button" accessibilityLabel="Cancel food editing"
      accessibilityState={{ disabled: saving }} onPress={onCancel}><Text style={styles.buttonText}>Cancel</Text></Pressable>
  </View>;
}
