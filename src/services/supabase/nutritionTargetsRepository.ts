import type { PostgrestClient, PostgrestError } from "@supabase/postgrest-js";

import {
  NUTRITION_TARGET_LIMITS,
  type NutritionTargets,
} from "../../types/nutrition";
import type { Database } from "../../types/database";
import { createSessionBoundPostgrestClient } from "./supabaseClient";

export type SynchronizedNutritionTargets = {
  targets: NutritionTargets;
  revision: number;
  updatedAt: string;
  lastMutationId: string;
};

export type NutritionTargetsRepositoryFailure = {
  kind: "authentication" | "validation" | "conflict" | "transport" | "database";
};

export type FetchNutritionTargetsResult =
  | { status: "found"; value: SynchronizedNutritionTargets }
  | { status: "missing" }
  | { status: "failure"; failure: NutritionTargetsRepositoryFailure };

export type ApplyNutritionTargetsResult =
  | { status: "applied"; value: SynchronizedNutritionTargets }
  | { status: "failure"; failure: NutritionTargetsRepositoryFailure };

export type NutritionTargetsRepository = {
  fetch: () => Promise<FetchNutritionTargetsResult>;
  apply: (
    targets: NutritionTargets,
    baseRevision: number,
    mutationId: string,
  ) => Promise<ApplyNutritionTargetsResult>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isTargetValue(
  value: unknown,
  limits: Readonly<{ min: number; max: number }>,
) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= limits.min &&
    value <= limits.max
  );
}

export function areValidNutritionTargets(
  value: unknown,
): value is NutritionTargets {
  if (typeof value !== "object" || value === null) return false;
  const targets = value as Record<string, unknown>;

  return (
    isTargetValue(targets.calories, NUTRITION_TARGET_LIMITS.calories) &&
    isTargetValue(targets.protein, NUTRITION_TARGET_LIMITS.protein) &&
    isTargetValue(targets.carbs, NUTRITION_TARGET_LIMITS.carbs) &&
    isTargetValue(targets.fat, NUTRITION_TARGET_LIMITS.fat)
  );
}

function isValidTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function mapDatabaseValue(value: unknown): SynchronizedNutritionTargets | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const targets = {
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
  };

  if (
    !areValidNutritionTargets(targets) ||
    typeof row.revision !== "number" ||
    !Number.isSafeInteger(row.revision) ||
    row.revision <= 0 ||
    !isValidTimestamp(row.updated_at) ||
    !isValidUuid(row.last_mutation_id)
  ) {
    return null;
  }

  return {
    targets,
    revision: row.revision,
    updatedAt: row.updated_at,
    lastMutationId: row.last_mutation_id,
  };
}

function classifyError(error: PostgrestError): NutritionTargetsRepositoryFailure {
  if (error.code === "42501" || error.code === "PGRST301" || error.code === "PGRST302") {
    return { kind: "authentication" };
  }
  if (error.code === "22023") return { kind: "validation" };
  if (error.code === "40001") return { kind: "conflict" };
  if (
    error.code === "" ||
    error.code === "PGRST000" ||
    /fetch|network|offline|timeout|connection/i.test(error.message)
  ) {
    return { kind: "transport" };
  }
  return { kind: "database" };
}

function classifyHttpStatus(status: number): NutritionTargetsRepositoryFailure {
  if (status === 401 || status === 403) return { kind: "authentication" };
  if (status === 502 || status === 503 || status === 504) {
    return { kind: "transport" };
  }
  return { kind: "database" };
}

async function fetchNutritionTargets(
  client: PostgrestClient<Database>,
): Promise<FetchNutritionTargetsResult> {
  try {
    const response = await client
      .from("nutrition_targets")
      .select("calories, protein, carbs, fat, revision, updated_at, last_mutation_id")
      .maybeSingle();

    if (response.error) {
      return { status: "failure", failure: classifyError(response.error) };
    }
    if (response.status < 200 || response.status >= 300) {
      return {
        status: "failure",
        failure: classifyHttpStatus(response.status),
      };
    }
    if (response.data === null) return { status: "missing" };
    const value = mapDatabaseValue(response.data);
    return value
      ? { status: "found", value }
      : { status: "failure", failure: { kind: "validation" } };
  } catch {
    return { status: "failure", failure: { kind: "transport" } };
  }
}

async function applyNutritionTargets(
  client: PostgrestClient<Database>,
  targets: NutritionTargets,
  baseRevision: number,
  mutationId: string,
): Promise<ApplyNutritionTargetsResult> {
  if (
    !areValidNutritionTargets(targets) ||
    !Number.isSafeInteger(baseRevision) ||
    baseRevision < 0 ||
    !isValidUuid(mutationId)
  ) {
    return { status: "failure", failure: { kind: "validation" } };
  }

  try {
    const response = await client.rpc("apply_nutrition_targets", {
      p_base_revision: baseRevision,
      p_calories: targets.calories,
      p_carbs: targets.carbs,
      p_fat: targets.fat,
      p_mutation_id: mutationId,
      p_protein: targets.protein,
    });

    if (response.error) {
      return { status: "failure", failure: classifyError(response.error) };
    }
    if (response.status < 200 || response.status >= 300) {
      return {
        status: "failure",
        failure: classifyHttpStatus(response.status),
      };
    }
    const value = mapDatabaseValue(response.data);
    return value
      ? { status: "applied", value }
      : { status: "failure", failure: { kind: "validation" } };
  } catch {
    return { status: "failure", failure: { kind: "transport" } };
  }
}

export function createNutritionTargetsRepository(
  accessToken: string,
): NutritionTargetsRepository {
  const client = createSessionBoundPostgrestClient(accessToken);
  return {
    fetch: () => fetchNutritionTargets(client),
    apply: (targets, baseRevision, mutationId) =>
      applyNutritionTargets(client, targets, baseRevision, mutationId),
  };
}
