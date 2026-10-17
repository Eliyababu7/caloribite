import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenFoodFactsClient } from "../openFoodFactsClient.ts";
import { FoodProviderError } from "../types.ts";
import { openFoodFactsProduct, PRODUCT_CODE } from "./openFoodFactsFixtures.ts";

const kind = (expected: FoodProviderError["kind"]) => (error: unknown) => error instanceof FoodProviderError && error.kind === expected;

test("OFF search uses v1 text route, encoded parameters, exact User-Agent and minimal fields", async () => {
  let calls = 0;
  const client = createOpenFoodFactsClient({ fetchImpl: async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://world.openfoodfacts.org");
    assert.equal(url.pathname, "/cgi/search.pl");
    assert.equal(url.searchParams.get("search_terms"), "oat & milk+chocolate");
    assert.equal(url.searchParams.get("page"), "1");
    assert.equal(url.searchParams.get("page_size"), "10");
    assert.equal(url.searchParams.get("search_simple"), "1");
    assert.equal(url.searchParams.get("action"), "process");
    assert.equal(url.searchParams.get("json"), "1");
    const fields = url.searchParams.get("fields")!.split(",");
    assert.ok(fields.includes("nutriments.energy-kcal_100g"));
    assert.ok(fields.includes("serving_quantity_unit"));
    assert.equal(fields.some((field) => /image|creator|quantity$/.test(field) && field !== "serving_quantity"), false);
    assert.equal(url.searchParams.has("api_key"), false);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("User-Agent"), "CaloriBite/1.0 (https://caloriebite.com)");
    assert.equal(headers.get("Authorization"), null);
    assert.equal(headers.get("apikey"), null);
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    return Response.json({ products: [openFoodFactsProduct()] });
  } });
  assert.equal((await client.search("  oat & milk+chocolate  ", 100)).length, 1);
  assert.equal(calls, 1);
});

test("product detail uses the documented v2 endpoint and preserves leading zeroes", async () => {
  let calls = 0;
  const client = createOpenFoodFactsClient({ fetchImpl: async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://world.openfoodfacts.org");
    assert.equal(url.pathname, `/api/v2/product/${PRODUCT_CODE}`);
    assert.ok(url.searchParams.has("fields"));
    return Response.json({ status: 1, product: openFoodFactsProduct() });
  } });
  assert.deepEqual(await client.detail(PRODUCT_CODE), openFoodFactsProduct());
  assert.equal(calls, 1);
});

test("invalid direct-client inputs cause no upstream requests", async () => {
  let calls = 0;
  const client = createOpenFoodFactsClient({ fetchImpl: async () => { calls++; return Response.json({}); } });
  for (const code of ["bad", "12345678\n", "1".repeat(15)]) await assert.rejects(client.detail(code), kind("provider"));
  for (const [query, pageSize] of [["x", 10], ["oats\n", 10], ["oats", 0], ["oats", 1.5]] as const) await assert.rejects(client.search(query, pageSize), kind("provider"));
  assert.equal(calls, 0);
});

test("OFF search bounds returned products even when upstream ignores page_size", async () => {
  const client = createOpenFoodFactsClient({ fetchImpl: async () => Response.json({ products: Array.from({ length: 20 }, openFoodFactsProduct) }) });
  assert.equal((await client.search("oats", 5)).length, 5);
  assert.equal((await client.search("oats", 100)).length, 10);
});

test("not-found envelopes and HTTP 404 produce a safe null product", async () => {
  for (const response of [Response.json({ status: 0, status_verbose: "private provider text" }), new Response("private provider text", { status: 404 })]) {
    const client = createOpenFoodFactsClient({ fetchImpl: async () => response });
    assert.equal(await client.detail(PRODUCT_CODE), null);
  }
});

test("malformed search and detail responses and mismatched codes are rejected", async () => {
  for (const data of [null, {}, { products: "bad" }]) {
    const client = createOpenFoodFactsClient({ fetchImpl: async () => Response.json(data) });
    await assert.rejects(client.search("oats"), kind("provider"));
  }
  for (const data of [null, {}, { status: 1 }, { status: "success", product: openFoodFactsProduct() }, { status: 1, product: { ...openFoodFactsProduct(), code: "12345678" } }]) {
    const client = createOpenFoodFactsClient({ fetchImpl: async () => Response.json(data) });
    await assert.rejects(client.detail(PRODUCT_CODE), kind("provider"));
  }
});

