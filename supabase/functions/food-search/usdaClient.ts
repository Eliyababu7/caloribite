import { sanitizeRetryAfter } from "./retryAfter.ts";
import { readBoundedText } from "./readBoundedText.ts";
import { UsdaClientError } from "./types.ts";

export { sanitizeRetryAfter } from "./retryAfter.ts";

const DEFAULT_BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;

export type UsdaClient = {
  search: (query: string, pageSize: number) => Promise<unknown>;
  detail: (fdcId: number) => Promise<unknown>;
};

export type UsdaClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export function createUsdaClient(options: UsdaClientOptions): UsdaClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;

  async function request(
    path: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!options.apiKey.trim()) {
      throw new UsdaClientError("configuration");
    }

    const url = new URL(`${DEFAULT_BASE_URL}${path}`);
    url.searchParams.set("api_key", options.apiKey);
    const controller = new AbortController();
    const timeout = setTimeoutFn(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url.toString(), {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
        redirect: "error",
      });

      if (response.status === 429) {
        throw new UsdaClientError(
          "rate-limit",
          sanitizeRetryAfter(response.headers.get("retry-after"), now()),
        );
      }
      if (!response.ok) {
        throw new UsdaClientError("provider");
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength !== null) {
        const reportedLength = Number(contentLength);
        if (
          Number.isFinite(reportedLength) &&
          reportedLength > MAX_RESPONSE_BYTES
        ) {
          throw new UsdaClientError("provider");
        }
      }

      const responseText = await readBoundedText(response, MAX_RESPONSE_BYTES);
      if (
        new TextEncoder().encode(responseText).byteLength > MAX_RESPONSE_BYTES
      ) {
        throw new UsdaClientError("provider");
      }

      try {
        return JSON.parse(responseText) as unknown;
      } catch {
        throw new UsdaClientError("provider");
      }
    } catch (error) {
      if (error instanceof UsdaClientError) {
        throw error;
      }
      if (controller.signal.aborted || isAbortError(error)) {
        throw new UsdaClientError("timeout");
      }
      throw new UsdaClientError("provider");
    } finally {
      controller.abort();
      clearTimeoutFn(timeout);
    }
  }

  return {
    search: (query: string, pageSize: number) =>
      request("/foods/search", "POST", {
        query,
        pageSize,
        pageNumber: 1,
      }),
    detail: (fdcId: number) => request(`/food/${fdcId}`, "GET"),
  };
}
