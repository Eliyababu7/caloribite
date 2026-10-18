import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFoodLogBackup } from "../context/FoodLogSyncContext";
import { useAppTheme } from "../theme/theme";
import type { BackupStatus } from "../services/foodLogs/foodLogBackupPreferences";

const labels: Record<BackupStatus, string> = {
  device: "Saved on this device", pending: "Synchronization pending", syncing: "Synchronizing",
  "up-to-date": "Up to date", offline: "Offline", "sign-in-required": "Sign-in required", failed: "Synchronization failed",
};
export function DiaryCloudBackup() {
  const backup = useFoodLogBackup();
  const { colors } = useAppTheme();
  if (!backup.available) return null;
  const signedOut = backup.status === "sign-in-required" && !backup.enabled;
  const button = (label: string, action: () => unknown, disabled = false) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled, busy: backup.busy }} disabled={disabled}
      onPress={() => { void action(); }} style={[styles.button, { backgroundColor: disabled ? colors.disabled : colors.accent }]}>
      <Text style={[styles.buttonText, { color: disabled ? colors.disabledText : colors.onAccent }]}>{label}</Text>
    </Pressable>
  );
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Diary cloud backup</Text>
    <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary }}>{labels[backup.status]}</Text>
    <Text style={[styles.description, { color: colors.textSecondary }]}>
      {backup.enabled ? "Offline diary use continues. Pausing backup stops future synchronization and keeps existing cloud data."
        : "Cloud backup is optional. Your diary remains usable on this device."}
    </Text>
    {backup.preferenceError && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{backup.preferenceError}</Text>}
    <View style={styles.actions}>
      {backup.enabled ? <>
        {button("Pause cloud backup", backup.disable, backup.busy)}
        {button(backup.status === "failed" || backup.status === "offline" || backup.status === "sign-in-required" ? "Retry synchronization" : "Sync now",
          backup.syncNow, backup.busy || backup.status === "syncing")}
      </> : button("Enable cloud backup", backup.enable, backup.busy || signedOut)}
      {backup.preferenceError && button("Retry saving backup choice", backup.retryChoice, backup.busy)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  title: { fontSize: 18, fontWeight: "700" },
  description: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  buttonText: { fontSize: 15, fontWeight: "700" },
});
