import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FoodBarcodeScanner, type ScannerExit } from "../components/FoodBarcodeScanner";
import { useAppTheme } from "../theme/theme";
import { resolveDiaryDateParam } from "../utils/diaryRoute";

export default function ScanBarcodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const loggedDate = resolveDiaryDateParam(params.loggedDate);
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);
  const onExit = (destination: ScannerExit) => {
    if (typeof destination === "object") router.replace({ pathname: "/confirm-food", params: { loggedDate, foodResult: destination.foodResult } });
    else if (destination === "manual-food") router.replace({ pathname: "/add-food", params: { loggedDate } });
    else if (destination === "manual-barcode") router.replace({ pathname: "/search-food", params: { loggedDate, barcodeEntry: "1" } });
    else if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/search-food", params: { loggedDate } });
  };
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ width: "100%", maxWidth: 820, alignSelf: "center", paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}>
    {focused && foreground && <FoodBarcodeScanner onExit={onExit} />}
  </ScrollView>;
}
