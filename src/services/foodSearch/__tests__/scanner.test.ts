import assert from "node:assert/strict";
import { test } from "node:test";
import type { FoodSearchResult } from "../../../types/foodSearch";
import { acceptsFoodScan, createScannerController, FOOD_BARCODE_TYPES, type ScannerState } from "../scannerController";
import { cameraPermissionState, webCameraProblem } from "../cameraAccess";
import { FoodSearchError, type FoodSearchErrorKind } from "../foodSearchService";
import { deserializeFoodResult } from "../foodResultTransport";
import { initialFoodServing } from "../confirmationNutrition";

const CODE = "0012345678905";
const food: FoodSearchResult = { source: "open-food-facts", barcode: CODE, externalId: CODE, name: "Fixture cereal", brand: "Fixture", nutritionPer100g: { calories: 200, protein: 5, carbs: null, fat: 0 }, servingOptions: [{ id: "serving", label: "30 g", grams: 30 }], defaultServingId: "serving", attributionLabel: "Open Food Facts (ODbL)" };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness(barcode: () => Promise<FoodSearchResult> = async () => food) {
  const states: ScannerState[] = [];
  let calls = 0;
  const controller = createScannerController({ barcode: async (code) => { calls++; assert.equal(code, CODE); return barcode(); } }, (state) => states.push(state));
  return { controller, states, calls: () => calls };
}

