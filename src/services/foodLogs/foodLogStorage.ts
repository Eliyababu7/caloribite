import type { FoodLog } from "../../types/food";
import { parseLocalDateKey } from "../../utils/date";

export type SyncEntry = { food: FoodLog; legacyId: string | null };
export type FoodLogEnvelope = {
  version: 1;
  userId: string;
  entries: SyncEntry[];
  migration: { sourceKey: string; importedCount: number };
  outbox: { id: string; entryId: string; kind: "create" | "delete" }[];
  tombstones: string[];
  pull: { cursor: string | null };
};
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
const queues = new Map<string, Promise<unknown>>();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validUuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);
export const legacyFoodLogKey = (userId: string) => `caloribite_food_logs:user:${userId}`;
export const foodLogSyncKey = (userId: string) => `caloribite_food_log_sync:user:${userId}`;

export function validateFoodLog(value: unknown): asserts value is FoodLog {
  const f = value as FoodLog | null;
  if (!f || typeof f !== "object" || typeof f.id !== "string" || !f.id.trim() ||
      typeof f.foodName !== "string" || !f.foodName.trim() ||
      typeof f.createdAt !== "string" || !Number.isFinite(Date.parse(f.createdAt)) ||
      typeof f.loggedDate !== "string" || !parseLocalDateKey(f.loggedDate) ||
      !["Breakfast", "Lunch", "Dinner", "Snack"].includes(f.mealType) ||
      ![f.calories, f.protein, f.carbs, f.fat].every(n => typeof n === "number" && Number.isFinite(n))) {
    throw new Error("Invalid food log; history was not overwritten");
  }
}
export function visibleFoodLogs(envelope: FoodLogEnvelope): FoodLog[] {
  const deleted = new Set(envelope.tombstones);
  return envelope.entries.filter(entry => !deleted.has(entry.food.id)).map(entry => entry.food);
}
export function parseEnvelope(raw: string, userId: string): FoodLogEnvelope {
  const e = JSON.parse(raw) as FoodLogEnvelope;
  if (!e || e.version !== 1 || e.userId !== userId || !Array.isArray(e.entries) ||
      !Array.isArray(e.outbox) || !Array.isArray(e.tombstones) ||
      !e.migration || e.migration.sourceKey !== legacyFoodLogKey(userId) ||
      !Number.isSafeInteger(e.migration.importedCount) || e.migration.importedCount < 0 ||
      !e.pull || !(e.pull.cursor === null || typeof e.pull.cursor === "string")) throw new Error("Invalid or unsupported food log envelope");
  const ids = new Set<string>();
  for (const entry of e.entries) {
    if (!entry || !(entry.legacyId === null || typeof entry.legacyId === "string")) throw new Error("Invalid migration metadata");
    validateFoodLog(entry.food);
    if (!validUuid(entry.food.id) || ids.has(entry.food.id)) throw new Error("Invalid entry identity");
    ids.add(entry.food.id);
  }
  if (e.migration.importedCount !== e.entries.filter(entry => entry.legacyId !== null).length) throw new Error("Invalid migration count");
  if (new Set(e.tombstones).size !== e.tombstones.length || e.tombstones.some(id => !ids.has(id))) throw new Error("Invalid tombstones");
  const operations = new Set<string>();
  for (const op of e.outbox) {
    if (!op || !validUuid(op.id) || operations.has(op.id) || !ids.has(op.entryId) ||
        !["create", "delete"].includes(op.kind) || (op.kind === "delete" && !e.tombstones.includes(op.entryId))) throw new Error("Invalid outbox");
    operations.add(op.id);
  }
  return e;
}

// All hydration, migration and future acknowledgements/reconciliation share this
// read-latest/write-once queue. No caller writes a captured array snapshot.
export function createFoodLogStorage(storage: Storage, uuid: () => string) {
  function update(userId: string, isCurrent: () => boolean,
    transform: (latest: FoodLogEnvelope) => FoodLogEnvelope = value => value): Promise<FoodLogEnvelope> {
    const key = foodLogSyncKey(userId);
    const previous = queues.get(key) ?? Promise.resolve();
    const work = previous.catch(() => undefined).then(async () => {
      const guard = () => { if (!isCurrent()) throw new Error("Stale food log owner"); };
      guard();
      const raw = await storage.getItem(key);
      guard();
      let latest: FoodLogEnvelope;
      if (raw !== null) latest = parseEnvelope(raw, userId);
      else {
        const legacyRaw = await storage.getItem(legacyFoodLogKey(userId));
        guard();
        const legacy: unknown = legacyRaw === null ? [] : JSON.parse(legacyRaw);
        if (!Array.isArray(legacy)) throw new Error("Invalid legacy food logs");
        legacy.forEach(validateFoodLog);
        const entries = (legacy as FoodLog[]).map(food => ({ food: { ...food, id: uuid() }, legacyId: food.id }));
        latest = { version: 1, userId, entries, migration: { sourceKey: legacyFoodLogKey(userId), importedCount: entries.length },
          outbox: entries.map(e => ({ id: uuid(), entryId: e.food.id, kind: "create" })), tombstones: [], pull: { cursor: null } };
      }
      const terminalIds = [...latest.tombstones];
      const next = transform(latest);
      if (terminalIds.some(id => !next.tombstones.includes(id))) {
        throw new Error("A terminal food log tombstone cannot be removed");
      }
      const encoded = JSON.stringify(next);
      parseEnvelope(encoded, userId);
      guard();
      // A dispatched AsyncStorage write cannot be cancelled. It may complete
      // after logout, but only under its captured owner's key; never publish it
      // into a different authentication generation.
      if (raw !== encoded) await storage.setItem(key, encoded);
      guard();
      return next;
    });
    queues.set(key, work);
    const cleanup = () => { if (queues.get(key) === work) queues.delete(key); };
    void work.then(cleanup, cleanup);
    return work;
  }
  return {
    update,
    add(userId: string, isCurrent: () => boolean, food: FoodLog) {
      return update(userId, isCurrent, latest => ({ ...latest,
        entries: [{ food, legacyId: null }, ...latest.entries],
        outbox: [...latest.outbox, { id: uuid(), entryId: food.id, kind: "create" }],
      }));
    },
    remove(userId: string, isCurrent: () => boolean, capturedIds: readonly string[]) {
      return update(userId, isCurrent, latest => {
        const ids = visibleFoodLogs(latest).map(f => f.id).filter(id => capturedIds.includes(id));
        return { ...latest, tombstones: [...latest.tombstones, ...ids],
          outbox: [...latest.outbox, ...ids.map(entryId => ({ id: uuid(), entryId, kind: "delete" as const }))] };
      });
    },
  };
}
