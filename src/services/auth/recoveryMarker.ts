import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export type RecoveryMarker = Readonly<{
  version: 1;
  userId: string;
  sessionId: string;
  expiresAt: number;
}>;

const RECOVERY_MARKER_KEY = "caloribite_auth_recovery_marker";

function getWebStorage(): Storage | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isRecoveryMarker(value: unknown): value is RecoveryMarker {
  if (!value || typeof value !== "object") return false;

  const marker = value as Record<string, unknown>;

  return (
    marker.version === 1 &&
    typeof marker.userId === "string" &&
    marker.userId.length > 0 &&
    typeof marker.sessionId === "string" &&
    marker.sessionId.length > 0 &&
    typeof marker.expiresAt === "number" &&
    Number.isFinite(marker.expiresAt)
  );
}

export async function loadRecoveryMarker(): Promise<RecoveryMarker | null> {
  try {
    const webStorage = getWebStorage();
    const raw = webStorage
      ? webStorage.getItem(RECOVERY_MARKER_KEY)
      : await AsyncStorage.getItem(RECOVERY_MARKER_KEY);

    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);

    if (isRecoveryMarker(parsed)) return parsed;

    if (webStorage) {
      webStorage.removeItem(RECOVERY_MARKER_KEY);
    } else {
      await AsyncStorage.removeItem(RECOVERY_MARKER_KEY);
    }

    return null;
  } catch {
    return null;
  }
}

export async function saveRecoveryMarker(marker: RecoveryMarker) {
  const serialized = JSON.stringify(marker);
  const webStorage = getWebStorage();

  if (webStorage) {
    webStorage.setItem(RECOVERY_MARKER_KEY, serialized);
    return;
  }

  await AsyncStorage.setItem(RECOVERY_MARKER_KEY, serialized);
}

export async function clearRecoveryMarker() {
  const webStorage = getWebStorage();

  if (webStorage) {
    webStorage.removeItem(RECOVERY_MARKER_KEY);
    return;
  }

  await AsyncStorage.removeItem(RECOVERY_MARKER_KEY);
}