for (const [type, code] of [["ean13", CODE], ["ean8", "00000001"], ["upc_a", "000000000001"], ["upc_e", "00000001"], ["itf14", "00012345678905"]]) {
  test(`scanner accepts ${type} and preserves all digits`, () => assert.equal(acceptsFoodScan(type, code), true));
}
test("only the five packaged-food formats are configured", () => assert.deepEqual(FOOD_BARCODE_TYPES, ["ean13", "ean8", "upc_a", "upc_e", "itf14"]));
for (const [type, data] of [["qr", CODE], ["code128", CODE], ["ean13", "123"], ["ean13", "12345678\n"], ["ean13", "1234567x"], ["ean13", 12345678], ["ean13", "1".repeat(15)]]) {
  test(`scanner rejects invalid payload ${type}/${JSON.stringify(data)}`, () => assert.equal(acceptsFoodScan(type, data), false));
}
test("invalid callbacks do not lock or invoke lookup", async () => {
  const h = harness(); assert.equal(h.controller.accept("qr", CODE), false); await h.controller.cameraStopped();
  assert.equal(h.calls(), 0); assert.equal(h.controller.accept("ean13", CODE), true);
});
test("detection locks synchronously before React renders and makes no request", () => {
  const h = harness(); assert.equal(h.controller.accept("ean13", CODE), true);
  for (let i = 0; i < 20; i++) assert.equal(h.controller.accept("ean13", CODE), false);
  assert.equal(h.states.at(-1)?.status, "detected"); assert.equal(h.calls(), 0);
});
test("camera-stopped handoff invokes exactly once even with repeated callbacks", async () => {
  let finish!: (value: FoodSearchResult) => void;
  const h = harness(() => new Promise((resolve) => { finish = resolve; }));
  h.controller.accept("ean13", CODE); const pending = h.controller.cameraStopped();
  await h.controller.cameraStopped(); await h.controller.retry(); h.controller.accept("ean13", CODE);
  assert.equal(h.calls(), 1); finish(food); await pending;
  assert.equal(h.states.at(-1)?.status, "result");
});
test("cached success still waits for camera removal and uses existing confirmation transport", async () => {
  const h = harness(); h.controller.accept("ean13", CODE); assert.equal(h.calls(), 0);
  await h.controller.cameraStopped(); const result = deserializeFoodResult(h.states.at(-1)!.foodResult!);
  assert.equal(result?.barcode, CODE); assert.equal(result?.name, food.name);
  assert.deepEqual(result?.servingOptions, food.servingOptions); assert.equal(result?.nutritionPer100g.carbs, null);
  assert.equal(result?.nutritionPer100g.fat, 0); assert.equal(initialFoodServing(result!).servingId, "serving");
});
for (const kind of ["not-found", "rate-limited", "offline", "timeout", "unauthorized", "provider-unavailable"] as FoodSearchErrorKind[]) {
  test(`scanner exposes safe ${kind} state and keeps the code locked`, async () => {
    const h = harness(async () => { throw new FoodSearchError(kind); });
    h.controller.accept("ean13", CODE); await h.controller.cameraStopped();
    assert.equal(h.states.at(-1)?.status, kind); assert.equal(h.states.at(-1)?.barcode, CODE);
    assert.equal(h.controller.accept("ean13", CODE), false); assert.equal(h.states.at(-1)?.foodResult, null);
  });
}
test("unknown errors never reveal provider or permission internals", async () => {
  const h = harness(async () => { throw new Error("SENSITIVE_FIXTURE_ERROR"); });
  h.controller.accept("ean13", CODE); await h.controller.cameraStopped();
  assert.equal(h.states.at(-1)?.status, "provider-error"); assert.equal(JSON.stringify(h.states).includes("SENSITIVE"), false);
});
test("retry uses the detected code without remounting the camera", async () => {
  let failures = 1; const h = harness(async () => { if (failures--) throw new FoodSearchError("offline"); return food; });
  h.controller.accept("ean13", CODE); await h.controller.cameraStopped(); await h.controller.retry();
  assert.equal(h.calls(), 2); assert.equal(h.states.at(-1)?.status, "result");
});
test("scan again resets the lock after not found", async () => {
  const h = harness(async () => { throw new FoodSearchError("not-found"); });
  h.controller.accept("ean13", CODE); await h.controller.cameraStopped(); h.controller.reset();
  assert.equal(h.states.at(-1)?.status, "ready"); assert.equal(h.states.at(-1)?.barcode, "");
  assert.equal(h.controller.accept("ean13", CODE), true);
});
for (const operation of ["invalidate", "reset"] as const) {
  test(`${operation} suppresses stale lookup responses`, async () => {
    let finish!: (value: FoodSearchResult) => void;
    const h = harness(() => new Promise((resolve) => { finish = resolve; }));
    h.controller.accept("ean13", CODE); const pending = h.controller.cameraStopped();
    h.controller[operation](); const count = h.states.length; finish(food); await pending; await flush();
    assert.equal(h.states.length, count); assert.equal(h.states.some((s) => s.status === "result"), false);
  });
}
test("close or blur disables callbacks and prevents starting a lookup", async () => {
  const h = harness(); h.controller.accept("ean13", CODE); h.controller.invalidate();
  await h.controller.cameraStopped(); await h.controller.retry(); h.controller.reset();
  assert.equal(h.controller.accept("ean13", CODE), false); assert.equal(h.calls(), 0);
});
test("effect remount can reactivate scanner without reviving old work", () => {
  const h = harness(); h.controller.invalidate(); h.controller.activate();
  assert.equal(h.controller.accept("ean13", CODE), true); assert.equal(h.calls(), 0);
});
test("malformed successful lookup cannot navigate to confirmation", async () => {
  const h = harness(async () => ({ ...food, name: "" })); h.controller.accept("ean13", CODE); await h.controller.cameraStopped();
  assert.equal(h.states.at(-1)?.status, "provider-error"); assert.equal(h.states.at(-1)?.foodResult, null);
});
for (const [permission, expected] of [[null, "loading"], [{ granted: false, canAskAgain: true, status: "undetermined" }, "unrequested"], [{ granted: false, canAskAgain: true, status: "denied" }, "denied"], [{ granted: false, canAskAgain: false, status: "denied" }, "blocked"], [{ granted: true, canAskAgain: true, status: "granted" }, "ready"]] as const) {
  test(`permission state is ${expected}`, () => assert.equal(cameraPermissionState(permission), expected));
}
test("web accepts secure contexts including localhost", () => assert.equal(webCameraProblem(true, true), null));
test("insecure web context gives a safe fallback", () => assert.match(webCameraProblem(false, true)!, /HTTPS or localhost/));
test("unsupported browser gives a safe fallback", () => assert.match(webCameraProblem(true, false)!, /manually/));
