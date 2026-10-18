import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import type * as TypeScript from "typescript";
import { componentHarness } from "../../foodSearch/__tests__/componentHarness";
import { createFoodLogStorage, foodLogSyncKey, legacyFoodLogKey } from "../foodLogStorage";
import * as storageModule from "../foodLogStorage";
import * as dates from "../../../utils/date";

const input = { foodName: "Meal", calories: 0, protein: 0, carbs: 1.23456789, fat: 0, mealType: "Lunch" };
function setup() {
  let identity: { userId: string; generation: number } | null = { userId: randomUUID(), generation: 1 };
  const firstUser = identity.userId;
  const data = new Map<string, string>();
  let beforeRead: (key: string) => Promise<void> = async () => {};
  let beforeWrite: (key: string) => Promise<void> = async () => {};
  const storage = {
    async getItem(key: string) { await beforeRead(key); return data.get(key) ?? null; },
    async setItem(key: string, value: string) { await beforeWrite(key); data.set(key, value); },
  };
  const service = createFoodLogStorage(storage, randomUUID);
  const h = componentHarness("src/context/FoodLogContext.tsx", "FoodLogProvider", { children: null }, {
    "expo-crypto": { randomUUID },
    "./AuthContext": { useAuth: () => ({ authIdentity: identity }) },
    "../services/foodLogs/localFoodLogStorage": { foodLogStorage: service },
    "../services/foodLogs/foodLogStorage": storageModule,
    "../utils/date": dates,
  });
  return { h, data, firstUser, service,
    value: () => h.node("ContextProvider").props.value,
    switchUser(next: typeof identity) { identity = next; h.render(); },
    blockRead(fn: typeof beforeRead) { beforeRead = fn; },
    blockWrite(fn: typeof beforeWrite) { beforeWrite = fn; },
  };
}
test("actual context works locally with UUIDs, durable operations, serving totals and no Supabase adapter", async () => {
  const f = setup(); await f.h.settle(); assert.equal(f.value().foodStorageHydrationState, "ready");
  assert.equal(await f.value().addFoodLog(input, "2024-02-03"), true); f.h.render();
  const entry = f.value().foodLogs[0]; assert.match(entry.id, /^[0-9a-f-]{36}$/);
  assert.equal(entry.loggedDate, "2024-02-03"); assert.equal(entry.carbs, input.carbs); assert.equal(entry.calories, 0);
  const e = JSON.parse(f.data.get(foodLogSyncKey(f.firstUser))!); assert.equal(e.outbox[0].entryId, entry.id);
  assert.equal(await f.value().deleteFoodLog(entry.id), true); f.h.render(); assert.equal(f.value().foodLogs.length, 0);
  assert.equal(await f.value().deleteFoodLog(entry.id), true);
  assert.equal(JSON.parse(f.data.get(foodLogSyncKey(f.firstUser))!).outbox.length, 2); f.h.dispose();
});
test("context clear-by-date preserves other dates and duplicate identical meals remain separate", async () => {
  const f = setup(); await f.h.settle();
  for (const date of ["2024-02-03", "2024-02-04", "2024-02-03"]) { await f.value().addFoodLog(input, date); f.h.render(); }
  assert.equal(new Set(f.value().foodLogs.map((x: any) => x.id)).size, 3);
  assert.equal(await f.value().clearFoodLogsForDate("2024-02-03"), true); f.h.render();
  assert.deepEqual(Array.from(f.value().foodLogs, (x: any) => x.loggedDate), ["2024-02-04"]); f.h.dispose();
});
test("switch during hydration prevents old migration write and exposes only new user's diary", async () => {
  const f = setup(); let release!: () => void; let started!: () => void;
  // Initial hydration is queued; install the read gate before its first microtask.
  const began = new Promise<void>(r => { started = r; });
  f.blockRead(async key => { if (key === foodLogSyncKey(f.firstUser)) { started(); await new Promise<void>(r => { release = r; }); } });
  await began;
  const b = randomUUID(); f.switchUser({ userId: b, generation: 2 }); release(); await f.h.settle(); await f.h.settle();
  assert.equal(f.data.has(foodLogSyncKey(f.firstUser)), false);
  assert.equal(f.value().foodStorageHydrationState, "ready"); assert.equal(f.value().foodLogs.length, 0);
  await f.value().addFoodLog(input); f.h.render(); assert.equal(JSON.parse(f.data.get(foodLogSyncKey(b))!).entries.length, 1); f.h.dispose();
});
test("switch during an in-flight write cannot publish old data or write it to the new account", async () => {
  const f = setup(); await f.h.settle(); let release!: () => void; let started!: () => void;
  const began = new Promise<void>(r => { started = r; });
  f.blockWrite(async key => { if (key === foodLogSyncKey(f.firstUser)) { started(); await new Promise<void>(r => { release = r; }); } });
  const add = f.value().addFoodLog(input); await began;
  const b = randomUUID(); f.switchUser({ userId: b, generation: 2 }); release();
  assert.equal(await add, false); await f.h.settle();
  assert.equal(f.value().foodLogs.length, 0); assert.equal(JSON.parse(f.data.get(foodLogSyncKey(b))!).entries.length, 0);
  // Already-issued storage writes finish only under their captured original key.
  assert.equal(JSON.parse(f.data.get(foodLogSyncKey(f.firstUser))!).entries.length, 1); f.h.dispose();
});
test("same-user new auth generation rejects stale mutation closures", async () => {
  const f = setup(); await f.h.settle(); const staleAdd = f.value().addFoodLog;
  f.switchUser({ userId: f.firstUser, generation: 3 }); await f.h.settle();
  assert.equal(await staleAdd(input), false); assert.equal(f.value().foodLogs.length, 0);
  assert.equal(await f.value().addFoodLog(input), true); f.h.dispose();
});
test("corrupt history exposes error and preserves bytes; retry and logout remain safe", async () => {
  const f = setup(); f.data.set(legacyFoodLogKey(f.firstUser), "invalid"); await f.h.settle();
  assert.equal(f.value().foodStorageHydrationState, "error"); assert.equal(await f.value().addFoodLog(input), false);
  assert.equal(f.data.has(foodLogSyncKey(f.firstUser)), false);
  f.value().retryFoodStorageHydration(); f.h.render(); await f.h.settle(); assert.equal(f.value().foodStorageHydrationState, "error");
  f.switchUser(null); await f.h.settle(); assert.equal(f.value().foodStorageHydrationState, "signed-out");
  assert.equal(f.data.get(legacyFoodLogKey(f.firstUser)), "invalid"); f.h.dispose();
});

