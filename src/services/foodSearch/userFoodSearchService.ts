import type { FoodSearchResult } from "../../types/foodSearch";
import { isValidProductBarcode } from "./barcodeValidation";
import { FoodSearchError, type FoodSearchService } from "./foodSearchService";
import type { SavedFoodStore } from "./savedFoods";

type Owner = Readonly<{ userId: string; generation: number }>;

export function createUserFoodSearchService(provider: FoodSearchService, store: SavedFoodStore, getOwner: () => Owner | null) {
  return {
    ...provider,
    async barcode(code: string): Promise<FoodSearchResult> {
      if (!isValidProductBarcode(code)) throw new FoodSearchError("invalid-barcode");
      const owner = getOwner();
      if (!owner) throw new FoodSearchError("unauthorized");
      const isCurrent = () => getOwner()?.userId === owner.userId && getOwner()?.generation === owner.generation;
      // Do this before provider cache, connectivity checks or remote requests.
      // Storage I/O failures may fall back to the provider, but never another user.
      const saved = await store.find(owner.userId, code).catch(() => null);
      if (!isCurrent()) throw new FoodSearchError("unauthorized");
      if (saved) return { ...saved, savedForUserId: owner.userId };
      const food = await provider.barcode(code);
      if (!isCurrent()) throw new FoodSearchError("unauthorized");
      return food;
    },
    async saveFood(food: FoodSearchResult): Promise<boolean> {
      const owner = getOwner();
      if (!owner) return false;
      return store.save(owner.userId, food, () => getOwner()?.userId === owner.userId && getOwner()?.generation === owner.generation);
    },
  };
}
