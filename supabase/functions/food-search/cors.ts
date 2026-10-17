const ALLOWED_ORIGINS = new Set([
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "https://caloribite.com",
]);

export function isAllowedFoodSearchOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin);
}

export function foodSearchCorsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "600",
    "Access-Control-Expose-Headers": "Retry-After",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };

  if (origin && isAllowedFoodSearchOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}
