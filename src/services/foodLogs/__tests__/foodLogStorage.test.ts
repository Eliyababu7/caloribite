import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createFoodLogStorage, foodLogSyncKey, legacyFoodLogKey, visibleFoodLogs } from "../foodLogStorage";
import { calculateNutritionTotals } from "../../nutrition/nutritionService";
import type { FoodLog } from "../../../types/food";

export const food: FoodLog = { id: "old-id", foodName: " Original meal ", calories: 0.123456789012345, protein: 0, carbs: 2.5, fat: 0,
  mealType: "Breakfast", createdAt: "2024-01-01T23:30:00.000Z", loggedDate: "2023-12-31" };
export function fixture(logs: FoodLog[] = [food]) {
  const user = randomUUID();
  const data = new Map<string, string>([[legacyFoodLogKey(user), JSON.stringify(logs)]]);
  const writes: string[] = [];
  const storage = { async getItem(key: string) { return data.get(key) ?? null; }, async setItem(key: string, value: string) { writes.push(key); data.set(key, value); } };
  return { user, data, writes, storage, service: createFoodLogStorage(storage, randomUUID) };
}
const yes = () => true;
test("migration preserves every occurrence, order, dates, meal types and exact nutrients", async () => {
  const logs = [food, { ...food, mealType: "Dinner" as const, calories: 0 }, food];
  const f = fixture(logs); const e = await f.service.update(f.user, yes);
  assert.deepEqual(e.entries.map(x => ({ ...x.food, id: x.legacyId })), logs);
  assert.equal(new Set(e.entries.map(x => x.food.id)).size, 3);
  assert.equal(e.outbox.length, 3); assert.equal(e.migration.importedCount, 3);
  const actual = visibleFoodLogs(e);
  assert.deepEqual(calculateNutritionTotals(actual), calculateNutritionTotals(logs));
  assert.deepEqual(actual.map(x => [x.loggedDate, x.mealType]), logs.map(x => [x.loggedDate, x.mealType]));
});
test("UUIDs and operation IDs are stable across restart and repeated hydration", async () => {
  const f = fixture([food, food]); const e = await f.service.update(f.user, yes);
  const restarted = createFoodLogStorage(f.storage, () => { throw new Error("must not reimport"); });
  assert.deepEqual(await restarted.update(f.user, yes), e);
  assert.deepEqual(await restarted.update(f.user, yes), e); assert.equal(f.writes.length, 1);
});
test("legacy bytes remain untouched even after add and delete", async () => {
  const f = fixture(); const before = f.data.get(legacyFoodLogKey(f.user));
  const e = await f.service.update(f.user, yes);
  await f.service.add(f.user, yes, { ...food, id: randomUUID() });
  await f.service.remove(f.user, yes, [e.entries[0].food.id]);
  assert.equal(f.data.get(legacyFoodLogKey(f.user)), before);
  assert.ok(f.writes.every(key => key === foodLogSyncKey(f.user)));
});
test("existing envelope ignores changed or corrupt legacy array", async () => {
  const f = fixture(); const e = await f.service.update(f.user, yes);
  f.data.set(legacyFoodLogKey(f.user), "corrupt"); assert.deepEqual(await f.service.update(f.user, yes), e);
});
test("failed migration write leaves original recovery bytes and can retry", async () => {
  const f = fixture(); let fail = true;
  const s = createFoodLogStorage({ ...f.storage, async setItem(k, v) { if (fail) throw Error("disk"); await f.storage.setItem(k, v); } }, randomUUID);
  await assert.rejects(s.update(f.user, yes)); assert.equal(f.data.has(foodLogSyncKey(f.user)), false);
  assert.equal(f.data.get(legacyFoodLogKey(f.user)), JSON.stringify([food]));
  fail = false; assert.equal((await s.update(f.user, yes)).entries.length, 1);
});
test("interrupted ownership before migration write creates no envelope", async () => {
  const f = fixture(); let current = true;
  const s = createFoodLogStorage({ ...f.storage, async getItem(k) { const v = await f.storage.getItem(k); current = false; return v; } }, randomUUID);
  await assert.rejects(s.update(f.user, () => current)); assert.equal(f.writes.length, 0);
});
test("addition and its stable create operation persist in one write", async () => {
  const f = fixture([]); await f.service.update(f.user, yes); f.writes.length = 0;
  const added = { ...food, id: randomUUID() }; const e = await f.service.add(f.user, yes, added);
  assert.equal(f.writes.length, 1); assert.deepEqual(e.entries[0].food, added);
  assert.deepEqual(e.outbox.map(x => [x.entryId, x.kind]), [[added.id, "create"]]);
  assert.deepEqual(await f.service.update(f.user, yes), e);
});
test("delete-before-upload retains payload, create operation and terminal tombstone", async () => {
  const f = fixture(); const e = await f.service.update(f.user, yes); const id = e.entries[0].food.id;
  const deleted = await f.service.remove(f.user, yes, [id]);
  assert.deepEqual(visibleFoodLogs(deleted), []); assert.deepEqual(deleted.entries, e.entries);
  assert.deepEqual(deleted.tombstones, [id]); assert.deepEqual(deleted.outbox.map(x => x.kind), ["create", "delete"]);
  assert.deepEqual(await f.service.remove(f.user, yes, [id, "unknown"]), deleted);
});
test("clear captured IDs does not delete later additions on the same date", async () => {
  const f = fixture([food, { ...food, loggedDate: "2024-02-01" }]); const e = await f.service.update(f.user, yes);
  const captured = visibleFoodLogs(e).filter(x => x.loggedDate === food.loggedDate).map(x => x.id);
  const later = { ...food, id: randomUUID() }; await f.service.add(f.user, yes, later);
  const cleared = await f.service.remove(f.user, yes, captured);
  assert.deepEqual(visibleFoodLogs(cleared).map(x => x.id), [later.id, e.entries[1].food.id]);
});
test("concurrent updates read latest envelope and preserve operations and pull metadata", async () => {
  const f = fixture([]); await f.service.update(f.user, yes);
  await Promise.all([f.service.add(f.user, yes, { ...food, id: randomUUID() }),
    f.service.update(f.user, yes, latest => ({ ...latest, pull: { cursor: "future-cursor" } })),
    f.service.add(f.user, yes, { ...food, id: randomUUID() })]);
  const e = await f.service.update(f.user, yes); assert.equal(e.entries.length, 2); assert.equal(e.outbox.length, 2); assert.equal(e.pull.cursor, "future-cursor");
});
test("accounts use separate envelopes and cannot parse another account's data", async () => {
  const f = fixture(); const a = await f.service.update(f.user, yes); const b = randomUUID();
  assert.deepEqual(visibleFoodLogs(await f.service.update(b, yes)), []);
  f.data.set(foodLogSyncKey(b), JSON.stringify(a)); await assert.rejects(f.service.update(b, yes));
});
for (const raw of ["{", "{}", "null", '[{"id":"bad"}]']) {
  test(`corrupt legacy input fails without a write: ${raw}`, async () => {
    const f = fixture(); f.data.set(legacyFoodLogKey(f.user), raw); await assert.rejects(f.service.update(f.user, yes));
    assert.equal(f.writes.length, 0); assert.equal(f.data.get(legacyFoodLogKey(f.user)), raw);
  });
}
for (const kind of ["json", "version", "record", "outbox", "tombstone", "metadata"]) {
  test(`invalid envelope ${kind} fails without fallback or overwrite`, async () => {
    const f = fixture(); const e = await f.service.update(f.user, yes);
    const broken: any = structuredClone(e);
    if (kind === "version") broken.version = 2;
    if (kind === "record") broken.entries[0].food.protein = null;
    if (kind === "outbox") broken.outbox[0].id = "bad";
    if (kind === "tombstone") broken.tombstones = ["unknown"];
    if (kind === "metadata") broken.migration.importedCount = 999;
    const raw = kind === "json" ? "{" : JSON.stringify(broken);
    f.data.set(foodLogSyncKey(f.user), raw); f.writes.length = 0;
    await assert.rejects(f.service.update(f.user, yes)); assert.equal(f.writes.length, 0); assert.equal(f.data.get(foodLogSyncKey(f.user)), raw);
  });
}
test("failed mutation leaves the complete previous envelope intact", async () => {
  const f = fixture(); const e = await f.service.update(f.user, yes);
  const s = createFoodLogStorage({ ...f.storage, async setItem() { throw Error("disk full"); } }, randomUUID);
  await assert.rejects(s.remove(f.user, yes, [e.entries[0].food.id]));
  assert.deepEqual(await f.service.update(f.user, yes), e);
});