for (const [status, expectedKind] of [[429, "rate-limit"], [503, "unavailable"], [500, "provider"], [302, "provider"], [401, "provider"]] as const) {
  test(`OFF HTTP ${status} is safely mapped with no automatic retry`, async () => {
    let calls = 0;
    const client = createOpenFoodFactsClient({ fetchImpl: async () => { calls++; return new Response("private upstream body", { status, headers: { "Retry-After": "45" } }); } });
    await assert.rejects(client.search("oats"), (error: unknown) => {
      assert.ok(error instanceof FoodProviderError);
      assert.equal(error.kind, expectedKind);
      assert.equal(error.message.includes("private"), false);
      assert.equal(error.retryAfter, status === 429 || status === 503 ? "45" : undefined);
      return true;
    });
    assert.equal(calls, 1);
  });
}

test("OFF rate-limit and unavailable errors sanitize Retry-After values", async () => {
  for (const [header, expected] of [["-1", undefined], ["1.5", undefined], ["not-a-date", undefined], ["999999", "3600"], ["Thu, 01 Jan 1970 00:01:00 GMT", "60"]]) {
    const client = createOpenFoodFactsClient({ now: () => 0, fetchImpl: async () => new Response("", { status: 503, headers: { "Retry-After": header! } }) });
    await assert.rejects(client.detail(PRODUCT_CODE), (error: unknown) => error instanceof FoodProviderError && error.retryAfter === expected);
  }
});

test("OFF JSON parsing and bounded reading reject malformed and oversized bodies", async () => {
  for (const response of [new Response("not-json private text"), new Response("", { headers: { "Content-Length": "1000001" } }), new Response(JSON.stringify({ products: [], padding: "x".repeat(1_000_001) }))]) {
    const client = createOpenFoodFactsClient({ fetchImpl: async () => response });
    await assert.rejects(client.search("oats"), kind("provider"));
  }
});

test("OFF streaming limit cancels chunked responses before further reads", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(1_000_001)); },
    cancel() { cancelled = true; },
  });
  const client = createOpenFoodFactsClient({ fetchImpl: async () => new Response(body) });
  await assert.rejects(client.search("oats"), kind("provider"));
  assert.equal(cancelled, true);
});

test("OFF ten-second timeout aborts and clears its timer deterministically", async () => {
  let expire!: () => void;
  let cleared = false;
  const client = createOpenFoodFactsClient({
    setTimeoutFn: ((callback: () => void, delay: number) => { assert.equal(delay, 10000); expire = callback; return 1; }) as unknown as typeof setTimeout,
    clearTimeoutFn: (() => { cleared = true; }) as typeof clearTimeout,
    fetchImpl: async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("private URL", "AbortError")));
      expire();
    }),
  });
  await assert.rejects(client.detail(PRODUCT_CODE), kind("timeout"));
  assert.equal(cleared, true);
});

test("OFF timeout also covers body reading after response headers", async () => {
  let expire!: () => void;
  const client = createOpenFoodFactsClient({
    setTimeoutFn: ((callback: () => void) => { expire = callback; return 1; }) as unknown as typeof setTimeout,
    clearTimeoutFn: (() => {}) as typeof clearTimeout,
    fetchImpl: async (_input, init) => {
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("private", "AbortError")));
      } });
      queueMicrotask(expire);
      return new Response(body);
    },
  });
  await assert.rejects(client.search("oats"), kind("timeout"));
});

test("OFF clears the timer on success and sanitizes thrown fetch exceptions", async () => {
  let cleared = 0;
  const clear = ((timer: ReturnType<typeof setTimeout>) => { cleared++; clearTimeout(timer); }) as typeof clearTimeout;
  const client = createOpenFoodFactsClient({ clearTimeoutFn: clear, fetchImpl: async () => Response.json({ products: [] }) });
  await client.search("oats");
  assert.equal(cleared, 1);
  const failed = createOpenFoodFactsClient({ clearTimeoutFn: clear, fetchImpl: async (input) => { throw new Error(`private header ${String(input)}`); } });
  await assert.rejects(failed.detail(PRODUCT_CODE), (error: unknown) => error instanceof FoodProviderError && error.message === "provider");
  assert.equal(cleared, 2);
});
