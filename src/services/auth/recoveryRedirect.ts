import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

export type RecoveryCallback =
  | { kind: "none" }
  | { kind: "direct" }
  | { kind: "error" }
  | { kind: "code"; code: string };

const RECOVERY_PATH = "update-password";
const MAXIMUM_CODE_LENGTH = 2048;

function isRecoveryPath(url: URL) {
  const pathParts = url.pathname.split("/").filter(Boolean);
  const lastPathPart = pathParts.at(-1)?.toLowerCase();
  const hostname = url.hostname.toLowerCase();

  return lastPathPart === RECOVERY_PATH || hostname === RECOVERY_PATH;
}

export function createPasswordRecoveryRedirectUrl() {
  return Linking.createURL(RECOVERY_PATH);
}

export function parsePasswordRecoveryCallback(
  callbackUrl: string | null,
): RecoveryCallback {
  if (!callbackUrl) return { kind: "none" };

  try {
    const url = new URL(callbackUrl);

    if (!isRecoveryPath(url)) return { kind: "none" };

    if (
      url.searchParams.has("error") ||
      url.searchParams.has("error_code") ||
      url.hash.includes("error=") ||
      url.hash.includes("error_code=")
    ) {
      return { kind: "error" };
    }

    const codes = url.searchParams.getAll("code");
    if (codes.length === 0) return { kind: "direct" };
    const code = codes.length === 1 ? codes[0]?.trim() : null;

    if (!code) return { kind: "error" };
    if (code.length > MAXIMUM_CODE_LENGTH) return { kind: "error" };

    return { kind: "code", code };
  } catch {
    return { kind: "none" };
  }
}

export async function fingerprintRecoveryCode(code: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, code);
}

export function removeRecoveryParametersFromVisibleUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.history.replaceState(null, "", "/update-password");
    return;
  }

  Linking.clearInitialURL();
}
