import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { browserHarness, food, gate, settle, user, platformCoordination } from "./crossTabHarness";
import { fakeServer } from "./syncFixtures";
import type { BackupInput } from "../foodLogBackupCoordinator";
import type { FoodLogsRepository } from "../../supabase/foodLogsRepository";

test("independent web runtimes serialize concurrent add/delete and retain the tombstone/outbox", async () => {
  const h = browserHarness(), a = h.tab(), b = h.tab(), first = food(), added = food();
  assert.notEqual(a.storageModule, b.storageModule);
  await a.storage.add(user, () => true, first);
  const g = gate(); let once = true;
  a.onRead(async () => { if (once) { once = false; await g.wait(); } });
  const add = a.storage.add(user, () => true, added); await g.started;
  const remove = b.storage.remove(user, () => true, [first.id]); await settle();
  assert.equal(b.reads, 0, "second runtime must not read outside the held cross-context lock");
  g.release(); await Promise.all([add, remove]);
  const e = b.readDiary();
  assert.deepEqual(e.tombstones, [first.id]);
  assert.deepEqual(b.storageModule.visibleFoodLogs(e).map(f => f.id), [added.id]);
  assert.equal(e.outbox.length, 3); assert.equal(e.outbox.at(-1).kind, "delete");
});

test("simultaneous first migration preserves legacy bytes and allocates entry/operation IDs only once", async () => {
  const h = browserHarness(), a = h.tab(), b = h.tab();
  const original = JSON.stringify([{ ...food(), id: "old-id" }, { ...food(), id: "old-id" }]);
  h.data.set(a.storageModule.legacyFoodLogKey(user), original);
  const g = gate(); let once = true;
  a.onRead(async () => { if (once) { once = false; await g.wait(); } });
  const one = a.storage.update(user, () => true); await g.started;
  const two = b.storage.update(user, () => true); await settle(); assert.equal(b.reads, 0);
  g.release(); const [first, second] = await Promise.all([one, two]);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.entries.length, 2); assert.equal(first.outbox.length, 2);
  assert.equal(first.migration.importedCount, 2); assert.equal(a.writes + b.writes, 1);
  assert.equal(h.data.get(a.storageModule.legacyFoodLogKey(user)), original);
});

test("a mutation racing replay acknowledgement cannot erase a tombstone or its delete operation", async () => {
  const h = browserHarness(), a = h.tab(), b = h.tab(), entry = food();
  await a.storage.add(user, () => true, entry);
  const server = fakeServer(), g = gate(); let once = true;
  a.onWrite(async (_key, value) => { if (once && JSON.parse(value).acknowledgements?.length) { once = false; await g.wait(); } });
  const sync = a.load("src/services/foodLogs/foodLogSync.ts") as typeof import("../foodLogSync");
  const replay = sync.synchronizeFoodLogs({ storage: a.storage, repository: server.repository(), owner: { userId: user, generation: 1 }, currentOwner: () => ({ userId: user, generation: 1 }), maxReplayBatches: 1 });
  await g.started; const remove = b.storage.remove(user, () => true, [entry.id]);
  await settle(); g.release(); await Promise.all([replay, remove]);
  const e = a.readDiary(); assert.deepEqual(e.tombstones, [entry.id]);
  assert.equal(e.outbox.length, 1); assert.equal(e.outbox[0].kind, "delete");
  assert.equal(a.storageModule.visibleFoodLogs(e).length, 0);
});

test("a mutation racing pull reconciliation retains both records, pending operation and cursor", async () => {
  const h = browserHarness(), a = h.tab(), b = h.tab(), added = food(), server = fakeServer();
  await a.storage.update(user, () => true); const remoteId = server.add();
  const g = gate(); let once = true;
  a.onWrite(async (_key, value) => { if (once && JSON.parse(value).pull.cursor !== null) { once = false; await g.wait(); } });
  const sync = a.load("src/services/foodLogs/foodLogSync.ts") as typeof import("../foodLogSync");
  const pull = sync.synchronizeFoodLogs({ storage: a.storage, repository: server.repository(), owner: { userId: user, generation: 1 }, currentOwner: () => ({ userId: user, generation: 1 }) });
  await g.started; const add = b.storage.add(user, () => true, added);
  await settle(); g.release(); await Promise.all([pull, add]);
  const e = b.readDiary(); assert.deepEqual(new Set(e.entries.map((x: any) => x.food.id)), new Set([remoteId, added.id]));
  assert.equal(e.outbox.length, 1); assert.equal(e.outbox[0].entryId, added.id); assert.equal(e.pull.cursor, "1");
});

