import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { UsdaClientError } from "../types.ts";
import { createUsdaClient, sanitizeRetryAfter } from "../usdaClient.ts";

const TEST_API_KEY = "fixture-key-not-a-real-credential";

describe("USDA client", () => {
  test("posts bounded search fields to the official search endpoint", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const client = createUsdaClient({
      apiKey: TEST_API_KEY,
      fetchImpl: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return Response.json({ foods: [] });
      },
    });

    await client.search("chicken", 12);

    const url = new URL(requestUrl);
    assert.equal(url.origin, "https://api.nal.usda.gov");
    assert.equal(url.pathname, "/fdc/v1/foods/search");
    assert.equal(url.searchParams.get("api_key"), TEST_API_KEY);
    assert.equal(requestInit?.method, "POST");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      query: "chicken",
      pageSize: 12,
      pageNumber: 1,
    });
  });

  test("requests a detail by positive numeric FDC ID", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const client = createUsdaClient({
      apiKey: TEST_API_KEY,
      fetchImpl: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return Response.json({ fdcId: 123 });
      },
    });

    await client.detail(123);

    const url = new URL(requestUrl);
    assert.equal(url.pathname, "/fdc/v1/food/123");
    assert.equal(requestInit?.method, "GET");
    assert.equal(requestInit?.body, undefined);
  });

  test("fails safely when no server-side API key is supplied", async () => {
    const client = createUsdaClient({ apiKey: "" });

    await assert.rejects(client.search("rice", 10), (error: unknown) => {
      assert.ok(error instanceof UsdaClientError);
      assert.equal(error.kind, "configuration");
      assert.equal(error.message.includes(TEST_API_KEY), false);
      return true;
    });
  });

  test("maps aborts to a timeout and clears the timer", async () => {
    let timerCleared = false;
    const client = createUsdaClient({
      apiKey: TEST_API_KEY,
      timeoutMs: 1,
      setTimeoutFn: ((callback: TimerHandler) => {
        if (typeof callback === "function") callback();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout,
      clearTimeoutFn: (() => {
        timerCleared = true;
      }) as typeof clearTimeout,
      fetchImpl: async (_input, init) => {
        if (init?.signal?.aborted) {
          throw new DOMException("aborted", "AbortError");
        }
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      },
    });

    await assert.rejects(client.search("rice", 10), (error: unknown) => {
      assert.ok(error instanceof UsdaClientError);
      assert.equal(error.kind, "timeout");
      return true;
    });
    assert.equal(timerCleared, true);
  });

  test("maps rate limits and preserves only a sanitized Retry-After", async () => {
    const client = createUsdaClient({
      apiKey: TEST_API_KEY,
      fetchImpl: async () =>
        new Response("private upstream details", {
          status: 429,
          headers: { "Retry-After": "42" },
        }),
    });

    await assert.rejects(client.search("rice", 10), (error: unknown) => {
      assert.ok(error instanceof UsdaClientError);
      assert.equal(error.kind, "rate-limit");
      assert.equal(error.retryAfter, "42");
      assert.equal(error.message.includes(TEST_API_KEY), false);
      return true;
    });
  });

  test("sanitizes retry seconds and HTTP dates", () => {
    assert.equal(sanitizeRetryAfter("75", 0), "75");
    assert.equal(sanitizeRetryAfter("999999", 0), "3600");
    assert.equal(sanitizeRetryAfter("not a header", 0), undefined);
    assert.equal(sanitizeRetryAfter("-1", 0), undefined);
    assert.equal(sanitizeRetryAfter("1.5", 0), undefined);
    assert.equal(sanitizeRetryAfter(null, 0), undefined);
    assert.equal(sanitizeRetryAfter("Thu, 01 Jan 1970 00:01:00 GMT", 0), "60");
  });

  test("maps other provider failures without exposing their body", async () => {
    const privateBody = "upstream echoed a secret-like value";
    const client = createUsdaClient({
      apiKey: TEST_API_KEY,
      fetchImpl: async () => new Response(privateBody, { status: 503 }),
    });

    await assert.rejects(client.detail(1), (error: unknown) => {
      assert.ok(error instanceof UsdaClientError);
      assert.equal(error.kind, "provider");
      assert.equal(error.message.includes(privateBody), false);
      assert.equal(error.message.includes(TEST_API_KEY), false);
      return true;
    });
  });

  test("rejects malformed and oversized successful responses safely", async () => {
    const malformed = createUsdaClient({
      apiKey: TEST_API_KEY,
      fetchImpl: async () => new Response("not-json"),
    });
    const oversized = createUsdaClient({
      apiKey: TEST_API_KEY,
      fetchImpl: async () => new Response(JSON.stringify({ payload: "x".repeat(1_000_001) })),
    });

    for (const client of [malformed, oversized]) {
      await assert.rejects(client.search("rice", 10), (error: unknown) => {
        assert.ok(error instanceof UsdaClientError);
        assert.equal(error.kind, "provider");
        assert.equal(error.message.includes(TEST_API_KEY), false);
        return true;
      });
    }
  });
});

test("clears timeout after success and never forwards authorization", async () => {
  let cleared = 0;
  const client = createUsdaClient({
    apiKey: TEST_API_KEY,
    clearTimeoutFn: ((timer: ReturnType<typeof setTimeout>) => { cleared++; clearTimeout(timer); }) as typeof clearTimeout,
    fetchImpl: async (_input, init) => {
      assert.equal(new Headers(init?.headers).get("authorization"), null);
      assert.equal(init?.redirect, "error");
      return Response.json({ foods: [] });
    },
  });
  await client.search("rice", 10);
  assert.equal(cleared, 1);
});

test("does not retry network failures or expose thrown URLs", async () => {
  let calls = 0;
  const client = createUsdaClient({ apiKey: TEST_API_KEY, fetchImpl: async (input) => {
    calls++;
    throw new Error(String(input));
  } });
  await assert.rejects(client.detail(1), (error: unknown) => {
    assert.ok(error instanceof UsdaClientError);
    assert.equal(error.kind, "provider");
    assert.equal(error.message.includes(TEST_API_KEY), false);
    assert.equal(error.message.includes("https://"), false);
    return true;
  });
  assert.equal(calls, 1);
});
