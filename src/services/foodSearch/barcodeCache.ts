import type { FoodSearchResult } from "../../types/foodSearch";
import { deserializeFoodResult, serializeFoodResult } from "./foodResultTransport";

// Public product data only: at most 20 bounded records, for at most five minutes.
// Serialized snapshots isolate the cache from form edits and consumer mutation.
export function createBarcodeCache(now = Date.now, capacity = 20, ttlMs = 300000) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20 ||
    !Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 300000) throw new RangeError("Invalid barcode cache bounds");
  const entries = new Map<string, { serialized: string; expiresAt: number }>();
  return {
    get(code: string): FoodSearchResult | null {
      const entry = entries.get(code);
      if (!entry) return null;
      entries.delete(code);
      if (entry.expiresAt <= now()) return null;
      entries.set(code, entry);
      return deserializeFoodResult(entry.serialized);
    },
    set(code: string, food: FoodSearchResult) {
      if (food.source !== "open-food-facts" || food.barcode !== code) return;
      const serialized = serializeFoodResult(food);
      if (!serialized) return;
      for (const [key, entry] of entries) if (entry.expiresAt <= now()) entries.delete(key);
      entries.delete(code);
      entries.set(code, { serialized, expiresAt: now() + ttlMs });
      while (entries.size > capacity) entries.delete(entries.keys().next().value!);
    },
    clear() { entries.clear(); },
  };
}
