import type { createFoodLogStorage, FoodLogEnvelope } from "./foodLogStorage";
import { mergeFoodLogChanges } from "./foodLogReconciliation";
import { FoodLogSyncError, MAX_BATCH_BYTES, MAX_BATCH_SIZE, isRevision, jsonBytes,
  ownerMatches, type FoodLogOwner, type FoodLogSyncFailureKind } from "./foodLogSyncTypes";
import { mapFoodLogMutation, type FoodLogsRepository, type ReplayMutation } from "../supabase/foodLogsRepository";

type Store = Pick<ReturnType<typeof createFoodLogStorage>, "update">;
export type FoodLogSyncResult =
  | { status: "complete" | "bounded" | "stale" }
  | { status: "paused"; kind: FoodLogSyncFailureKind; operationIds: string[] };

function replayBatch(envelope: FoodLogEnvelope, size: number): ReplayMutation[] {
  const entries = new Map(envelope.entries.map(entry => [entry.food.id, entry]));
  const batch: ReplayMutation[] = [];
  let bytes = 2; // JSON array brackets.
  for (const operation of envelope.outbox.slice(0, size)) {
    const entry = entries.get(operation.entryId);
    if (!entry) throw new FoodLogSyncError("storage");
    const candidate = { operation, entry };
    const candidateBytes = jsonBytes(mapFoodLogMutation(candidate)) + (batch.length ? 1 : 0);
    if (bytes + candidateBytes > MAX_BATCH_BYTES) {
      if (batch.length === 0) throw new FoodLogSyncError("validation");
      break;
    }
    batch.push(candidate);
    bytes += candidateBytes;
  }
  return batch;
}
function pullPosition(envelope: FoodLogEnvelope) {
  const raw = envelope.pull.cursor;
  const cursor = raw === null ? 0 : /^(0|[1-9]\d*)$/.test(raw) ? Number(raw) : NaN;
  const watermark = envelope.pull.watermark ?? null;
  if (!isRevision(cursor) || (watermark !== null && (!isRevision(watermark) || watermark < cursor))) throw new FoodLogSyncError("storage");
  return { cursor, watermark };
}
// Explicit, bounded invocation only: no singleton, timers, subscriptions or UI.
export async function synchronizeFoodLogs(options: {
  repository: FoodLogsRepository;
  storage: Store;
  owner: FoodLogOwner;
  currentOwner: () => FoodLogOwner | null;
  batchSize?: number;
  maxReplayBatches?: number;
  maxPullPages?: number;
}): Promise<FoodLogSyncResult> {
  const { repository, storage, currentOwner } = options;
  const owner = { ...options.owner };
  const isCurrent = () => ownerMatches(currentOwner(), owner) && ownerMatches(repository.owner, owner);
  const guard = () => { if (!isCurrent()) throw new FoodLogSyncError("stale"); };
  const batchSize = options.batchSize ?? MAX_BATCH_SIZE;
  const replayLimit = options.maxReplayBatches ?? 10;
  const pageLimit = options.maxPullPages ?? 10;
  let operationIds: string[] = [];
  async function update(transform?: (latest: FoodLogEnvelope) => FoodLogEnvelope) {
    guard();
    let transformError: unknown;
    try {
      const envelope = await storage.update(owner.userId, isCurrent, latest => {
        guard();
        try { return transform ? transform(latest) : latest; }
        catch (error) { transformError = error; throw error; }
      });
      guard(); return envelope;
    } catch (error) {
      guard();
      if (error === transformError && error instanceof FoodLogSyncError) throw error;
      throw new FoodLogSyncError("storage");
    }
  }
  async function finalizeAcknowledgements() {
    return update(latest => {
      if (!latest.acknowledgements?.length) return latest;
      const ids = new Set(latest.acknowledgements.map(ack => ack.operationId));
      return { ...latest, outbox: latest.outbox.filter(op => !ids.has(op.id)), acknowledgements: [] };
    });
  }
  try {
    guard();
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE ||
        !Number.isInteger(replayLimit) || replayLimit < 0 || replayLimit > 100 ||
        !Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) throw new FoodLogSyncError("validation");
    let envelope = await finalizeAcknowledgements();
    guard();
    for (let i = 0; i < replayLimit && envelope.outbox.length; i++) {
      operationIds = envelope.outbox.slice(0, batchSize).map(op => op.id);
      const batch = replayBatch(envelope, batchSize);
      operationIds = batch.map(item => item.operation.id);
      guard();
      const rows = await repository.apply(batch);
      guard();
      // First durably record receipts + canonical rows while retaining outbox.
      // A separate queued write can then remove only those acknowledged IDs.
      await update(latest => {
        const merged = mergeFoodLogChanges(latest, rows);
        const pending = new Set(latest.outbox.map(op => op.id));
        const receipts = new Map((latest.acknowledgements ?? []).map(ack => [ack.operationId, ack]));
        for (const item of batch) if (pending.has(item.operation.id)) {
          receipts.set(item.operation.id, { operationId: item.operation.id, entryId: item.operation.entryId });
        }
        return { ...merged, acknowledgements: [...receipts.values()] };
      });
      guard();
      envelope = await finalizeAcknowledgements();
      guard();
    }
    operationIds = [];
    // Pulls remain useful even if a bounded replay leaves new operations queued.
    for (let i = 0; i < pageLimit; i++) {
      const position = pullPosition(envelope);
      guard();
      const page = await repository.pull(position.cursor, batchSize, position.watermark);
      guard();
      envelope = await update(latest => {
        const latestPosition = pullPosition(latest);
        // Another invocation may have advanced this cursor while RPC was pending.
        // Never overwrite its progress with a captured page; restart next run.
        if (latestPosition.cursor !== position.cursor || latestPosition.watermark !== position.watermark) throw new FoodLogSyncError("conflict");
        const merged = mergeFoodLogChanges(latest, page.changes);
        return { ...merged, pull: { ...latest.pull, cursor: String(page.nextCursor),
          watermark: page.hasMore ? page.watermark : null } };
      });
      guard();
      if (!page.hasMore) return { status: envelope.outbox.length ? "bounded" : "complete" };
    }
    return { status: "bounded" };
  } catch (error) {
    if (!isCurrent() || (error instanceof FoodLogSyncError && error.kind === "stale")) return { status: "stale" };
    return { status: "paused", kind: error instanceof FoodLogSyncError ? error.kind : "transport", operationIds };
  }
}
