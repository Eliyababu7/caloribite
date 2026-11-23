import { parseLocalDateKey } from "../../utils/date";
import type { Database, Json } from "../../types/database";
import type { SyncEntry, FoodLogEnvelope } from "../foodLogs/foodLogStorage";
import { FoodLogSyncError, MAX_BATCH_BYTES, MAX_BATCH_SIZE, isRevision, isUuid, jsonBytes,
  ownerMatches, validTimestamp, parseServerFoodLog, sameFood, serverFood, type FoodLogOwner, type ServerFoodLog } from "../foodLogs/foodLogSyncTypes";

type RpcNames = "apply_food_log_mutations" | "pull_food_log_changes";
type RpcArgs = Database["public"]["Functions"][RpcNames]["Args"];
export type FoodLogsRpcClient = {
  rpc(name: RpcNames, args: RpcArgs): PromiseLike<{
    data: unknown; error: { code?: string; message?: string } | null; status: number;
  }>;
};
export type ReplayMutation = { operation: FoodLogEnvelope["outbox"][number]; entry: SyncEntry };
export type FoodLogPullPage = { changes: ServerFoodLog[]; watermark: number; nextCursor: number; hasMore: boolean };
export type FoodLogsRepository = {
  owner: FoodLogOwner;
  apply(batch: readonly ReplayMutation[]): Promise<ServerFoodLog[]>;
  pull(cursor: number, pageSize: number, watermark: number | null): Promise<FoodLogPullPage>;
};
export function mapFoodLogMutation({ operation, entry }: ReplayMutation): Json {
  const food = entry.food;
  if (!isUuid(food.id) || !isUuid(operation.id) || operation.entryId !== food.id ||
      !["create", "delete"].includes(operation.kind) || !food.foodName.trim() || [...food.foodName].length > 300 ||
      ![food.calories, food.protein, food.carbs, food.fat].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0) ||
      !["Breakfast", "Lunch", "Dinner", "Snack"].includes(food.mealType) ||
      parseLocalDateKey(food.loggedDate) === null || !validTimestamp(food.createdAt) ||
      (entry.server?.originating_device_id != null && !isUuid(entry.server.originating_device_id))) {
    throw new FoodLogSyncError("validation");
  }
  return { id: food.id, mutation_id: operation.id, kind: operation.kind, snapshot: {
    food_name: food.foodName, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat,
    meal_type: food.mealType, client_created_at: food.createdAt, logged_date: food.loggedDate,
    legacy_local_id: entry.legacyId ?? entry.server?.legacy_local_id ?? null,
    originating_device_id: entry.server?.originating_device_id ?? null,
  } };
}
function failure(code: string | undefined, status: number, message?: string): FoodLogSyncError {
  if (status === 401 || (code === "42501" && message === "authentication_required") || code === "PGRST301" || code === "PGRST302") return new FoodLogSyncError("authentication");
  if (code === "40001" || code === "23505") return new FoodLogSyncError("conflict");
  if (code?.startsWith("22") || code === "23514") return new FoodLogSyncError("validation");
  if (status === 0 || status === 408 || status === 429 || [502,503,504].includes(status) ||
      code === "PGRST000" || code === "57014" || code?.startsWith("08")) return new FoodLogSyncError("transport");
  return new FoodLogSyncError("database");
}
// No default client, environment reads, singleton or import of supabaseClient.
// A future explicit caller must supply the existing fixed-token client factory.
export function createFoodLogsRepository(
  owner: FoodLogOwner,
  accessToken: string,
  makeClient: (token: string) => FoodLogsRpcClient,
  currentOwner: () => FoodLogOwner | null,
): FoodLogsRepository {
  if (!accessToken.trim() || !isUuid(owner.userId) || !Number.isSafeInteger(owner.generation) || owner.generation < 0) {
    throw new FoodLogSyncError("authentication");
  }
  const boundOwner = Object.freeze({ ...owner });
  const client = makeClient(accessToken);
  const guard = () => { if (!ownerMatches(currentOwner(), boundOwner)) throw new FoodLogSyncError("stale"); };
  async function rpc(name: RpcNames, args: RpcArgs): Promise<unknown> {
    guard();
    let response;
    try { response = await client.rpc(name, args); }
    catch (error) { guard(); throw new FoodLogSyncError(error instanceof SyntaxError ? "malformed" : "transport"); }
    guard();
    if (!response || typeof response !== "object" || !Object.hasOwn(response, "data") ||
        !Object.hasOwn(response, "error") || !Number.isInteger(response.status) || response.status < 0 || response.status > 599 ||
        (response.error !== null && (typeof response.error !== "object" || Array.isArray(response.error) ||
          typeof response.error.code !== "string" || typeof response.error.message !== "string"))) {
      throw new FoodLogSyncError("malformed");
    }
    if (response.error || response.status < 200 || response.status >= 300) throw failure(response.error?.code, response.status, response.error?.message);
    return response.data;
  }
  return {
    owner: boundOwner,
    async apply(batch) {
      guard();
      if (batch.length < 1 || batch.length > MAX_BATCH_SIZE) throw new FoodLogSyncError("validation");
      const mutations = batch.map(mapFoodLogMutation);
      if (jsonBytes(mutations) > MAX_BATCH_BYTES || new Set(batch.map(b => b.operation.id)).size !== batch.length) throw new FoodLogSyncError("validation");
      const data = await rpc("apply_food_log_mutations", { p_mutations: mutations });
      guard();
      if (!Array.isArray(data) || data.length !== batch.length) throw new FoodLogSyncError("malformed");
      const rows = data.map(row => parseServerFoodLog(row, boundOwner.userId));
      const revisions = new Map<number, string>();
      const canonical = new Map<string, string>();
      rows.forEach((row, index) => {
        const request = batch[index];
        if (row.id !== request.entry.food.id || (request.operation.kind === "delete" && row.deleted_at === null) ||
            (!row.deleted_at && (!sameFood(request.entry.food, serverFood(row)) ||
              row.legacy_local_id !== (request.entry.legacyId ?? request.entry.server?.legacy_local_id ?? null) ||
              row.originating_device_id !== (request.entry.server?.originating_device_id ?? null))) ||
            (revisions.has(row.server_revision) && revisions.get(row.server_revision) !== row.id)) throw new FoodLogSyncError("malformed");
        if (canonical.has(row.id) && canonical.get(row.id) !== JSON.stringify(row)) throw new FoodLogSyncError("malformed");
        canonical.set(row.id, JSON.stringify(row));
        revisions.set(row.server_revision, row.id);
      });
      return rows;
    },
    async pull(cursor, pageSize, watermark) {
      guard();
      if (!isRevision(cursor) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_BATCH_SIZE ||
          (watermark !== null && (!isRevision(watermark) || watermark < cursor))) throw new FoodLogSyncError("validation");
      const data = await rpc("pull_food_log_changes", { p_after_revision: cursor, p_page_size: pageSize,
        ...(watermark === null ? {} : { p_watermark: watermark }) });
      guard();
      const page = data as Record<string, unknown> | null;
      if (!page || typeof page !== "object" || Array.isArray(page) ||
          Object.keys(page).sort().join() !== "changes,has_more,next_cursor,watermark" ||
          !Array.isArray(page.changes) || page.changes.length > pageSize ||
          !isRevision(page.watermark) || page.watermark < cursor ||
          (watermark !== null && page.watermark !== watermark) || typeof page.has_more !== "boolean" ||
          !isRevision(page.next_cursor)) throw new FoodLogSyncError("malformed");
      const rows = page.changes.map(row => parseServerFoodLog(row, boundOwner.userId));
      const ids = new Set<string>(); let last = cursor;
      for (const row of rows) {
        if (ids.has(row.id) || row.server_revision <= last || row.server_revision > page.watermark) throw new FoodLogSyncError("malformed");
        ids.add(row.id); last = row.server_revision;
      }
      if (page.has_more ? rows.length !== pageSize || page.next_cursor !== last || last <= cursor || last >= page.watermark
        : page.next_cursor !== page.watermark) throw new FoodLogSyncError("malformed");
      return { changes: rows, watermark: page.watermark, nextCursor: page.next_cursor, hasMore: page.has_more };
    },
  };
}
