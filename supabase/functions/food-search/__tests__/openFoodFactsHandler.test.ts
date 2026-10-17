import assert from "node:assert/strict";
import { test } from "node:test";
import { createFoodSearchHandler } from "../index.ts";
import { openFoodFactsProduct, PRODUCT_CODE } from "./openFoodFactsFixtures.ts";

function request(body: unknown, role = "authenticated") {
  const claims = btoa(JSON.stringify({ role, sub: "synthetic-user" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return new Request("https://function.example/food-search", {
    method: "POST", headers: { Authorization: `Bearer e30.${claims}.signature`, Origin: "https://caloribite.com", "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
function forbiddenKeyRead(): never { throw new Error("OFF must not access the USDA credential"); }

test("OFF search routes without reading the USDA key and whitelists bounded results", async () => {
  let calls = 0;
  const handler = createFoodSearchHandler({ getApiKey: forbiddenKeyRead, fetchImpl: async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://world.openfoodfacts.org");
    assert.equal(url.searchParams.get("page"), "1");
    assert.equal(url.searchParams.get("page_size"), "10");
    assert.equal(url.searchParams.has("url"), false);
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    return Response.json({ products: [openFoodFactsProduct(), openFoodFactsProduct(), { code: PRODUCT_CODE, product_name: "" }, null] });
  } });
  const response = await handler(request({ provider: "open-food-facts", action: "search", query: "oats", pageSize: 100, page: 99, url: "https://attacker.example" }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].source, "open-food-facts");
  assert.equal(data.results[0].barcode, PRODUCT_CODE);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), "https://caloribite.com");
  assert.equal(calls, 1);
});

for (const action of ["detail", "barcode"] as const) {
  test(`OFF ${action} makes one product read and returns the normalized result envelope`, async () => {
    let calls = 0;
    const handler = createFoodSearchHandler({ getApiKey: forbiddenKeyRead, fetchImpl: async (input) => {
      calls++;
      assert.equal(new URL(String(input)).pathname, `/api/v2/product/${PRODUCT_CODE}`);
      return Response.json({ status: 1, product: openFoodFactsProduct() });
    } });
    const response = await handler(request({ provider: "open-food-facts", action, ...(action === "detail" ? { externalId: PRODUCT_CODE } : { barcode: PRODUCT_CODE }) }));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.result.externalId, PRODUCT_CODE);
    assert.equal(data.result.barcode, PRODUCT_CODE);
    assert.deepEqual(data.result.nutritionPer100g, { calories: 165, protein: 5, carbs: 25, fat: 0 });
    assert.equal(calls, 1);
  });
}

test("OFF operations still reject anonymous, missing and publishable credentials", async () => {
  let calls = 0;
  const handler = createFoodSearchHandler({ getApiKey: forbiddenKeyRead, fetchImpl: async () => { calls++; return Response.json({}); } });
  for (const action of ["search", "detail", "barcode"]) {
    for (const authorization of [null, "Bearer sb_publishable_fixture", "Basic invalid", "anon"]) {
      const req = request({ provider: "open-food-facts", action }, "anon");
      if (authorization === null) req.headers.delete("authorization");
      else if (authorization !== "anon") req.headers.set("authorization", authorization);
      const response = await handler(req);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "unauthorized" });
    }
  }
  assert.equal(calls, 0);
});

test("OFF invalid provider, query, page size and code fail before any provider call", async () => {
  let calls = 0;
  const handler = createFoodSearchHandler({ getApiKey: forbiddenKeyRead, fetchImpl: async () => { calls++; return Response.json({}); } });
  for (const body of [
    { provider: "unsupported", action: "search", query: "oats" },
    { provider: "open-food-facts", action: "search", query: "x" },
    { provider: "open-food-facts", action: "search", query: "oats", pageSize: 0 },
    { provider: "open-food-facts", action: "detail", externalId: 12345678 },
    { provider: "open-food-facts", action: "barcode", barcode: "12345678\n" },
    { provider: "open-food-facts", action: "write", barcode: PRODUCT_CODE },
  ]) {
    const response = await handler(request(body));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_request" });
  }
  assert.equal(calls, 0);
});

test("OFF empty or nameless search products return an empty result list", async () => {
  for (const products of [[], [null, { code: PRODUCT_CODE }]]) {
    const handler = createFoodSearchHandler({ getApiKey: forbiddenKeyRead, fetchImpl: async () => Response.json({ products }) });
    const response = await handler(request({ provider: "open-food-facts", action: "search", query: "oats" }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { results: [] });
  }
});

test("OFF not-found responses return sanitized 404 and malformed products return 502", async () => {
  for (const [upstream, expected] of [[Response.json({ status: 0 }), 404], [new Response("private not found", { status: 404 }), 404], [Response.json({ status: 1, product: { code: PRODUCT_CODE } }), 502], [Response.json({ products: [] }), 502]] as const) {
    const handler = createFoodSearchHandler({ getApiKey: forbiddenKeyRead, fetchImpl: async () => upstream });
    const response = await handler(request({ provider: "open-food-facts", action: "barcode", barcode: PRODUCT_CODE }));
    assert.equal(response.status, expected);
    assert.deepEqual(await response.json(), { error: expected === 404 ? "food_not_found" : "food_provider_error" });
  }
});

for (const [status, expectedError] of [[429, "food_provider_rate_limited"], [503, "food_provider_unavailable"], [502, "food_provider_error"]] as const) {
  test(`OFF handler maps ${status} without leaking headers or upstream body`, async () => {
    const handler = createFoodSearchHandler({ getApiKey: forbiddenKeyRead, fetchImpl: async () => new Response("private upstream internals", { status, headers: { "Retry-After": "99", "X-Private": "private" } }) });
    const response = await handler(request({ provider: "open-food-facts", action: "search", query: "oats" }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: expectedError });
    assert.equal(response.headers.get("X-Private"), null);
    assert.equal(response.headers.get("Retry-After"), status === 502 ? null : "99");
  });
}

test("OFF handler returns a safe timeout and preserves CORS and HTTP restrictions", async () => {
  const handler = createFoodSearchHandler({ getApiKey: forbiddenKeyRead, fetchImpl: async () => { throw new DOMException("private stack", "AbortError"); } });
  const response = await handler(request({ provider: "open-food-facts", action: "barcode", barcode: PRODUCT_CODE }));
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: "food_provider_timeout" });
  const blocked = request({ provider: "open-food-facts", action: "search", query: "oats" });
  blocked.headers.set("Origin", "https://attacker.example");
  assert.equal((await handler(blocked)).status, 403);
  assert.equal((await handler(new Request(blocked.url, { method: "GET" }))).status, 405);
  assert.equal((await handler(new Request(blocked.url, { method: "OPTIONS", headers: { Origin: "http://localhost:8081" } }))).status, 204);
});

test("OFF malformed JSON and upstream exceptions remain sanitized", async () => {
  for (const fetchImpl of [async () => new Response("private malformed JSON"), async () => { throw new Error("private request headers and internal URL"); }]) {
    const handler = createFoodSearchHandler({ getApiKey: forbiddenKeyRead, fetchImpl });
    const response = await handler(request({ provider: "open-food-facts", action: "search", query: "oats" }));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "food_provider_error" });
  }
});

test("explicit USDA and omitted provider still use USDA with identical response envelopes", async () => {
  for (const provider of [undefined, "usda"]) {
    let calls = 0;
    const handler = createFoodSearchHandler({ getApiKey: () => "fixture-only", fetchImpl: async (input) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.origin, "https://api.nal.usda.gov");
      assert.equal(url.pathname, "/fdc/v1/foods/search");
      return Response.json({ foods: [{ fdcId: 123, description: "Synthetic rice", dataType: "Foundation" }] });
    } });
    const response = await handler(request({ provider, action: "search", query: "rice" }));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.results[0].source, "usda");
    assert.equal(data.results[0].externalId, "123");
    assert.equal(calls, 1);
  }
});
