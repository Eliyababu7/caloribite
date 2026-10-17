import { createBarcodeController, type BarcodeState } from "./barcodeController";
import { isValidProductBarcode } from "./barcodeValidation";
import { serializeFoodResult } from "./foodResultTransport";
import type { FoodSearchService } from "./foodSearchService";

export const FOOD_BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "itf14"] as const;
export type ScannerState = {
  status: "ready" | "detected" | Exclude<BarcodeState["status"], "idle">;
  barcode: string;
  foodResult: string | null;
};
export const INITIAL_SCANNER_STATE: ScannerState = { status: "ready", barcode: "", foodResult: null };

export function acceptsFoodScan(type: unknown, data: unknown): data is string {
  return FOOD_BARCODE_TYPES.some((allowed) => allowed === type) && isValidProductBarcode(data);
}

// Detection only locks the scanner. The view starts lookup after removing its camera.
export function createScannerController(service: Pick<FoodSearchService, "barcode">, onState: (state: ScannerState) => void) {
  let active = true;
  let locked = false;
  let state = INITIAL_SCANNER_STATE;
  const emit = (next: ScannerState) => { state = next; if (active) onState(next); };
  const lookup = createBarcodeController(service, (result) => {
    if (!active || result.status === "idle") return;
    const foodResult = result.product ? serializeFoodResult(result.product) : null;
    emit({ barcode: state.barcode, status: result.status === "result" && !foodResult ? "provider-error" : result.status, foodResult });
  });
  return {
    activate() { lookup.invalidate(); active = true; locked = false; emit(INITIAL_SCANNER_STATE); },
    accept(type: unknown, data: unknown) {
      if (!active || locked || !acceptsFoodScan(type, data)) return false;
      locked = true; // Synchronous: another native callback cannot submit a second code.
      emit({ status: "detected", barcode: data, foodResult: null });
      lookup.setBarcode(data);
      return true;
    },
    async cameraStopped() {
      if (active && state.status === "detected") await lookup.submit();
    },
    async retry() {
      if (active && locked && !["ready", "detected", "loading", "result"].includes(state.status)) await lookup.submit();
    },
    reset() {
      if (!active) return;
      lookup.invalidate();
      locked = false;
      emit(INITIAL_SCANNER_STATE);
    },
    invalidate() { active = false; locked = true; lookup.invalidate(); },
  };
}