test("production storage adapter initializes and mutates with only local dependencies", async () => {
  const ts = createRequire(resolve("package.json"))("typescript") as typeof TypeScript;
  const code = ts.transpileModule(readFileSync("src/services/foodLogs/localFoodLogStorage.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const data = new Map<string, string>();
  const localStorage = {
    async getItem(key: string) { return data.get(key) ?? null; },
    async setItem(key: string, value: string) { data.set(key, value); },
  };
  const allowed: Record<string, unknown> = {
    "@react-native-async-storage/async-storage": { __esModule: true, default: localStorage },
    "expo-crypto": { randomUUID },
    "./foodLogStorage": storageModule,
  };
  const exports: any = {};
  runInNewContext(code, { exports, require(name: string) {
    assert.ok(name in allowed, `Forbidden dependency: ${name}`);
    return allowed[name];
  }, fetch() { assert.fail("No network requests are allowed"); } });
  const user = randomUUID();
  const envelope = await exports.foodLogStorage.update(user, () => true);
  assert.equal(envelope.userId, user);
  const added = await exports.foodLogStorage.add(user, () => true, {
    ...input, id: randomUUID(), createdAt: "2024-01-01T00:00:00Z", loggedDate: "2024-01-01",
  });
  assert.equal(added.entries.length, 1);
});
