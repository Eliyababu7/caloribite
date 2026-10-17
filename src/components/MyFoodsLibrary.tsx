import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { filterSavedFoods, type SavedFood } from "../services/foodSearch/savedFoods";
import { useAccountFoodSearch } from "../services/foodSearch/useAccountFoodSearch";
import { useAppTheme } from "../theme/theme";
import type { FoodSearchResult } from "../types/foodSearch";
import { SavedFoodForm } from "./SavedFoodForm";

type Props = { query: string; onSelect: (food: FoodSearchResult) => boolean };
export function MyFoodsLibrary({ query, onSelect }: Props) {
  const client = useAccountFoodSearch();
  const { colors } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    section: { gap: 12, marginBottom: 24 },
    title: { color: colors.text, fontSize: 22, fontWeight: "800" },
    text: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
    card: { gap: 10, padding: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
    button: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.brand, padding: 14, justifyContent: "center", alignItems: "center" },
    buttonText: { color: colors.brand, fontSize: 16, fontWeight: "700", textAlign: "center" },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    input: { minHeight: 52, color: colors.text, backgroundColor: colors.surface, padding: 14, borderRadius: 12, borderColor: colors.border, borderWidth: 1, fontSize: 16 },
    error: { color: colors.danger, fontSize: 16, lineHeight: 24 },
  }), [colors]);
  type Loaded = { client: typeof client; foods: SavedFood[]; status: "loading" | "ready" | "error" };
  const [loaded, setLoaded] = useState<Loaded>({ client, foods: [], status: "loading" });
  const [manage, setManage] = useState(false);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<SavedFood | "new" | null>(null);
  const [deleting, setDeleting] = useState<SavedFood | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const active = useRef(true);
  const pending = useRef(false);
  const clientRef = useRef(client); clientRef.current = client;
  async function refresh() {
    const request = ++generation.current;
    setLoaded({ client, foods: [], status: "loading" });
    try {
      const foods = await client.listFoods();
      if (active.current && request === generation.current && clientRef.current === client) setLoaded({ client, foods, status: "ready" });
    } catch {
      if (active.current && request === generation.current && clientRef.current === client) setLoaded({ client, foods: [], status: "error" });
    }
  }
  useEffect(() => {
    active.current = true;
    pending.current = false; setBusy(false);
    setEditing(null); setDeleting(null); setError(""); setManage(false); setFilter("");
    void refresh();
    const unsubscribe = client.subscribeFoods(() => { void refresh(); });
    return () => { active.current = false; generation.current++; unsubscribe(); };
  }, [client]);
  const ownsState = loaded.client === client;
  const foods = ownsState ? filterSavedFoods(loaded.foods, manage ? filter : query) : [];
  const status = ownsState ? loaded.status : "loading";
  async function remove() {
    if (!deleting || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const succeeded = await client.deleteFood(deleting.localId);
      if (active.current && clientRef.current === client) {
        if (succeeded) { setDeleting(null); setEditing(null); }
        else setError("This food could not be deleted. Please try again.");
      }
    } catch { if (active.current && clientRef.current === client) setError("This food could not be deleted. Please try again."); }
    finally { if (active.current && clientRef.current === client) { pending.current = false; setBusy(false); } }
  }
  const button = (label: string, action: () => void) => <Pressable style={styles.button} accessibilityRole="button"
    accessibilityLabel={label} accessibilityState={{ disabled: busy }} disabled={busy} onPress={action}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  const editor = (food?: SavedFood) => <SavedFoodForm key={food?.localId ?? "new"} food={food}
    onCancel={() => setEditing(null)} onSave={async (completed) => {
      if (pending.current) return false;
      pending.current = true; setBusy(true);
      try {
        const succeeded = await client.saveFood(completed);
        if (succeeded && active.current && clientRef.current === client) { setEditing(null); setError(""); }
        return succeeded;
      } finally { if (active.current && clientRef.current === client) { pending.current = false; setBusy(false); } }
    }} />;

  return <View style={styles.section}>
    <Pressable style={styles.button} accessibilityRole="button" accessibilityLabel="My Foods"
      accessibilityState={{ expanded: manage, disabled: busy }} disabled={busy}
      onPress={() => { setManage((current) => !current); setFilter(""); setEditing(null); setDeleting(null); setError(""); }}>
      <Text style={styles.buttonText}>{manage ? "Close My Foods" : "My Foods"}</Text>
    </Pressable>
    <Text style={styles.title} accessibilityRole="header">{manage ? "My Foods" : "Matching My Foods"}</Text>
    <Text style={styles.text}>Saved privately for your account on this device.</Text>
    {manage && <>
      <TextInput style={styles.input} accessibilityLabel="Filter My Foods by name or brand" value={filter}
        placeholder="Filter by name or brand" placeholderTextColor={colors.placeholder} selectionColor={colors.accent}
        onChangeText={setFilter} editable={!busy} maxLength={300} autoCorrect={false} />
      {button("Create reusable food", () => { setEditing("new"); setDeleting(null); setError(""); })}
    </>}
    {ownsState && manage && editing === "new" && editor()}
    {status === "loading" && <ActivityIndicator color={colors.accent} accessibilityLabel="Loading My Foods" />}
    {status === "error" && <>
      <Text style={styles.error} accessibilityRole="alert">My Foods could not be loaded. Please try again. Your existing saved data has not been changed.</Text>
      {button("Retry My Foods", () => void refresh())}
    </>}
    {status === "ready" && !foods.length && <Text style={styles.text} accessibilityLiveRegion="polite">
      {loaded.foods.length ? "No saved foods match this name or brand." : "No saved foods yet. Open My Foods to create a reusable food, or save completed barcode nutrition."}
    </Text>}
    {foods.map((food) => <View key={food.localId} style={styles.card}>
      <Text style={styles.title}>{food.name}</Text>
      {food.brand && <Text style={styles.text}>{food.brand}</Text>}
      {food.barcode && <Text style={styles.text}>Barcode: {food.barcode}</Text>}
      <Text style={styles.text}>Per 100 g: {food.nutritionPer100g.calories} kcal | Protein {food.nutritionPer100g.protein} g | Carbohydrates {food.nutritionPer100g.carbs} g | Fat {food.nutritionPer100g.fat} g</Text>
      {button(`Select saved ${food.name}`, () => { if (!onSelect(food)) setError("This food could not be opened. Try again or add food manually."); })}
      {manage && <View style={styles.row}>
        {button(`Edit ${food.name}`, () => { setEditing(food); setDeleting(null); setError(""); })}
        {button(`Delete ${food.name}`, () => { setEditing(null); setDeleting(food); setError(""); })}
      </View>}
      {manage && editing !== "new" && editing?.localId === food.localId && editor(food)}
      {deleting?.localId === food.localId && <View style={styles.card}>
        <Text style={styles.text} accessibilityRole="alert">Delete {deleting.name} from My Foods? Existing diary entries will remain unchanged.</Text>
        {button("Confirm delete saved food", () => void remove())}
        {button("Keep saved food", () => setDeleting(null))}
      </View>}
    </View>)}
    {ownsState && error !== "" && <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">{error}</Text>}
  </View>;
}
