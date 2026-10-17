import type { FoodSearchResult } from "../../types/foodSearch";
import { FoodSearchError, type FoodSearchErrorKind, type FoodSearchService } from "./foodSearchService";

export type SearchState =
  | { status: "idle" | "loading" | "empty"; results: FoodSearchResult[] }
  | { status: "results"; results: FoodSearchResult[] }
  | { status: FoodSearchErrorKind; results: FoodSearchResult[] };

// Only explicit submit performs I/O. Generations prevent old completions after reset/unmount.
export function createSearchController(service: FoodSearchService, onState: (state: SearchState) => void) {
  let generation = 0;
  let pending = false;
  let draftQuery = "";
  return {
    isPending: () => pending,
    setQuery(query: string) { draftQuery = query; },
    invalidate() { generation++; pending = false; },
    async submit(query = draftQuery) {
      if (pending) return;
      const current = ++generation;
      pending = true;
      onState({ status: "loading", results: [] });
      try {
        const results = await service.search(query);
        if (current === generation) onState({ status: results.length ? "results" : "empty", results });
      } catch (error) {
        if (current === generation) onState({ status: error instanceof FoodSearchError ? error.kind : "provider-error", results: [] });
      } finally {
        if (current === generation) pending = false;
      }
    },
  };
}
