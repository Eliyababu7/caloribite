import { randomUUID } from "expo-crypto";

import { areValidNutritionTargets } from "../supabase/nutritionTargetsRepository";
import type {
  NutritionTargetsRepository,
  NutritionTargetsRepositoryFailure,
  SynchronizedNutritionTargets,
} from "../supabase/nutritionTargetsRepository";
import {
  DEFAULT_NUTRITION_TARGETS,
  type NutritionTargets,
} from "../../types/nutrition";

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

export type NutritionTargetsSyncResult =
  | { status: "synced"; stored: StoredNutritionTargets }
  | { status: "offline"; stored: StoredNutritionTargets }
  | {
      status: "failure";
      stored: StoredNutritionTargets;
      failure: NutritionTargetsRepositoryFailure;
    }
  | { status: "stale"; stored: StoredNutritionTargets };

type PersistStoredTargets = (stored: StoredNutritionTargets) => Promise<void>;

const STORAGE_VERSION = 2;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isPendingMutation(
  value: unknown,
): value is PendingNutritionTargetsMutation {
  return (
    isRecord(value) &&
    isUuid(value.id) &&
    isRevision(value.baseRevision) &&
    areValidNutritionTargets(value.targets)
  );
}

function copyTargets(targets: NutritionTargets): NutritionTargets {
  return { ...targets };
}

function targetsMatch(first: NutritionTargets, second: NutritionTargets) {
  return (
    first.calories === second.calories &&
    first.protein === second.protein &&
    first.carbs === second.carbs &&
    first.fat === second.fat
  );
}

function isValidStoredMetadata(
  value: Record<string, unknown>,
): value is Record<string, unknown> & {
  revision: number;
  updatedAt: string | null;
  lastMutationId: string | null;
} {
  if (!isRevision(value.revision)) return false;
  if (value.revision === 0) {
    return value.updatedAt === null && value.lastMutationId === null;
  }
  return (
    typeof value.updatedAt === "string" &&
    TIMESTAMP_PATTERN.test(value.updatedAt) &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    isUuid(value.lastMutationId)
  );
}

export function createPendingMutation(
  targets: NutritionTargets,
  baseRevision: number,
): PendingNutritionTargetsMutation {
  return {
    id: randomUUID(),
    baseRevision,
    targets: copyTargets(targets),
  };
}

export function createStoredTargets(
  targets: NutritionTargets = copyTargets(DEFAULT_NUTRITION_TARGETS),
): StoredNutritionTargets {
  return {
    version: STORAGE_VERSION,
    targets: copyTargets(targets),
    revision: 0,
    updatedAt: null,
    lastMutationId: null,
    pendingMutation: null,
  };
}

export function createPendingStoredTargets(
  stored: StoredNutritionTargets,
  targets: NutritionTargets,
): StoredNutritionTargets {
  return {
    ...stored,
    targets: copyTargets(targets),
    pendingMutation: createPendingMutation(targets, stored.revision),
  };
}

export function parseStoredTargets(savedTargets: string): StoredNutritionTargets {
  const parsed: unknown = JSON.parse(savedTargets);
  if (!isRecord(parsed) || !areValidNutritionTargets(parsed.targets)) {
    throw new Error("Invalid nutrition-target cache");
  }

  if (parsed.version === 1) {
    const stored = createStoredTargets(parsed.targets);
    stored.pendingMutation = createPendingMutation(parsed.targets, 0);
    return stored;
  }

  if (
    parsed.version !== STORAGE_VERSION ||
    !isValidStoredMetadata(parsed) ||
    !(parsed.pendingMutation === null || isPendingMutation(parsed.pendingMutation)) ||
    (parsed.pendingMutation !== null &&
      (parsed.pendingMutation.baseRevision !== parsed.revision ||
        !targetsMatch(parsed.targets, parsed.pendingMutation.targets)))
  ) {
    throw new Error("Invalid nutrition-target cache");
  }

  return {
    version: STORAGE_VERSION,
    targets: copyTargets(parsed.targets),
    revision: parsed.revision,
    updatedAt: parsed.updatedAt,
    lastMutationId: parsed.lastMutationId,
    pendingMutation: parsed.pendingMutation
      ? {
          ...parsed.pendingMutation,
          targets: copyTargets(parsed.pendingMutation.targets),
        }
      : null,
  };
}

