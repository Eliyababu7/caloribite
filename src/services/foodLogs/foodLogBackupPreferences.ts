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
export function createBackupPreferenceStorage(storage: Storage) {
  function update(userId: string, isCurrent: () => boolean, transform?: (latest: BackupPreference) => BackupPreference) {
    const key = backupPreferenceKey(userId);
    const previous = queues.get(key) ?? Promise.resolve();
    const work = previous.catch(() => undefined).then(async () => {
      const guard = () => { if (!isCurrent()) throw Error("Stale backup preference owner"); };
      guard(); const raw = await storage.getItem(key); guard();
      const latest = parseBackupPreference(raw, userId);
      if (!transform) return latest;
      const next = transform(latest); guard();
      const encoded = JSON.stringify(next);
      if (encoded !== raw) await storage.setItem(key, encoded);
      guard(); return next;
    });
    queues.set(key, work);
    const cleanup = () => { if (queues.get(key) === work) queues.delete(key); };
    void work.then(cleanup, cleanup); return work;
  }
  return {
    async read(userId: string, isCurrent: () => boolean) {
      try { return await update(userId, isCurrent); }
      catch { return disabled(userId); }
    },
    setEnabled(userId: string, enabled: boolean, isCurrent: () => boolean) {
      return update(userId, isCurrent, latest => ({ ...latest, enabled, lastStatus: enabled ? "pending" : null }));
    },
    setStatus(userId: string, status: StoredBackupStatus, isCurrent: () => boolean) {
      return update(userId, isCurrent, latest => latest.enabled ? { ...latest, lastStatus: status } : latest);
    },
  };
}
