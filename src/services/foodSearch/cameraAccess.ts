type Permission = { granted: boolean; canAskAgain: boolean; status: string };
export function cameraPermissionState(permission: Permission | null) {
  if (!permission) return "loading";
  if (permission.granted) return "ready";
  if (!permission.canAskAgain) return "blocked";
  return permission.status === "undetermined" ? "unrequested" : "denied";
}

export function webCameraProblem(secure: boolean, hasMediaDevices: boolean): string | null {
  if (!secure) return "Camera scanning needs HTTPS or localhost. Open a secure address or enter the barcode manually.";
  if (!hasMediaDevices) return "This browser does not support camera access. Try a supported browser or enter the barcode manually.";
  return null;
}
