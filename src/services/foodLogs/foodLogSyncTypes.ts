import type { Tables } from "../../types/database";
import type { FoodLog } from "../../types/food";
import { parseLocalDateKey } from "../../utils/date";

export type FoodLogOwner = Readonly<{ userId: string; generation: number }>;
export type ServerFoodLog = Tables<"food_logs">;
export type FoodLogSyncFailureKind = "authentication" | "validation" | "conflict" |
  "database" | "transport" | "malformed" | "storage" | "stale";
export class FoodLogSyncError extends Error {
  constructor(public readonly kind: FoodLogSyncFailureKind) {
    super(`Food log synchronization: ${kind}`);
  }
}
export const MAX_BATCH_SIZE = 100;
export const MAX_BATCH_BYTES = 1048576;
export const isUuid = (v: unknown): v is string => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const isRevision = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function ownerMatches(a: FoodLogOwner | null, b: FoodLogOwner): boolean {
  return a?.userId === b.userId && a.generation === b.generation;
}
export function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  const time = Date.parse(value);
  return !!match && parseLocalDateKey(match[1]) !== null && Number.isFinite(time) &&
    time >= Date.parse("0100-01-01T00:00:00Z") && time < Date.parse("+010000-01-01T00:00:00Z");
}
const ROW_KEYS = ["user_id", "id", "food_name", "calories", "protein", "carbs", "fat", "meal_type",
  "client_created_at", "logged_date", "legacy_local_id", "originating_device_id", "server_revision",
  "received_at", "updated_at", "deleted_at", "last_mutation_id"];
export function parseServerFoodLog(value: unknown, userId: string): ServerFoodLog {
  const row = value as ServerFoodLog | null;
  if (!row || typeof row !== "object" || Array.isArray(row) ||
      Object.keys(row).length !== ROW_KEYS.length || !ROW_KEYS.every(key => Object.hasOwn(row, key)) ||
      row.user_id !== userId || !isUuid(row.user_id) || !isUuid(row.id) || !isUuid(row.last_mutation_id) ||
      typeof row.food_name !== "string" || !row.food_name.trim() || [...row.food_name].length > 300 ||
      ![row.calories, row.protein, row.carbs, row.fat].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0) ||
      !["Breakfast", "Lunch", "Dinner", "Snack"].includes(row.meal_type) ||
      typeof row.logged_date !== "string" || parseLocalDateKey(row.logged_date) === null ||
      !validTimestamp(row.client_created_at) || !validTimestamp(row.received_at) || !validTimestamp(row.updated_at) ||
      !(row.deleted_at === null || validTimestamp(row.deleted_at)) ||
      !(row.legacy_local_id === null || typeof row.legacy_local_id === "string") ||
      !(row.originating_device_id === null || isUuid(row.originating_device_id)) ||
      !isRevision(row.server_revision) || row.server_revision === 0) throw new FoodLogSyncError("malformed");
  return { ...row };
}
export function serverFood(row: ServerFoodLog): FoodLog {
  return { id: row.id, foodName: row.food_name, calories: row.calories, protein: row.protein,
    carbs: row.carbs, fat: row.fat, mealType: row.meal_type as FoodLog["mealType"],
    createdAt: row.client_created_at, loggedDate: row.logged_date };
}
function timestampKey(value: string): string {
  const fraction = /\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  const whole = value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, "");
  return `${Date.parse(whole)}:${fraction.replace(/0+$/, "")}`;
}
export function sameFood(a: FoodLog, b: FoodLog): boolean {
  return a.id === b.id && a.foodName === b.foodName && a.calories === b.calories &&
    a.protein === b.protein && a.carbs === b.carbs && a.fat === b.fat &&
    a.mealType === b.mealType && a.loggedDate === b.loggedDate && timestampKey(a.createdAt) === timestampKey(b.createdAt);
}
export function jsonBytes(value: unknown): number {
  let bytes = 0;
  for (const char of JSON.stringify(value)) {
    const point = char.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}
