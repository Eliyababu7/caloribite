export type UsdaFoodSearchAction =
  | { action: "search"; query: string; pageSize: number }
  | { action: "detail"; fdcId: number };

export type OpenFoodFactsAction =
  | { provider: "open-food-facts"; action: "search"; query: string; pageSize: number }
  | { provider: "open-food-facts"; action: "detail"; externalId: string }
  | { provider: "open-food-facts"; action: "barcode"; barcode: string };

export type FoodSearchAction =
  | (UsdaFoodSearchAction & { provider?: "usda" })
  | OpenFoodFactsAction;

export type FunctionErrorCode =
  | "unauthorized"
  | "invalid_json"
  | "invalid_request"
  | "method_not_allowed"
  | "origin_not_allowed"
  | "food_search_not_configured"
  | "food_provider_rate_limited"
  | "food_provider_timeout"
  | "food_provider_error"
  | "food_provider_unavailable"
  | "food_not_found";

export class FoodProviderError extends Error {
  readonly kind: "configuration" | "rate-limit" | "timeout" | "provider" | "unavailable" | "not-found";
  readonly retryAfter?: string;

  constructor(kind: FoodProviderError["kind"], retryAfter?: string) {
    super(kind);
    this.name = "FoodProviderError";
    this.kind = kind;
    if (retryAfter !== undefined) {
      this.retryAfter = retryAfter;
    }
  }
}

// Retain the USDA error API for its existing client and tests.
export class UsdaClientError extends FoodProviderError {
  constructor(kind: "configuration" | "rate-limit" | "timeout" | "provider", retryAfter?: string) {
    super(kind, retryAfter);
    this.name = "UsdaClientError";
  }
}
