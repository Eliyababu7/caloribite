import { randomUUID } from "node:crypto";
import { createFoodLogStorage, foodLogSyncKey, type FoodLogEnvelope } from "../foodLogStorage";
import { createFoodLogsRepository, type FoodLogsRpcClient, type ReplayMutation } from "../../supabase/foodLogsRepository";
import type { FoodLogOwner, ServerFoodLog } from "../foodLogSyncTypes";

export const owner: FoodLogOwner = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", generation: 1 };
export function row(id: string = randomUUID(), revision = 1, patch: Partial<ServerFoodLog> = {}): ServerFoodLog {
  return { user_id: owner.userId, id, food_name: "Meal", calories: 0, protein: 1.23456789, carbs: 2.5, fat: 0,
    meal_type: "Breakfast", client_created_at: "2024-01-01T23:30:00.000Z", logged_date: "2023-12-31",
    legacy_local_id: null, originating_device_id: null, server_revision: revision,
    received_at: "2026-10-18T12:00:00.000Z", updated_at: "2026-10-18T12:00:00.000Z", deleted_at: null,
    last_mutation_id: randomUUID(), ...patch };
}
export function mutation(server = row(), kind: "create" | "delete" = "create"): ReplayMutation {
  return { operation: { id: server.last_mutation_id, entryId: server.id, kind },
    entry: { legacyId: server.legacy_local_id, food: { id: server.id, foodName: server.food_name,
      calories: server.calories, protein: server.protein, carbs: server.carbs, fat: server.fat,
      mealType: server.meal_type as "Breakfast", createdAt: server.client_created_at, loggedDate: server.logged_date } } };
}
export function fixture() {
  let identity: FoodLogOwner | null = owner;
  const data = new Map<string,string>(); const writes: FoodLogEnvelope[] = [];
  let writeHook: (key: string, value: string) => Promise<void> = async () => {};
  let readHook: (key: string) => Promise<void> = async () => {};
  const storage = createFoodLogStorage({
    async getItem(key) { await readHook(key); return data.get(key) ?? null; },
    async setItem(key,value) { await writeHook(key,value); writes.push(JSON.parse(value)); data.set(key,value); },
  }, randomUUID);
  return { storage, data, writes, currentOwner: () => identity,
    switch(next: FoodLogOwner | null) { identity = next; },
    onWrite(fn: typeof writeHook) { writeHook = fn; }, onRead(fn: typeof readHook) { readHook = fn; },
    async seed(count = 1, kind: "create" | "delete" = "create") {
      await storage.update(owner.userId, () => true);
      for (let i=0;i<count;i++) {
        const m = mutation(); await storage.add(owner.userId, () => true, m.entry.food);
        if (kind === "delete") await storage.remove(owner.userId, () => true, [m.entry.food.id]);
      }
      writes.length = 0;
    },
    read() { return JSON.parse(data.get(foodLogSyncKey(owner.userId))!) as FoodLogEnvelope; },
  };
}
// Synthetic idempotent RPC server. Network/client creation is never used.
export function fakeServer() {
  const rows = new Map<string,ServerFoodLog>(); const calls: { name: string; args: any }[] = [];
  let revision = 0;
  const client: FoodLogsRpcClient = { async rpc(name,args: any) {
    calls.push({ name, args });
    if (name === "apply_food_log_mutations") {
      for (const m of args.p_mutations) {
        const current = rows.get(m.id);
        if (current?.deleted_at || (current && m.kind === "create")) continue;
        const next = current ?? row(m.id, 1, { ...m.snapshot, user_id: owner.userId });
        revision++;
        rows.set(m.id, { ...next, server_revision: revision, last_mutation_id: m.mutation_id,
          deleted_at: m.kind === "delete" ? "2026-10-18T12:00:00Z" : null });
      }
      return { status: 200, error: null, data: args.p_mutations.map((m: any) => rows.get(m.id)) };
    }
    const watermark = args.p_watermark ?? revision;
    const all = [...rows.values()].filter(r => r.server_revision > args.p_after_revision && r.server_revision <= watermark)
      .sort((a,b) => a.server_revision-b.server_revision);
    const changes = all.slice(0,args.p_page_size);
    const more = changes.length < all.length;
    return { status: 200, error: null, data: { changes, watermark, has_more: more,
      next_cursor: more ? changes.at(-1)!.server_revision : watermark } };
  } };
  return { rows, calls, client,
    add(value = row()) { revision++; rows.set(value.id,{...value,server_revision:revision}); return value.id; },
    repository(current: () => FoodLogOwner | null = () => owner) { return createFoodLogsRepository(owner, "synthetic-test-session", () => client, current); },
  };
}
export function gate() {
  let release!: () => void; let entered!: () => void;
  const started = new Promise<void>(r => { entered = r; });
  const waiting = new Promise<void>(r => { release = r; });
  return { started, release: () => release(), async wait() { entered(); await waiting; } };
}
