import type { FoodSearchResult } from "../../types/foodSearch";
import { serializeFoodResult, validateTransportFood } from "./foodResultTransport";

type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};
export const savedFoodsKey = (userId: string) => `caloribite_saved_foods:user:${userId}`;
const MAX_RECORDS = 500;
const MAX_STORAGE_LENGTH = 3_000_000;

function parseSavedFoods(raw: string | null, userId: string): FoodSearchResult[] {
  if (!raw || raw.length > MAX_STORAGE_LENGTH) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1 ||
      !("foods" in data) || !Array.isArray(data.foods) || data.foods.length > MAX_RECORDS) return [];
    const records = new Map<string, FoodSearchResult>();
    for (const candidate of data.foods) {
      const food = validateTransportFood(candidate);
      if (food?.source === "custom" && food.barcode && (!food.savedForUserId || food.savedForUserId === userId) && serializeFoodResult(food)) records.set(food.barcode, food);
    }
    return [...records.values()];
  } catch { return []; }
}

export function createSavedFoodStore(storage: Storage) {
  // Serialize read-modify-write operations per user, like the existing account stores.
  const writes = new Map<string, Promise<boolean>>();
  return {
    async find(userId: string, barcode: string): Promise<FoodSearchResult | null> {
      if (!userId) return null;
      const key = savedFoodsKey(userId);
      await writes.get(key)?.catch(() => undefined);
      return parseSavedFoods(await storage.getItem(key), userId).find((food) => food.barcode === barcode) ?? null;
    },
    save(userId: string, input: FoodSearchResult, isCurrent = () => true): Promise<boolean> {
      const serialized = serializeFoodResult({ ...input, savedForUserId: userId });
      const food = serialized ? validateTransportFood(JSON.parse(serialized)) : null;
      if (!userId || !food || food.source !== "custom") return Promise.reject(new Error("Invalid saved food"));
      const key = savedFoodsKey(userId);
      const work = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        if (!isCurrent()) return false;
        const raw = await storage.getItem(key);
        if (!isCurrent()) return false;
        // Never overwrite a newer schema. Corrupt/older data is ignored on reads
        // and recovered only when the user explicitly saves a validated record.
        try {
          const data: unknown = JSON.parse(raw ?? "null");
          if (data && typeof data === "object" && "version" in data && typeof data.version === "number" && data.version > 1) {
            throw new Error("Newer saved food format");
          }
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
        const foods = parseSavedFoods(raw, userId).filter((record) => record.barcode !== food.barcode);
        if (foods.length >= MAX_RECORDS) throw new Error("Saved food limit reached");
        foods.push(food);
        const next = JSON.stringify({ version: 1, foods });
        if (next.length > MAX_STORAGE_LENGTH) throw new Error("Saved food limit reached");
        await storage.setItem(key, next);
        return isCurrent();
      });
      writes.set(key, work);
      const cleanup = () => { if (writes.get(key) === work) writes.delete(key); };
      void work.then(cleanup, cleanup);
      return work;
    },
  };
}
export type SavedFoodStore = ReturnType<typeof createSavedFoodStore>;
