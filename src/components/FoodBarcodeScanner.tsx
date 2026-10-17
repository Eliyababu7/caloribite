import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { cameraPermissionState, webCameraProblem } from "../services/foodSearch/cameraAccess";
import { foodSearchClient } from "../services/foodSearch/foodSearchClient";
import { FOOD_SEARCH_MESSAGES } from "../services/foodSearch/foodSearchService";
import { createScannerController, FOOD_BARCODE_TYPES, INITIAL_SCANNER_STATE } from "../services/foodSearch/scannerController";
import { useAppTheme } from "../theme/theme";

export type ScannerExit = "cancel" | "manual-barcode" | "manual-food" | { foodResult: string };

export function FoodBarcodeScanner({ onExit }: { onExit: (destination: ScannerExit) => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    content: { gap: 14 },
    title: { color: colors.text, fontSize: 28, fontWeight: "800" },
    text: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
    camera: { width: "100%", height: 320, borderRadius: 16, overflow: "hidden" },
    button: { minHeight: 52, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" },
    label: { color: colors.brand, fontSize: 16, fontWeight: "700", textAlign: "center" },
  }), [colors]);
  const [permission, requestPermission, getPermission] = useCameraPermissions({ get: false });
  const [permissionQueryUnavailable, setPermissionQueryUnavailable] = useState(false);
  const [availability, setAvailability] = useState<"checking" | "available" | string>("checking");
  const [cameraError, setCameraError] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const permissionPending = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<View>(null);
  const [state, setState] = useState(INITIAL_SCANNER_STATE);
  const [controller] = useState(() => createScannerController(foodSearchClient, setState));
  const [exit, setExit] = useState<ScannerExit | null>(null);
  const exiting = useRef(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  function close(destination: ScannerExit) {
    if (exiting.current) return;
    exiting.current = true;
    controller.invalidate();
    setExit(destination);
  }
  useEffect(() => {
    mounted.current = true;
    controller.activate();
    const problem = Platform.OS === "web" ? webCameraProblem(globalThis.isSecureContext === true, typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia) : null;
    if (problem) setAvailability(problem);
    else {
      void getPermission().catch(() => { if (mounted.current) setPermissionQueryUnavailable(true); });
      // Browsers can hide video devices until permission is granted. CameraView
      // reports missing hardware through onMountError after the user allows access.
      if (Platform.OS === "web") setAvailability("available");
      else void CameraView.isAvailableAsync().then((available) => {
      if (mounted.current) setAvailability(available ? "available" : "No camera is available. Use a physical device or enter the barcode manually.");
    }).catch(() => { if (mounted.current) setAvailability("Camera access is unavailable. Check browser or device camera settings, or enter the barcode manually."); });
    }
    return () => { mounted.current = false; controller.invalidate(); };
  }, [controller, getPermission]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!heading.current) return;
      if (Platform.OS === "web") heading.current.focus();
      else AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { close("cancel"); return true; });
    return () => subscription.remove();
  });
  // Effects run after the render that removes CameraView, including cached lookups.
  useEffect(() => { if (exit) onExitRef.current(exit); }, [exit]);
  useEffect(() => { if (state.status === "detected" && !exiting.current) void controller.cameraStopped(); }, [controller, state.status]);
  useEffect(() => {
    if (state.status === "result" && state.foodResult) close({ foodResult: state.foodResult });
  }, [state.status, state.foodResult]);

  const access = permissionQueryUnavailable && !permission ? "unrequested" : cameraPermissionState(permission);
  const error = state.status in FOOD_SEARCH_MESSAGES ? state.status as keyof typeof FOOD_SEARCH_MESSAGES : null;
  const message = state.status === "detected" || state.status === "loading" ? `Detected ${state.barcode}. Looking up this product in Open Food Facts...`
    : error === "rate-limited" ? "Open Food Facts is busy. Please wait before retrying. USDA search and manual entry are still available."
    : error ? FOOD_SEARCH_MESSAGES[error] : "Point the rear camera at a packaged food barcode. Hold steady with all bars visible. EAN, UPC and ITF-14 food barcodes are supported.";
  useEffect(() => { AccessibilityInfo.announceForAccessibility(message); }, [message]);
  const button = (label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} style={styles.button} onPress={action}><Text style={styles.label}>{label}</Text></Pressable>;

  async function allowCamera() {
    if (permissionPending.current || exiting.current) return;
    permissionPending.current = true;
    setRequesting(true);
    try { await requestPermission(); }
    catch { if (mounted.current) setCameraError(true); }
    finally { permissionPending.current = false; if (mounted.current) setRequesting(false); }
  }

  return <View style={styles.content}>
    <View ref={heading} accessible accessibilityRole="header" accessibilityLabel="Scan food barcode" tabIndex={-1}>
      <Text style={styles.title}>Scan food barcode</Text>
    </View>
    <Text style={styles.text}>Scanning uses the camera preview only. Photos and videos are not saved or uploaded.</Text>
    {!exit && availability === "available" && access === "ready" && !cameraError && state.status === "ready" &&
      <CameraView style={styles.camera} facing="back" mute barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODE_TYPES] }}
        accessibilityLabel="Rear camera barcode preview"
        onBarcodeScanned={({ type, data }) => { controller.accept(type, data); }}
        onMountError={() => { if (mounted.current && !exiting.current) setCameraError(true); }} />}
    <View accessibilityLiveRegion="polite">
      {(availability === "checking" || (availability === "available" && access === "loading") || requesting) && <ActivityIndicator color={colors.accent} accessibilityLabel="Checking camera access" />}
      {availability !== "available" && availability !== "checking" && <Text style={styles.text} accessibilityRole="alert">{availability}</Text>}
      {availability === "available" && (access === "unrequested" || access === "denied") && <>
        <Text style={styles.text}>{access === "denied" ? "Camera access was denied. Allow access in your browser or device settings, then try again. Manual barcode entry is always available." : "Allow camera access to scan a food barcode. You can also enter the digits manually."}</Text>
        {button("Allow camera access", () => void allowCamera(), requesting)}
      </>}
      {access === "blocked" && <Text style={styles.text} accessibilityRole="alert">Camera permission is blocked. Enable Camera for CaloriBite in your device Settings, or allow camera access in this site's browser settings, then reopen the scanner.</Text>}
      {cameraError && <>
        <Text style={styles.text} accessibilityRole="alert">The camera could not start or scan in this browser or device. Check camera permission, close other camera apps, and try again. On web, use HTTPS or localhost.</Text>
        {button("Retry camera", () => setCameraError(false))}
      </>}
      <Text style={styles.text} accessibilityRole={error ? "alert" : undefined}>{message}</Text>
      {state.barcode !== "" && <Text style={styles.text}>Barcode: {state.barcode}</Text>}
      {state.status === "loading" && <ActivityIndicator color={colors.accent} accessibilityLabel="Finding packaged food" />}
    </View>
    {error && <>
      {error !== "not-found" && button("Retry product lookup", () => void controller.retry())}
      {button("Scan again", () => { setCameraError(false); controller.reset(); })}
    </>}
    {button("Enter barcode manually", () => close("manual-barcode"))}
    {button("Add food manually", () => close("manual-food"))}
    {button("Cancel scanning", () => close("cancel"))}
    {button("Back to Search Food", () => close("cancel"))}
    <Text style={styles.text}>Product data: Open Food Facts (ODbL). Review nutrition before saving.</Text>
  </View>;
}
