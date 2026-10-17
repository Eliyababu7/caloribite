import type { FoodSearchResult } from "../../types/foodSearch";
import { validateTransportFood } from "./foodResultTransport";

export type FoodSearchErrorKind = "invalid-query" | "offline" | "timeout" | "unauthorized" | "rate-limited" | "provider-error";
export const FOOD_SEARCH_MESSAGES: Record<FoodSearchErrorKind, string> = {
  "invalid-query": "Enter between 2 and 120 characters to search.",
  offline: "You appear to be offline. Check your connection and try again.",
  timeout: "Food search took too long. Please try again.",
  unauthorized: "Your session could not be verified. Please sign in again.",
  "rate-limited": "Food search is busy. Please wait a little before retrying.",
  "provider-error": "Food search is unavailable. Try again or add food manually.",
};
export class FoodSearchError extends Error {
  constructor(readonly kind: FoodSearchErrorKind) { super(FOOD_SEARCH_MESSAGES[kind]); }
}
export type FoodSearchRequest = { action: "search"; query: string; pageSize: number } | { action: "detail"; fdcId: number };
export type InvokeFoodSearch = (body: FoodSearchRequest, signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>;
export type FoodSearchService = {
  search: (query: string) => Promise<FoodSearchResult[]>;
  detail: (externalId: string) => Promise<FoodSearchResult>;
};
function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("context" in error)) return;
  const context = error.context;
  if (typeof context === "object" && context !== null && "status" in context && typeof context.status === "number") return context.status;
}
function classifyError(error: unknown): FoodSearchError {
  const status = errorStatus(error);
  if (status === 401 || status === 403) return new FoodSearchError("unauthorized");
  if (status === 429) return new FoodSearchError("rate-limited");
  if (status === 504) return new FoodSearchError("timeout");
  return new FoodSearchError("provider-error");
}

export function createFoodSearchService(
  invoke: InvokeFoodSearch,
  isOnline: () => Promise<boolean> = async () => true,
  timeoutMs = 15000,
): FoodSearchService {
  async function request(body: FoodSearchRequest): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Include connectivity checks and session refresh in the finite client deadline.
      return await Promise.race([
        (async () => {
          if (!(await isOnline())) throw new FoodSearchError("offline");
          if (controller.signal.aborted) throw new FoodSearchError("timeout");
          const { data, error } = await invoke(body, controller.signal);
          if (error) throw classifyError(error);
          return data;
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new FoodSearchError("timeout")); }, timeoutMs);
        }),
      ]);
    } catch (error) {
      throw error instanceof FoodSearchError ? error : new FoodSearchError("provider-error");
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async search(input) {
      const query = input.trim();
      if (query.length < 2 || query.length > 120) throw new FoodSearchError("invalid-query");
      const data = await request({ action: "search", query, pageSize: 10 });
      if (typeof data !== "object" || data === null || !("results" in data) ||
        !Array.isArray(data.results) || data.results.length > 10) throw new FoodSearchError("provider-error");
      const results = data.results.map(validateTransportFood);
      if (results.some((food) => food === null)) throw new FoodSearchError("provider-error");
      return results as FoodSearchResult[];
    },
    async detail(externalId) {
      const fdcId = Number(externalId);
      if (!/^\d+$/.test(externalId) || !Number.isSafeInteger(fdcId) || fdcId <= 0) throw new FoodSearchError("provider-error");
      const data = await request({ action: "detail", fdcId });
      const result = typeof data === "object" && data !== null && "result" in data ? validateTransportFood(data.result) : null;
      if (!result || Number(result.externalId) !== fdcId) throw new FoodSearchError("provider-error");
      return result;
    },
  };
}
