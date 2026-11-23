import type { FoodLogEnvelope } from "./foodLogStorage";
import { FoodLogSyncError, sameFood, serverFood, type ServerFoodLog } from "./foodLogSyncTypes";

// Merge individual immutable records into the latest envelope. Existing order,
// pending additions and terminal local deletion overlays are retained.
export function mergeFoodLogChanges(latest: FoodLogEnvelope, rows: readonly ServerFoodLog[]): FoodLogEnvelope {
  const entries = [...latest.entries];
  const byId = new Map(entries.map((entry, index) => [entry.food.id, index]));
  const deleted = new Set(latest.tombstones);
  for (const row of rows) {
    const index = byId.get(row.id);
    if (index !== undefined) {
      const entry = entries[index];
      if (entry.server && entry.server.server_revision >= row.server_revision) continue;
      if (!sameFood(entry.food, serverFood(row))) throw new FoodLogSyncError("conflict");
      // Preserve local snapshot spellings and migration metadata exactly.
      entries[index] = { ...entry, server: row };
    } else {
      byId.set(row.id, entries.length);
      entries.push({ food: serverFood(row), legacyId: null, server: row });
    }
    if (row.deleted_at !== null) deleted.add(row.id);
  }
  return { ...latest, entries, tombstones: [...deleted] };
}
