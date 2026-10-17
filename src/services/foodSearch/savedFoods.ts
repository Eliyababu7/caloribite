import type { FoodSearchResult } from "../../types/foodSearch";
import { serializeFoodResult, validateTransportFood } from "./foodResultTransport";

type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};
export type SavedFood = FoodSearchResult & { source: "custom"; localId: string };
export const SAVED_FOODS_VERSION = 2;
export const savedFoodsKey = (userId: string) => `caloribite_saved_foods:user:${userId}`;
const MAX_RECORDS = 500;
const MAX_STORAGE_LENGTH = 3_000_000;

type ParsedFoods = { foods: SavedFood[]; unsupported: boolean };
// Version 1 -> 2 is lossless for existing Phase 4D records: add a deterministic
// local ID, retaining all validated product, nutrition and serving fields. Reads
// migrate in memory; the next successful mutation persists v2 atomically at the
// same key. Merely opening the library never rewrites or deletes legacy data.
export function migrateSavedFoods(raw: string | null, userId: string): ParsedFoods {
  if (!raw || raw.length > MAX_STORAGE_LENGTH) return { foods: [], unsupported: !!raw };
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || !("version" in data)) return { foods: [], unsupported: false };
    if (typeof data.version === "number" && data.version > SAVED_FOODS_VERSION) return { foods: [], unsupported: true };
    if ((data.version !== 1 && data.version !== 2) || !("foods" in data) || !Array.isArray(data.foods)) return { foods: [], unsupported: false };
    if (data.foods.length > MAX_RECORDS) return { foods: [], unsupported: true };
    const records = new Map<string, SavedFood>();
    for (const candidate of data.foods) {
      const food = validateTransportFood(candidate);
      if (!food || food.source !== "custom" || (food.savedForUserId && food.savedForUserId !== userId) || !serializeFoodResult(food)) continue;
      const localId = food.localId ?? (food.barcode ? `barcode:${food.barcode}` : undefined);
      if (!localId || (data.version === 1 && !food.barcode)) continue;
      records.set(localId, { ...food, source: "custom", localId });
    }
    return { foods: [...records.values()], unsupported: false };
  } catch { return { foods: [], unsupported: false }; }
}

export function filterSavedFoods(foods: readonly SavedFood[], query: string): SavedFood[] {
  const text = query.trim().toLocaleLowerCase();
  return foods.filter((food) => !text || food.name.toLocaleLowerCase().includes(text) || food.brand?.toLocaleLowerCase().includes(text));
}

export function createSavedFoodStore(storage: Storage, createId: () => string = () => globalThis.crypto.randomUUID()) {
  const writes = new Map<string, Promise<unknown>>();
  const listeners = new Set<(userId: string) => void>();
  async function list(userId: string): Promise<SavedFood[]> {
    if (!userId) return [];
    const key = savedFoodsKey(userId);
    await writes.get(key)?.catch(() => undefined);
    const parsed = migrateSavedFoods(await storage.getItem(key), userId);
    if (parsed.unsupported) throw new Error("Unsupported saved food storage");
    return parsed.foods;
  }
  function mutate(userId: string, isCurrent: () => boolean, change: (foods: SavedFood[]) => SavedFood[]): Promise<boolean> {
    const key = savedFoodsKey(userId);
    const work = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      if (!userId || !isCurrent()) return false;
      const raw = await storage.getItem(key);
      if (!isCurrent()) return false;
      const parsed = migrateSavedFoods(raw, userId);
      if (parsed.unsupported) throw new Error("Unsupported saved food storage");
      const foods = change(parsed.foods);
      if (foods.length > MAX_RECORDS) throw new Error("Saved food limit reached");
      const next = JSON.stringify({ version: SAVED_FOODS_VERSION, foods });
      if (next.length > MAX_STORAGE_LENGTH) throw new Error("Saved food limit reached");
      await storage.setItem(key, next);
      for (const listener of listeners) { try { listener(userId); } catch { /* A view cannot undo a committed save. */ } }
      return isCurrent();
    });
    writes.set(key, work);
    const cleanup = () => { if (writes.get(key) === work) writes.delete(key); };
    void work.then(cleanup, cleanup);
    return work;
  }
  return {
    list,
    subscribe(listener: (userId: string) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async find(userId: string, barcode: string): Promise<FoodSearchResult | null> {
      // Preserve Phase 4D's safe provider fallback for incompatible local data.
      return (await list(userId).catch((error) => {
        if (error instanceof Error && error.message === "Unsupported saved food storage") return [];
        throw error;
      })).find((food) => food.barcode === barcode) ?? null;
    },
    save(userId: string, input: FoodSearchResult, isCurrent = () => true): Promise<boolean> {
      const localId = input.localId ?? (input.barcode ? `barcode:${input.barcode}` : `local:${createId()}`);
      const serialized = serializeFoodResult({ ...input, localId, savedForUserId: userId });
      const food = serialized ? validateTransportFood(JSON.parse(serialized)) : null;
      if (!userId || !food || food.source !== "custom" || !food.localId) return Promise.reject(new Error("Invalid saved food"));
      return mutate(userId, isCurrent, (foods) => {
        const byId = foods.find((record) => record.localId === food.localId);
        const byBarcode = food.barcode ? foods.find((record) => record.barcode === food.barcode) : undefined;
        if (input.localId && byId && byBarcode && byId.localId !== byBarcode.localId) throw new Error("This barcode belongs to another saved food");
        // Migrated IDs contain the original barcode. If that record's barcode
        // was edited, scanning the old barcode must not overwrite the edited food.
        const id = byBarcode?.localId ?? (!input.localId && byId && byId.barcode !== food.barcode
          ? `local:${createId()}` : food.localId!);
        const updated = { ...food, source: "custom" as const, localId: id };
        if (!serializeFoodResult(updated)) throw new Error("Invalid saved food");
        const next = foods.filter((record) => record.localId !== id);
        next.push(updated);
        return next;
      });
    },
    remove(userId: string, localId: string, isCurrent = () => true) {
      return mutate(userId, isCurrent, (foods) => foods.filter((food) => food.localId !== localId));
    },
  };
}
export type SavedFoodStore = ReturnType<typeof createSavedFoodStore>;
