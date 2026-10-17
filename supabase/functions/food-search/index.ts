import { readBoundedText } from "./readBoundedText.ts";
import { foodSearchCorsHeaders, isAllowedFoodSearchOrigin } from "./cors.ts";
import { normalizeUsdaFood } from "./normalizeUsdaFood.ts";
import { UsdaClientError, type FunctionErrorCode } from "./types.ts";
import { createUsdaClient } from "./usdaClient.ts";
import {
  hasAuthenticatedUserBearer,
  parseJsonRequestBody,
  validateFoodSearchRequest,
} from "./validation.ts";

const MAX_REQUEST_BYTES = 8_192;

type DenoRuntime = {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

export type FoodSearchHandlerDependencies = {
  getApiKey: () => string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

function jsonResponse(
  status: number,
  body: unknown,
  origin: string | null,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...foodSearchCorsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function errorResponse(
  status: number,
  code: FunctionErrorCode,
  origin: string | null,
  retryAfter?: string,
): Response {
  return jsonResponse(
    status,
    { error: code },
    origin,
    retryAfter ? { "Retry-After": retryAfter } : {},
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createFoodSearchHandler(
  dependencies: FoodSearchHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");

    if (origin && !isAllowedFoodSearchOrigin(origin)) {
      return errorResponse(403, "origin_not_allowed", null);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: foodSearchCorsHeaders(origin),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(405, { error: "method_not_allowed" }, origin, { Allow: "POST, OPTIONS" });
    }

    if (!hasAuthenticatedUserBearer(request.headers.get("authorization"))) {
      return errorResponse(401, "unauthorized", origin);
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength !== null) {
      const reportedLength = Number(contentLength);
      if (
        Number.isFinite(reportedLength) &&
        reportedLength > MAX_REQUEST_BYTES
      ) {
        return errorResponse(400, "invalid_json", origin);
      }
    }

    let bodyText: string;
    try {
      bodyText = await readBoundedText(request, MAX_REQUEST_BYTES);
    } catch {
      return errorResponse(400, "invalid_json", origin);
    }

    const parsedBody = parseJsonRequestBody(bodyText, MAX_REQUEST_BYTES);
    if (!parsedBody.ok) {
      return errorResponse(400, "invalid_json", origin);
    }

    const validation = validateFoodSearchRequest(parsedBody.value);
    if (!validation.ok) {
      return errorResponse(400, "invalid_request", origin);
    }

    const apiKey = dependencies.getApiKey();
    if (!apiKey || apiKey.trim().length === 0) {
      return errorResponse(503, "food_search_not_configured", origin);
    }

    const client = createUsdaClient({
      apiKey,
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
      ...(dependencies.timeoutMs !== undefined
        ? { timeoutMs: dependencies.timeoutMs }
        : {}),
      ...(dependencies.now ? { now: dependencies.now } : {}),
      ...(dependencies.setTimeoutFn
        ? { setTimeoutFn: dependencies.setTimeoutFn }
        : {}),
      ...(dependencies.clearTimeoutFn
        ? { clearTimeoutFn: dependencies.clearTimeoutFn }
        : {}),
    });

    try {
      if (validation.value.action === "search") {
        const upstream = await client.search(
          validation.value.query,
          validation.value.pageSize,
        );
        if (!isRecord(upstream) || !Array.isArray(upstream.foods)) {
          return errorResponse(502, "food_provider_error", origin);
        }

        const results = upstream.foods
          .map(normalizeUsdaFood)
          .filter((food) => food !== null)
          .slice(0, validation.value.pageSize);
        return jsonResponse(200, { results }, origin);
      }

      const upstream = await client.detail(validation.value.fdcId);
      const result = normalizeUsdaFood(upstream);
      if (!result) {
        return errorResponse(502, "food_provider_error", origin);
      }
      return jsonResponse(200, { result }, origin);
    } catch (error) {
      if (!(error instanceof UsdaClientError)) {
        return errorResponse(502, "food_provider_error", origin);
      }

      switch (error.kind) {
        case "configuration":
          return errorResponse(503, "food_search_not_configured", origin);
        case "rate-limit":
          return errorResponse(
            429,
            "food_provider_rate_limited",
            origin,
            error.retryAfter,
          );
        case "timeout":
          return errorResponse(504, "food_provider_timeout", origin);
        case "provider":
          return errorResponse(502, "food_provider_error", origin);
      }
    }
  };
}

const Deno = (globalThis as unknown as { Deno?: DenoRuntime }).Deno;
if (Deno) {
  Deno.serve(
    createFoodSearchHandler({
      getApiKey: () => Deno.env.get("USDA_FDC_API_KEY"),
    }),
  );
}
