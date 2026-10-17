import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  hasAuthenticatedUserBearer,
  parseJsonRequestBody,
  validateFoodSearchRequest,
} from "../validation.ts";

function bearerForRole(role: string): string {
  const payload = btoa(JSON.stringify({ role, sub: "user-123" }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `Bearer e30.${payload}.signature`;
}

describe("food-search request validation", () => {
  test("trims search queries and applies the default page size", () => {
    assert.deepEqual(
      validateFoodSearchRequest({ action: "search", query: "  chicken  " }),
      { ok: true, value: { action: "search", query: "chicken", pageSize: 10 } },
    );
  });

  test("bounds page size and ignores unknown fields", () => {
    assert.deepEqual(
      validateFoodSearchRequest({
        action: "search",
        query: "rice",
        pageSize: 500,
        api_key: "must-not-be-forwarded",
      }),
      { ok: true, value: { action: "search", query: "rice", pageSize: 25 } },
    );
  });

  test("rejects too-short and too-long queries", () => {
    assert.equal(
      validateFoodSearchRequest({ action: "search", query: "x" }).ok,
      false,
    );
    assert.equal(
      validateFoodSearchRequest({ action: "search", query: "x".repeat(121) })
        .ok,
      false,
    );
  });

  test("rejects invalid page sizes", () => {
    for (const pageSize of [0, -1, 1.5, Number.NaN, "10"]) {
      assert.equal(
        validateFoodSearchRequest({ action: "search", query: "rice", pageSize })
          .ok,
        false,
      );
    }
  });

  test("accepts a positive safe USDA ID", () => {
    assert.deepEqual(
      validateFoodSearchRequest({ action: "detail", fdcId: 171077 }),
      {
        ok: true,
        value: { action: "detail", fdcId: 171077 },
      },
    );
  });

  test("rejects invalid USDA IDs and unsupported actions", () => {
    for (const fdcId of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "171077",
    ]) {
      assert.equal(
        validateFoodSearchRequest({ action: "detail", fdcId }).ok,
        false,
      );
    }
    assert.equal(validateFoodSearchRequest({ action: "search" }).ok, false);
    assert.equal(validateFoodSearchRequest([]).ok, false);
  });

  test("handles malformed JSON and oversized bodies safely", () => {
    assert.deepEqual(parseJsonRequestBody("{"), { ok: false });
    assert.deepEqual(parseJsonRequestBody("{}", 1), { ok: false });
    assert.deepEqual(parseJsonRequestBody('{"action":"detail"}'), {
      ok: true,
      value: { action: "detail" },
    });
  });

  test("requires an authenticated-user bearer JWT, not a publishable key", () => {
    assert.equal(
      hasAuthenticatedUserBearer(bearerForRole("authenticated")),
      true,
    );
    assert.equal(hasAuthenticatedUserBearer(bearerForRole("anon")), false);
    assert.equal(
      hasAuthenticatedUserBearer("Bearer sb_publishable_test"),
      false,
    );
    assert.equal(hasAuthenticatedUserBearer("Basic token"), false);
    assert.equal(hasAuthenticatedUserBearer(null), false);
  });
});
