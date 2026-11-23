import { nativeFoodLogCoordination, type FoodLogCoordination, type ChangeSource } from "./foodLogCoordination";

export class FoodLogConsentDisabledError extends Error {}

export const FOOD_LOG_BACKUP_EXPLANATION =
  "Existing and future diary entries will be stored in your CaloriBite cloud account. " +
  "Offline diary use will continue. Turning synchronization off stops future synchronization " +
  "but does not automatically delete already synchronized cloud data.";

export function foodLogRolloutEnabled(value: unknown): boolean {
  return value === "true";
}
export type BackupStatus = "device" | "pending" | "syncing" | "up-to-date" | "offline" | "sign-in-required" | "failed";
export type StoredBackupStatus = Exclude<BackupStatus, "syncing" | "device">;
export type BackupPreference = { version: 1; userId: string; enabled: boolean; lastStatus: StoredBackupStatus | null };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export const backupPreferenceKey = (userId: string) => `caloribite_food_log_cloud_backup:user:${userId}`;
const queues = new Map<string, Promise<unknown>>();
const statuses = ["pending", "up-to-date", "offline", "sign-in-required", "failed"];
function disabled(userId: string): BackupPreference { return { version: 1, userId, enabled: false, lastStatus: null }; }
export function parseBackupPreference(raw: string | null, userId: string): BackupPreference {
  try {
    const value = raw === null ? null : JSON.parse(raw);
    if (value?.version !== 1 || value.userId !== userId || typeof value.enabled !== "boolean" ||
        !(value.lastStatus === null || statuses.includes(value.lastStatus))) return disabled(userId);
    return { version: 1, userId, enabled: value.enabled, lastStatus: value.lastStatus };
  } catch { return disabled(userId); }
}
export function createBackupPreferenceStorage(storage: Storage, coordination: FoodLogCoordination = nativeFoodLogCoordination) {
  function protectedWork<T>(userId: string, work: () => Promise<T>, signal?: AbortSignal) {
    const key = backupPreferenceKey(userId);
    const previous = queues.get(key) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(() => coordination.exclusive(key, work, signal));
    queues.set(key, result);
    const cleanup = () => { if (queues.get(key) === result) queues.delete(key); };
    void result.then(cleanup, cleanup); return result;
  }
  function update(userId: string, isCurrent: () => boolean, transform?: (latest: BackupPreference) => BackupPreference, source?: symbol) {
    return protectedWork(userId, async () => {
      const key = backupPreferenceKey(userId);
      const guard = () => { if (!isCurrent()) throw Error("Stale backup preference owner"); };
      guard(); const raw = await storage.getItem(key); guard();
      const latest = parseBackupPreference(raw, userId);
      if (!transform) return latest;
      const next = transform(latest); guard();
      const encoded = JSON.stringify(next);
      if (encoded !== raw) {
        await storage.setItem(key, encoded);
        if (latest.enabled !== next.enabled) coordination.publish(key, source);
      }
      guard(); return next;
    });
  }
  return {
    async read(userId: string, isCurrent: () => boolean) {
      try { return await update(userId, isCurrent); }
      catch { return disabled(userId); }
    },
    setEnabled(userId: string, enabled: boolean, isCurrent: () => boolean, source?: symbol) {
      return update(userId, isCurrent, latest => ({ ...latest, enabled, lastStatus: enabled ? "pending" : null }), source);
    },
    setStatus(userId: string, status: StoredBackupStatus, isCurrent: () => boolean) {
      return update(userId, isCurrent, latest => latest.enabled ? { ...latest, lastStatus: status } : latest);
    },
    subscribe(userId: string, listener: (source: ChangeSource) => void) {
      return coordination.subscribe(backupPreferenceKey(userId), (source, change) => {
        // Status-only writes in another tab must not cancel unrelated sync work.
        if (change && parseBackupPreference(change.oldValue, userId).enabled === parseBackupPreference(change.newValue, userId).enabled) return;
        listener(source);
      });
    },
    async withEnabled<T>(userId: string, isCurrent: () => boolean, dispatch: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      const started = await protectedWork(userId, async () => {
        if (!isCurrent()) throw new FoodLogConsentDisabledError();
        const choice = parseBackupPreference(await storage.getItem(backupPreferenceKey(userId)), userId);
        if (!isCurrent() || !choice.enabled) throw new FoodLogConsentDisabledError();
        // Box the promise: release the consent lock after dispatch, NOT after the response.
        // A later pause can acquire the lock and abort accepted in-flight work locally.
        const response = dispatch();
        void response.catch(() => {}); // May reject before the lock-release continuation runs.
        return { response };
      }, signal);
      return started.response;
    },
  };
}
