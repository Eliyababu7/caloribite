import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createFoodSearchHandler } from "../index.ts";

const API_KEY_FIXTURE = "fixture-only-not-a-real-api-key";
const allowedOrigin = "https://caloribite.com";

function userBearer(role = "authenticated"): string {
  const payload = btoa(JSON.stringify({ role, sub: "test-user" }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `Bearer e30.${payload}.signature`;
}

function postRequest(body: string, authorization = userBearer()): Request {
  return new Request("https://function.example/food-search", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      Origin: allowedOrigin,
    },
    body,
  });
}

describe("food-search function handler", () => {
  test("rejects missing, malformed, publishable, and anon bearer credentials", async () => {
    const handler = createFoodSearchHandler({
      getApiKey: () => API_KEY_FIXTURE,
    });

    for (const authorization of [
      null,
      "Basic credential",
      "Bearer sb_publishable_fixture",
      userBearer("anon"),
    ]) {
      const request = postRequest(
        JSON.stringify({ action: "search", query: "rice" }),
        authorization ?? "",
      );
      if (authorization === null) {
        request.headers.delete("authorization");
      }
      const response = await handler(request);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "unauthorized" });
    }
  });

  test("rejects malformed JSON without calling USDA", async () => {
    let fetchCalled = false;
    const handler = createFoodSearchHandler({
      getApiKey: () => API_KEY_FIXTURE,
      fetchImpl: async () => {
        fetchCalled = true;
        return Response.json({});
      },
    });

    const response = await handler(postRequest("{"));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_json" });
    assert.equal(fetchCalled, false);
  });

  test("rejects unsupported methods and actions safely", async () => {
    const handler = createFoodSearchHandler({
      getApiKey: () => API_KEY_FIXTURE,
    });
    const getResponse = await handler(
      new Request("https://function.example/food-search", {
        method: "GET",
        headers: { Authorization: userBearer() },
      }),
    );
    const actionResponse = await handler(
      postRequest(JSON.stringify({ action: "delete" })),
    );

    assert.equal(getResponse.status, 405);
    assert.deepEqual(await getResponse.json(), { error: "method_not_allowed" });
    assert.equal(actionResponse.status, 400);
    assert.deepEqual(await actionResponse.json(), { error: "invalid_request" });
  });

  test("supports allowed browser preflight without requiring a user token", async () => {
    const handler = createFoodSearchHandler({ getApiKey: () => undefined });
    const response = await handler(
      new Request("https://function.example/food-search", {
        method: "OPTIONS",
        headers: { Origin: allowedOrigin },
      }),
    );

    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      allowedOrigin,
    );
    assert.equal(
      response.headers.get("Access-Control-Allow-Methods"),
      "POST, OPTIONS",
    );
  });

  test("does not reflect arbitrary browser origins", async () => {
    const handler = createFoodSearchHandler({ getApiKey: () => undefined });
    const response = await handler(
      new Request("https://function.example/food-search", {
        method: "OPTIONS",
        headers: { Origin: "https://attacker.example" },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  });

  test("returns a safe configuration error when the USDA key is absent", async () => {
    const handler = createFoodSearchHandler({ getApiKey: () => undefined });
    const response = await handler(
      postRequest(JSON.stringify({ action: "search", query: "rice" })),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "food_search_not_configured",
    });
  });

  test("normalizes search results and does not forward unknown input fields", async () => {
    let upstreamUrl = "";
    let upstreamBody: unknown;
    const handler = createFoodSearchHandler({
      getApiKey: () => API_KEY_FIXTURE,
      fetchImpl: async (input, init) => {
        upstreamUrl = String(input);
        upstreamBody = JSON.parse(String(init?.body));
        return Response.json({
          foods: [
            {
              fdcId: 100,
              dataType: "Foundation",
              description: "Rice",
              foodNutrients: [
                { nutrientId: 1008, unitName: "kcal", value: 130 },
                { nutrientId: 1003, unitName: "g", value: 2.7 },
                { nutrientId: 1005, unitName: "g", value: 28 },
                { nutrientId: 1004, unitName: "g", value: 0.3 },
              ],
            },
          ],
        });
      },
    });

    const response = await handler(
      postRequest(
        JSON.stringify({
          action: "search",
          query: "  rice  ",
          pageSize: 3,
          api_key: "attacker-controlled-value",
          other: "ignored",
        }),
      ),
    );
    const responseText = await response.text();

    assert.equal(response.status, 200);
    assert.deepEqual(upstreamBody, {
      query: "rice",
      pageSize: 3,
      pageNumber: 1,
    });
    assert.equal(new URL(upstreamUrl).origin, "https://api.nal.usda.gov");
    assert.equal(responseText.includes(API_KEY_FIXTURE), false);
    assert.equal(responseText.includes("attacker-controlled-value"), false);
    assert.deepEqual(JSON.parse(responseText).results[0], {
      source: "usda",
      externalId: "100",
      name: "Rice",
      nutritionPer100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
      servingOptions: [],
      attributionLabel: "FoodData Central, U.S. Department of Agriculture",
      sourceUrl: "https://fdc.nal.usda.gov/food-details/100/nutrients",
    });
  });

  test("returns safe errors without echoing API keys or provider bodies", async () => {
    const providerBody = `provider failure ${API_KEY_FIXTURE}`;
    const handler = createFoodSearchHandler({
      getApiKey: () => API_KEY_FIXTURE,
      fetchImpl: async () => new Response(providerBody, { status: 502 }),
    });
    const response = await handler(
      postRequest(JSON.stringify({ action: "detail", fdcId: 100 })),
    );
    const responseText = await response.text();

    assert.equal(response.status, 502);
    assert.deepEqual(JSON.parse(responseText), {
      error: "food_provider_error",
    });
    assert.equal(responseText.includes(API_KEY_FIXTURE), false);
    assert.equal(responseText.includes(providerBody), false);
  });

  test("maps upstream rate limits without exposing provider data", async () => {
    const handler = createFoodSearchHandler({
      getApiKey: () => API_KEY_FIXTURE,
      fetchImpl: async () =>
        new Response(API_KEY_FIXTURE, {
          status: 429,
          headers: { "Retry-After": "55" },
        }),
    });
    const response = await handler(
      postRequest(JSON.stringify({ action: "search", query: "rice" })),
    );
    const responseText = await response.text();

    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "55");
    assert.equal(responseText.includes(API_KEY_FIXTURE), false);
  });
});