test("external diary notifications refresh subscribers after the protected write", async () => {
  const h = browserHarness(), a = h.tab(), b = h.tab(); await a.storage.update(user, () => true);
  let ids: string[] = []; const unsubscribe = b.storage.subscribe(user, e => { ids = e.entries.map(x => x.food.id); });
  const entry = food(); await a.storage.add(user, () => true, entry); await settle();
  assert.equal(ids.length, 1); assert.equal(ids[0], entry.id); unsubscribe();
});

test("unsupported web coordination fails closed without migration, mutation, consent or network dispatch", async () => {
  const h = browserHarness(), a = h.tab({ supported: false });
  const key = a.storageModule.legacyFoodLogKey(user), original = JSON.stringify([{ ...food(), id: "legacy" }]); h.data.set(key, original);
  await assert.rejects(a.storage.update(user, () => true), /coordination/);
  await assert.rejects(a.storage.add(user, () => true, food()), /coordination/);
  await assert.rejects(a.preferences.setEnabled(user, true, () => true), /coordination/);
  let dispatched = false;
  await assert.rejects(a.preferences.withEnabled(user, () => true, async () => { dispatched = true; }), /coordination/);
  assert.equal(dispatched, false); assert.equal(a.reads, 0); assert.equal(a.writes, 0);
  assert.equal(h.data.get(key), original);
});

test("production platform selection uses fail-closed web coordination and preserves native execution", async () => {
  const web = platformCoordination("web"); let called = false;
  await assert.rejects(web.exclusive("synthetic", async () => { called = true; }), /coordination/);
  assert.equal(called, false);
  const native = platformCoordination("ios");
  assert.equal(await native.exclusive("synthetic", async () => "native"), "native");
});

test("lock rejection and timeout never fall back to unprotected writes", async () => {
  const h = browserHarness(), a = h.tab({ waitMs: 20 }); await a.storage.update(user, () => true);
  const original = h.data.get(a.storageModule.foodLogSyncKey(user));
  h.failNextLock(); await assert.rejects(a.storage.add(user, () => true, food()), /coordination/);
  const g = gate(); const hold = h.locks.request(`caloribite:storage:${a.storageModule.foodLogSyncKey(user)}`, { mode: "exclusive", signal: new AbortController().signal }, () => g.wait());
  await g.started; await assert.rejects(a.storage.add(user, () => true, food()), /coordination/);
  g.release(); await hold; assert.equal(h.data.get(a.storageModule.foodLogSyncKey(user)), original);
  assert.equal(a.writes, 1);
});

function controllers() {
  const h = browserHarness(), a = h.tab(), b = h.tab(), server = fakeServer();
  const key = a.prefsModule.backupPreferenceKey(user);
  h.data.set(key, JSON.stringify({ version: 1, userId: user, enabled: true, lastStatus: null }));
  function make(tab: typeof a, online: boolean) {
    const module = tab.load("src/services/foodLogs/foodLogBackupCoordinator.ts") as typeof import("../foodLogBackupCoordinator");
    let input: BackupInput = { owner: { userId: user, generation: 1 }, rollout: true, hydrated: true, normal: true, token: "synthetic-session" };
    let confirmed = true, confirmations = 0; const signals: AbortSignal[] = [];
    let wrap: (repo: FoodLogsRepository) => FoodLogsRepository = repo => repo;
    const c = module.createFoodLogBackupCoordinator({ input: () => input, preferences: tab.preferences, storage: tab.storage,
      changed() {}, confirm: async () => { confirmations++; return confirmed; },
      repository: (_owner, _token, current, signal) => { signals.push(signal); return wrap(server.repository(current)); },
    });
    const unsubscribe = tab.storage.subscribe(user, c.observe);
    return { c, signals, get confirmations() { return confirmations; },
      start() { c.configure(); c.setNetwork(online); },
      configure(patch: Partial<BackupInput>) { input = { ...input, ...patch }; c.configure(); },
      confirm(value: boolean) { confirmed = value; }, wrap(fn: typeof wrap) { wrap = fn; },
      dispose() { unsubscribe(); c.dispose(); },
    };
  }
  const first = make(a, false), second = make(b, true);
  return { h, a, b, server, key, first, second,
    async start() { await a.storage.update(user, () => true); first.start(); second.start(); await settle(); await second.c.trigger(); },
    dispose() { first.dispose(); second.dispose(); },
  };
}

