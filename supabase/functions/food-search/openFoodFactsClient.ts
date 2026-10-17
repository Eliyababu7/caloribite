import { readBoundedText } from "./readBoundedText.ts";
import { sanitizeRetryAfter } from "./retryAfter.ts";
import { FoodProviderError } from "./types.ts";
import { isProductCode, validateFoodSearchRequest } from "./validation.ts";

const ORIGIN = "https://world.openfoodfacts.org";
const USER_AGENT = "CaloriBite/1.0 (https://caloriebite.com)";
const MAX_RESPONSE_BYTES = 1_000_000;
const PRODUCT_NOT_FOUND = Symbol("product-not-found");
const FIELDS = [
  "code", "product_name", "product_name_en", "brands",
  ...["energy-kcal", "proteins", "carbohydrates", "fat"].flatMap((nutrient) =>
    ["100g", "serving", "modifier"].map((suffix) => `nutriments.${nutrient}_${suffix}`)),
  "nutriments.energy-kcal_unit", "serving_size", "serving_quantity",
  "serving_quantity_unit", "product_quantity_unit", "nutrition_data_per", "no_nutrition_data",
].join(",");

export type OpenFoodFactsClientOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createOpenFoodFactsClient(options: OpenFoodFactsClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimeoutFn ?? setTimeout;
  const clearTimer = options.clearTimeoutFn ?? clearTimeout;

  async function request(url: URL, productRead = false): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimer(() => controller.abort(), options.timeoutMs ?? 10_000);
    try {
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: controller.signal,
        redirect: "error",
      });
      if (response.status === 429 || response.status === 503) {
        throw new FoodProviderError(
          response.status === 429 ? "rate-limit" : "unavailable",
          sanitizeRetryAfter(response.headers.get("retry-after"), now()),
        );
      }
      if (response.status === 404 && productRead) return PRODUCT_NOT_FOUND;
      if (!response.ok) throw new FoodProviderError("provider");
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new FoodProviderError("provider");
      }
      const body = await readBoundedText(response, MAX_RESPONSE_BYTES);
      return JSON.parse(body) as unknown;
    } catch (error) {
      if (error instanceof FoodProviderError) throw error;
      if (controller.signal.aborted || (record(error) && error.name === "AbortError")) {
        throw new FoodProviderError("timeout");
      }
      throw new FoodProviderError("provider");
    } finally {
      controller.abort();
      clearTimer(timer);
    }
  }

  return {
    async search(query: string, pageSize = 10): Promise<unknown[]> {
      const checked = validateFoodSearchRequest({ provider: "open-food-facts", action: "search", query, pageSize });
      if (!checked.ok || checked.value.action !== "search") throw new FoodProviderError("provider");
      const url = new URL("/cgi/search.pl", ORIGIN);
      url.search = new URLSearchParams({
        search_terms: checked.value.query,
        search_simple: "1", action: "process", json: "1",
        page: "1", page_size: String(checked.value.pageSize), fields: FIELDS,
      }).toString();
      const data = await request(url);
      if (!record(data) || !Array.isArray(data.products)) throw new FoodProviderError("provider");
      return data.products.slice(0, checked.value.pageSize);
    },
    async detail(code: string): Promise<unknown | null> {
      if (!isProductCode(code)) throw new FoodProviderError("provider");
      // v2 retains the documented nutriments schema used by v1 text search.
      // See README.md for the v3 compatibility decision; no runtime fallback/retry.
      const url = new URL(`/api/v2/product/${code}`, ORIGIN);
      url.searchParams.set("fields", FIELDS);
      const data = await request(url, true);
      if (data === PRODUCT_NOT_FOUND) return null;
      if (!record(data)) throw new FoodProviderError("provider");
      if (data.status === 0) return null;
      if (data.status !== 1 || !record(data.product) || data.product.code !== code) {
        throw new FoodProviderError("provider");
      }
      return data.product;
    },
  };
}