test("the update path cannot remove terminal tombstones", async () => {
  const f = fixture(); const e = await f.service.update(f.user, yes);
  const deleted = await f.service.remove(f.user, yes, [e.entries[0].food.id]);
  await assert.rejects(f.service.update(f.user, yes, latest => ({ ...latest, tombstones: [] })));
  assert.deepEqual(await f.service.update(f.user, yes), deleted);
});
test("acknowledgements serialize with additions without losing either change", async () => {
  const f = fixture(); const e = await f.service.update(f.user, yes);
  const acknowledgedId = e.outbox[0].id;
  await Promise.all([
    f.service.add(f.user, yes, { ...food, id: randomUUID() }),
    f.service.update(f.user, yes, latest => ({ ...latest, outbox: latest.outbox.filter(op => op.id !== acknowledgedId) })),
  ]);
  const next = await f.service.update(f.user, yes);
  assert.equal(next.entries.length, 2); assert.equal(next.outbox.length, 1);
  assert.notEqual(next.outbox[0].id, acknowledgedId);
});
test("write committed before interruption is reused without importing legacy again", async () => {
  const f = fixture([food, food]); let current = true;
  const interrupted = createFoodLogStorage({ ...f.storage, async setItem(key, value) {
    await f.storage.setItem(key, value); current = false;
  } }, randomUUID);
  await assert.rejects(interrupted.update(f.user, () => current));
  const bytes = f.data.get(foodLogSyncKey(f.user));
  await f.service.update(f.user, yes);
  assert.equal(f.data.get(foodLogSyncKey(f.user)), bytes);
});