test("pause in another runtime aborts in-flight work, prevents further RPCs and requires explicit re-enable", async () => {
  const s = controllers(); await s.start(); const g = gate(); let once = true;
  s.second.wrap(repo => ({ ...repo, async apply(batch) {
    const rows = await repo.apply(batch); // Simulate a request already accepted by the server.
    if (once) { once = false; await g.wait(); } return rows;
  } }));
  await s.b.storage.add(user, () => true, food()); await g.started;
  await s.first.c.disable(); await settle();
  assert.equal(s.second.c.snapshot().enabled, false); assert.equal(s.second.signals.at(-1)?.aborted, true);
  const calls = s.server.calls.length; g.release(); await settle();
  await s.b.storage.add(user, () => true, food()); await s.second.c.trigger();
  assert.equal(s.server.calls.length, calls); assert.equal(s.server.rows.size, 1, "pause cannot undo an accepted request");
  s.second.confirm(false); assert.equal(await s.second.c.enable(), false); assert.equal(JSON.parse(s.h.data.get(s.key)!).enabled, false);
  s.second.confirm(true); assert.equal(await s.second.c.enable(), true); await s.second.c.trigger(); await settle();
  assert.equal(s.server.rows.size, 2); assert.equal(s.second.confirmations, 2); assert.equal(JSON.parse(s.h.data.get(s.key)!).enabled, true);
  s.dispose();
});

test("persisted pause is checked before dispatch even when cross-tab events are delayed", async () => {
  const s = controllers(); await s.start(); s.h.events(false);
  await s.first.c.disable(); assert.equal(s.second.c.snapshot().enabled, true);
  const before = s.server.calls.length; await s.b.storage.add(user, () => true, food());
  await s.second.c.trigger(); await settle();
  assert.equal(s.server.calls.length, before); assert.equal(s.second.c.snapshot().enabled, false);
  assert.equal(s.b.readDiary().outbox.length, 1); s.dispose();
});

test("pause aborts an RPC waiting for the consent lock before it can dispatch", async () => {
  const s = controllers(); await s.start(); const g = gate(); let once = true;
  s.a.onWrite(async (key, value) => { if (key === s.key && !JSON.parse(value).enabled && once) { once = false; await g.wait(); } });
  const pause = s.first.c.disable(); await g.started;
  const before = s.server.calls.length; await s.b.storage.add(user, () => true, food()); await settle();
  g.release(); await pause; await settle(); await s.second.c.trigger();
  assert.equal(s.server.calls.length, before); assert.equal(s.second.c.snapshot().enabled, false); s.dispose();
});

test("account switching invalidates old work and old-account consent events cannot enable the new account", async () => {
  const s = controllers(); await s.start(); const g = gate();
  s.second.wrap(repo => ({ ...repo, async apply(batch) { await g.wait(); return repo.apply(batch); } }));
  await s.b.storage.add(user, () => true, food()); await g.started;
  const other = randomUUID(); s.second.configure({ owner: { userId: other, generation: 2 } });
  assert.equal(s.second.signals.at(-1)?.aborted, true); await s.first.c.disable();
  await s.first.c.enable(); g.release(); await settle();
  assert.equal(s.second.c.snapshot().enabled, false); assert.equal(s.server.rows.size, 0);
  assert.equal(s.h.data.has(s.b.prefsModule.backupPreferenceKey(other)), false); s.dispose();
});

test("RPC lock failure blocks dispatch and preserves pending operations", async () => {
  const s = controllers(); await s.start(); s.h.events(false);
  // Fail the consent lock itself, rather than the diary write that queues work.
  const old = s.b.preferences.withEnabled;
  s.b.preferences.withEnabled = (...args) => { s.h.failNextLock(); return old(...args); };
  const before = s.server.calls.length; await s.b.storage.add(user, () => true, food()); await s.second.c.trigger();
  assert.equal(s.server.calls.length, before); assert.equal(s.b.readDiary().outbox.length, 1);
  assert.equal(s.second.c.snapshot().status, "failed"); s.dispose();
});