export function storeSynchronizedTargets(
  value: SynchronizedNutritionTargets,
): StoredNutritionTargets {
  return {
    version: STORAGE_VERSION,
    targets: copyTargets(value.targets),
    revision: value.revision,
    updatedAt: value.updatedAt,
    lastMutationId: value.lastMutationId,
    pendingMutation: null,
  };
}

function preserveFailure(
  stored: StoredNutritionTargets,
  failure: NutritionTargetsRepositoryFailure,
): NutritionTargetsSyncResult {
  return failure.kind === "transport"
    ? { status: "offline", stored }
    : { status: "failure", stored, failure };
}

async function applyPendingMutation(
  repository: NutritionTargetsRepository,
  stored: StoredNutritionTargets,
  isOwnerCurrent: () => boolean,
  persist: PersistStoredTargets,
): Promise<NutritionTargetsSyncResult> {
  const mutation = stored.pendingMutation;
  if (!mutation || !isOwnerCurrent()) return { status: "stale", stored };

  const firstApply = await repository.apply(
    mutation.targets,
    mutation.baseRevision,
    mutation.id,
  );
  if (!isOwnerCurrent()) return { status: "stale", stored };
  if (firstApply.status === "applied") {
    const synced = storeSynchronizedTargets(firstApply.value);
    await persist(synced);
    return { status: "synced", stored: synced };
  }
  if (firstApply.failure.kind !== "conflict") {
    return preserveFailure(stored, firstApply.failure);
  }

  const refreshed = await repository.fetch();
  if (!isOwnerCurrent()) return { status: "stale", stored };
  if (refreshed.status === "failure") {
    return preserveFailure(stored, refreshed.failure);
  }
  if (refreshed.status === "missing") {
    return {
      status: "failure",
      stored,
      failure: { kind: "database" },
    };
  }

  const rebasedMutation = {
    ...mutation,
    baseRevision: refreshed.value.revision,
  };
  const rebasedStored = {
    ...storeSynchronizedTargets(refreshed.value),
    targets: copyTargets(mutation.targets),
    pendingMutation: rebasedMutation,
  };
  await persist(rebasedStored);
  if (!isOwnerCurrent()) return { status: "stale", stored: rebasedStored };

  const secondApply = await repository.apply(
    rebasedMutation.targets,
    rebasedMutation.baseRevision,
    rebasedMutation.id,
  );
  if (!isOwnerCurrent()) return { status: "stale", stored: rebasedStored };
  if (secondApply.status === "failure") {
    return preserveFailure(rebasedStored, secondApply.failure);
  }

  const synced = storeSynchronizedTargets(secondApply.value);
  await persist(synced);
  return { status: "synced", stored: synced };
}

export async function synchronizeNutritionTargets(
  repository: NutritionTargetsRepository,
  stored: StoredNutritionTargets,
  isOwnerCurrent: () => boolean,
  persist: PersistStoredTargets,
): Promise<NutritionTargetsSyncResult> {
  if (stored.pendingMutation) {
    return applyPendingMutation(repository, stored, isOwnerCurrent, persist);
  }
  if (!isOwnerCurrent()) return { status: "stale", stored };

  const fetched = await repository.fetch();
  if (!isOwnerCurrent()) return { status: "stale", stored };
  if (fetched.status === "failure") {
    return preserveFailure(stored, fetched.failure);
  }
  if (fetched.status === "found") {
    const synced = storeSynchronizedTargets(fetched.value);
    await persist(synced);
    return { status: "synced", stored: synced };
  }

  const pending = createPendingStoredTargets(stored, stored.targets);
  await persist(pending);
  return applyPendingMutation(repository, pending, isOwnerCurrent, persist);
}
