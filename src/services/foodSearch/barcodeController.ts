import type { FoodSearchResult } from "../../types/foodSearch";
import { FoodSearchError, type FoodSearchErrorKind, type FoodSearchService } from "./foodSearchService";

export type BarcodeState = {
  status: "idle" | "loading" | "result" | FoodSearchErrorKind;
  product: FoodSearchResult | null;
};

export function createBarcodeController(service: Pick<FoodSearchService, "barcode">, onState: (state: BarcodeState) => void) {
  let barcode = "";
  let generation = 0;
  let pending = false;
  return {
    invalidate() { generation++; pending = false; },
    setBarcode(value: string) {
      if (value === barcode) return;
      barcode = value;
      generation++;
      pending = false;
      onState({ status: "idle", product: null });
    },
    async submit() {
      if (pending) return;
      pending = true;
      const current = ++generation;
      onState({ status: "loading", product: null });
      try {
        const product = await service.barcode(barcode);
        if (generation === current) onState({ status: "result", product });
      } catch (error) {
        if (generation === current) onState({ status: error instanceof FoodSearchError ? error.kind : "provider-error", product: null });
      } finally {
        if (generation === current) pending = false;
      }
    },
  };
}
