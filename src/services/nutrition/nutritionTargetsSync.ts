import {
  DEFAULT_NUTRITION_TARGETS,
  NUTRITION_TARGET_LIMITS,
  type NutritionTargets,
} from "../../types/nutrition";

export type NutritionTargetsRow = NutritionTargets & {
  user_id: string;
  revision: number;
  updated_at: string;
  last_mutation_id: string;
};

export type PendingNutritionTargetsMutation = {
  id: string;
  baseRevision: number;
  targets: NutritionTargets;
};

export type StoredNutritionTargets = {
  version: 2;
  targets: NutritionTargets;
  revision: number;
  updatedAt: string | null;
  lastMutationId: string | null;
  pendingMutation: PendingNutritionTargetsMutation | null;
};

type LegacyStoredNutritionTargets = {
  version: 1;
  targets: NutritionTargets;
};

export const NUTRITION_TARGETS_STORAGE_VERSION = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidTargetValue(
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

export function isNutritionTargets(value: unknown): value is NutritionTargets {
  if (!isRecord(value)) return false;

  return (
    isValidTargetValue(value.calories, NUTRITION_TARGET_LIMITS.calories) &&
    isValidTargetValue(value.protein, NUTRITION_TARGET_LIMITS.protein) &&
    isValidTargetValue(value.carbs, NUTRITION_TARGET_LIMITS.carbs) &&
    isValidTargetValue(value.fat, NUTRITION_TARGET_LIMITS.fat)
  );
}

function isRevision(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isPendingMutation(
  value: unknown,
): value is PendingNutritionTargetsMutation {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isRevision(value.baseRevision) &&
    isNutritionTargets(value.targets)
  );
}

export function createMutationId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);

  if (bytes.every((byte) => byte === 0)) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

export function createPendingMutation(
  targets: NutritionTargets,
  baseRevision: number,
): PendingNutritionTargetsMutation {
  return {
    id: createMutationId(),
    baseRevision,
    targets: { ...targets },
  };
}

export function createStoredTargets(
  targets: NutritionTargets = { ...DEFAULT_NUTRITION_TARGETS },
): StoredNutritionTargets {
  return {
    version: NUTRITION_TARGETS_STORAGE_VERSION,
    targets: { ...targets },
    revision: 0,
    updatedAt: null,
    lastMutationId: null,
    pendingMutation: null,
  };
}

export function parseStoredTargets(savedTargets: string): StoredNutritionTargets {
  const parsed: unknown = JSON.parse(savedTargets);

  if (!isRecord(parsed)) {
    throw new Error("Invalid nutrition-target cache");
  }

  const legacy = parsed as Partial<LegacyStoredNutritionTargets>;
  if (legacy.version === 1 && isNutritionTargets(legacy.targets)) {
    const stored = createStoredTargets(legacy.targets);
    stored.pendingMutation = createPendingMutation(legacy.targets, 0);
    return stored;
  }

  if (
    parsed.version !== NUTRITION_TARGETS_STORAGE_VERSION ||
    !isNutritionTargets(parsed.targets) ||
    !isRevision(parsed.revision) ||
    !(typeof parsed.updatedAt === "string" || parsed.updatedAt === null) ||
    !(typeof parsed.lastMutationId === "string" ||
      parsed.lastMutationId === null) ||
    !(parsed.pendingMutation === null ||
      (isPendingMutation(parsed.pendingMutation) &&
        parsed.pendingMutation.baseRevision === parsed.revision))
  ) {
    throw new Error("Invalid nutrition-target cache");
  }

  return {
    version: NUTRITION_TARGETS_STORAGE_VERSION,
    targets: { ...parsed.targets },
    revision: parsed.revision,
    updatedAt: parsed.updatedAt,
    lastMutationId: parsed.lastMutationId,
    pendingMutation: parsed.pendingMutation
      ? {
          ...parsed.pendingMutation,
          targets: { ...parsed.pendingMutation.targets },
        }
      : null,
  };
}

export function parseNutritionTargetsRow(value: unknown): NutritionTargetsRow {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!isRecord(candidate) || !isNutritionTargets(candidate)) {
    throw new Error("Invalid nutrition-target server response");
  }

  const row = candidate as Record<string, unknown> & NutritionTargets;
  if (
    typeof row.user_id !== "string" ||
    !isRevision(row.revision) ||
    row.revision < 1 ||
    typeof row.updated_at !== "string" ||
    typeof row.last_mutation_id !== "string"
  ) {
    throw new Error("Invalid nutrition-target server response");
  }

  return {
    user_id: row.user_id,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    revision: row.revision,
    updated_at: row.updated_at,
    last_mutation_id: row.last_mutation_id,
  };
}

export function storeServerRow(row: NutritionTargetsRow): StoredNutritionTargets {
  return {
    version: NUTRITION_TARGETS_STORAGE_VERSION,
    targets: {
      calories: row.calories,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
    },
    revision: row.revision,
    updatedAt: row.updated_at,
    lastMutationId: row.last_mutation_id,
    pendingMutation: null,
  };
}

export function isConflictError(error: unknown) {
  if (!isRecord(error)) return false;

  return (
    error.code === "40001" ||
    (typeof error.message === "string" &&
      error.message.includes("nutrition_targets_conflict"))
  );
}
