import type { FoodSearchAction } from "./types.ts";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 25;

export type ValidationResult =
  | { ok: true; value: FoodSearchAction }
  | { ok: false; reason: string };

// Common GTIN lengths: EAN-8, UPC-A, EAN-13 and GTIN-14. Keep strings intact.
export function isProductCode(value: unknown): value is string {
  return typeof value === "string" && [8, 12, 13, 14].includes(value.length) && !/[^0-9]/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split(".");
  if (
    segments.length !== 3 ||
    segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))
  ) {
    return null;
  }

  try {
    const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0),
    );
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function hasAuthenticatedUserBearer(
  authorization: string | null,
): boolean {
  if (authorization === null) {
    return false;
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  if (!match) {
    return false;
  }

  // Signature and expiry validation are enforced by the Supabase gateway.
  // Keep verify_jwt enabled; decoding here only excludes non-user credentials.
  const claims = decodeJwtPayload(match[1]);
  return (
    claims?.role === "authenticated" &&
    typeof claims.sub === "string" &&
    claims.sub.trim().length > 0
  );
}

export function validateFoodSearchRequest(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return { ok: false, reason: "invalid_request" };
  }

  const provider = input.provider ?? "usda";
  if (input.provider === null || (provider !== "usda" && provider !== "open-food-facts")) {
    return { ok: false, reason: "invalid_provider" };
  }

  if (input.action === "search") {
    if (typeof input.query !== "string" || /[\u0000-\u001f\u007f-\u009f]/.test(input.query)) {
      return { ok: false, reason: "invalid_query" };
    }

    const query = input.query.trim();
    if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
      return { ok: false, reason: "invalid_query" };
    }

    let pageSize = DEFAULT_PAGE_SIZE;
    if (input.pageSize !== undefined) {
      if (
        typeof input.pageSize !== "number" ||
        !Number.isSafeInteger(input.pageSize) ||
        input.pageSize < 1
      ) {
        return { ok: false, reason: "invalid_page_size" };
      }
      pageSize = Math.min(input.pageSize, provider === "open-food-facts" ? 10 : MAX_PAGE_SIZE);
    }

    return {
      ok: true,
      value: provider === "open-food-facts"
        ? { provider, action: "search", query, pageSize }
        : { action: "search", query, pageSize },
    };
  }

  if (provider === "open-food-facts") {
    if (input.action === "detail" && isProductCode(input.externalId)) {
      return { ok: true, value: { provider, action: "detail", externalId: input.externalId } };
    }
    if (input.action === "barcode" && isProductCode(input.barcode)) {
      return { ok: true, value: { provider, action: "barcode", barcode: input.barcode } };
    }
    return { ok: false, reason: "invalid_action_or_code" };
  }

  if (input.action === "detail") {
    if (
      typeof input.fdcId !== "number" ||
      !Number.isSafeInteger(input.fdcId) ||
      input.fdcId <= 0
    ) {
      return { ok: false, reason: "invalid_fdc_id" };
    }

    return { ok: true, value: { action: "detail", fdcId: input.fdcId } };
  }

  return { ok: false, reason: "invalid_action" };
}

export function parseJsonRequestBody(
  body: string,
  maxBytes = 8_192,
): { ok: true; value: unknown } | { ok: false } {
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    return { ok: false };
  }

  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false };
  }
}