test("supports native detail requests without Origin and localhost preflight", async () => {
  const handler = createFoodSearchHandler({
    getApiKey: () => API_KEY_FIXTURE,
    fetchImpl: async () => Response.json({ fdcId: 100, description: "Food", dataType: "Foundation" }),
  });
  const request = postRequest(JSON.stringify({ action: "detail", fdcId: 100 }));
  request.headers.delete("origin");
  const response = await handler(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).result.externalId, "100");
  for (const origin of ["http://localhost:8081", "http://127.0.0.1:8081"]) {
    const preflight = await handler(new Request(request.url, { method: "OPTIONS", headers: { Origin: origin } }));
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  }
});

test("maps timeout to 504 without exposing the upstream URL", async () => {
  const handler = createFoodSearchHandler({
    getApiKey: () => API_KEY_FIXTURE,
    fetchImpl: async () => { throw new DOMException("private URL", "AbortError"); },
  });
  const response = await handler(postRequest(JSON.stringify({ action: "detail", fdcId: 100 })));
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: "food_provider_timeout" });
});

test("rejects malformed provider shapes and oversized request bodies", async () => {
  const handler = createFoodSearchHandler({ getApiKey: () => API_KEY_FIXTURE, fetchImpl: async () => Response.json({ invalid: true }) });
  for (const body of [{ action: "search", query: "rice" }, { action: "detail", fdcId: 100 }]) {
    assert.equal((await handler(postRequest(JSON.stringify(body)))).status, 502);
  }
  assert.equal((await handler(postRequest("x".repeat(8193)))).status, 400);
});
