export type FoodSearchAction =
  | { action: "search"; query: string; pageSize: number }
  | { action: "detail"; fdcId: number };

export type FunctionErrorCode =
  | "unauthorized"
  | "invalid_json"
  | "invalid_request"
  | "method_not_allowed"
  | "origin_not_allowed"
  | "food_search_not_configured"
  | "food_provider_rate_limited"
  | "food_provider_timeout"
  | "food_provider_error";

export class UsdaClientError extends Error {
  readonly kind: "configuration" | "rate-limit" | "timeout" | "provider";
  readonly retryAfter?: string;

  constructor(kind: UsdaClientError["kind"], retryAfter?: string) {
    super(kind);
    this.name = "UsdaClientError";
    this.kind = kind;
    if (retryAfter !== undefined) {
      this.retryAfter = retryAfter;
    }
  }
}
