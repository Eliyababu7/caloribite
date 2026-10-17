# food-search provider contracts

All operations require the existing Bearer user JWT. Gateway `verify_jwt` remains enabled.
Browser CORS allowlisting is unchanged. Responses use JSON and `Cache-Control: no-store`.

## Requests

- Legacy USDA search: `{ "action": "search", "query": "rice", "pageSize": 10 }`
- Legacy USDA detail: `{ "action": "detail", "fdcId": 171077 }`
- Explicit USDA: add `"provider": "usda"` to either legacy request.
- Open Food Facts search: `{ "provider": "open-food-facts", "action": "search", "query": "oat bites", "pageSize": 5 }`
- Open Food Facts detail: `{ "provider": "open-food-facts", "action": "detail", "externalId": "0012345678905" }`
- Open Food Facts barcode: `{ "provider": "open-food-facts", "action": "barcode", "barcode": "0012345678905" }`

The code above is a synthetic example. Codes remain strings of 8, 12, 13 or 14 ASCII digits;
leading zeroes are preserved. No check-digit validation is imposed on provider product codes.
Queries are trimmed, 2-120 characters, and cannot contain C0/C1 control characters.
Positive safe integer page sizes are capped at 10 for Open Food Facts; USDA keeps its cap of 25.
Other fields (including pagination) are discarded. Open Food Facts always searches page 1.
Unsupported providers/actions and invalid inputs return safe 400 errors.

## Responses and errors

Search returns `{ "results": [...] }`; detail and barcode return `{ "result": ... }`.
Results use the existing `FoodSearchResult` domain type, with source `open-food-facts`,
string externalId and barcode, optional brand, nullable per-100-g nutrients, gram servings,
attribution and a constructed `https://world.openfoodfacts.org/product/{barcode}` URL.
Malformed or nameless search products are skipped and duplicate product codes are removed.
A malformed detail product returns 502. A missing product returns 404 `food_not_found`.

All errors contain only `{ "error": "safe_code" }`. Provider failures map to 502,
timeouts to 504, upstream 429 to 429, and Open Food Facts 503 to 503 `food_provider_unavailable`.
429/503 preserve only the existing sanitized Retry-After (seconds, maximum 3600).
No provider bodies, headers, stack traces or user credentials are returned or logged.

## Endpoint and version decision

Text search uses GET `https://world.openfoodfacts.org/cgi/search.pl` with `search_terms`,
`search_simple=1`, `action=process`, `json=1`, page 1 and a field allowlist. Query parameters
are built with URLSearchParams. Only required product/nutrient/serving metadata is requested.

Product and barcode reads use the documented GET `/api/v2/product/{code}` endpoint.
This is the permitted v2 fallback: the current v3 read documentation describes a different
nutrition schema and generic success-with-errors examples, so compatibility with the
`nutriments.*_100g` / `*_serving` schema was not established. The v2 tutorial and product
schema document these fields and the numeric status envelope. Synthetic fixtures and tests
cover that exact v2 shape. There is no automatic v3 probe, fallback request or retry.

References:
- https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/
- https://openfoodfacts.github.io/openfoodfacts-server/api/ref-cheatsheet/
- https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/
- https://openfoodfacts.github.io/documentation/docs/Product-Opener/schemas/schemas/product/

The required server User-Agent is `CaloriBite/1.0 (https://caloriebite.com)`.
Open Food Facts reads do not use an API key and never read the USDA environment variable.
No provider writes, login, images, new environment variables or cache are implemented.
Each valid operation makes at most one upstream GET, with a ten-second abort timeout,
redirects rejected, and the existing one-megabyte streaming response limit.

## Nutrition and serving rules

Only explicit standardized `energy-kcal_100g`, `proteins_100g`, `carbohydrates_100g`
and `fat_100g` fields are used. kJ and generic energy fields are never interpreted as kcal.
Null, nonnumeric, negative, non-finite and qualified/ambiguous values remain null;
explicit zero survives. Raw contributor nutrient units do not change standardized grams.

OFF documents that `_100g` can mean 100 mL for liquids. Declared volume or unknown unit
metadata is therefore not treated as a mass nutrition basis. No density is inferred.
If per-100-g fields are absent, a declared per-serving nutrition basis and explicit gram
serving allow conversion via `serving nutrient * 100 / grams`. Invalid per-100-g values
are not overwritten by fallback serving values. Prepared-product nutrition is not mixed in.

One canonical serving is produced only for an explicit gram quantity with a gram unit,
or a bounded serving label such as `30 g` / `1 bar (30 g)`. Conflicting weights are rejected.
Bare counts, cups, pieces, packs, volumes and unqualified serving quantities are never
converted to grams. Package weight is never used as serving weight. Output names and brands
respect the existing client transport bounds (300/200 characters); servings are bounded and
cannot duplicate because only one canonical mass serving is emitted.

## Local validation

`npm test` compiles pure modules to a temporary directory and runs the existing Node runner.
Open Food Facts tests use only synthetic fixtures and injected fetch/timers; they make no
live provider requests. This phase does not change app screens, client transport, storage,
JWT/CORS configuration, dependencies or hosted resources. Deployment is deliberately deferred.
