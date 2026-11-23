import { FOOD_LOG_BACKUP_EXPLANATION, FoodLogConsentDisabledError, type BackupStatus, type BackupPreference, type createBackupPreferenceStorage,
  type StoredBackupStatus } from "./foodLogBackupPreferences";
import type { createFoodLogStorage, FoodLogEnvelope } from "./foodLogStorage";
import { FoodLogSyncError, ownerMatches, type FoodLogOwner } from "./foodLogSyncTypes";
import { synchronizeFoodLogs } from "./foodLogSync";
import type { FoodLogsRepository } from "../supabase/foodLogsRepository";

export type BackupInput = {
  rollout: boolean; owner: FoodLogOwner | null; token: string | null; normal: boolean; hydrated: boolean;
};
export type BackupSnapshot = {
  available: boolean; enabled: boolean; busy: boolean; status: BackupStatus;
  preferenceError: string | null;
};
type Dependencies = {
  input: () => BackupInput;
  preferences: ReturnType<typeof createBackupPreferenceStorage>;
  storage: Pick<ReturnType<typeof createFoodLogStorage>, "update">;
  repository: (owner: FoodLogOwner, token: string, currentOwner: () => FoodLogOwner | null, signal: AbortSignal) => FoodLogsRepository;
  confirm: (explanation: string) => Promise<boolean>;
  changed: () => void;
  synchronize?: typeof synchronizeFoodLogs;
};

export function createFoodLogBackupCoordinator(deps: Dependencies) {
  let scope: FoodLogOwner | null = null;
  let preference: BackupPreference | null = null;
  let loaded = false;
  let choiceBusy = false;
  let choiceVersion = 0;
  let pendingChoice: boolean | null = null;
  let preferenceError: string | null = null;
  let status: BackupStatus = "device";
  let online: boolean | null = null;
  let disposed = false;
  let epoch = 0;
  let active: Promise<void> | null = null;
  let abort: AbortController | null = null;
  let deferred = false;
  let binding: BackupInput | null = null;
  let knownOperations = new Set<string>();
  let hasPending = false;
  let changeVersion = 0;
  const choiceSource = Symbol("backup-choice");
  let unsubscribePreference: (() => void) | null = null;
  const currentScope = () => !disposed && scope !== null && ownerMatches(deps.input().owner, scope) && deps.input().normal;
  const eligible = () => currentScope() && loaded && preference?.enabled === true && deps.input().rollout &&
    deps.input().hydrated && !!deps.input().token;
  const emit = () => { if (!disposed) deps.changed(); };
  const invalidate = () => { epoch++; abort?.abort(); deferred = false; };
  function loadPreference(owner: FoodLogOwner) {
    const readChoiceVersion = choiceVersion;
    const isCurrent = () => currentScope() && ownerMatches(scope, owner) && choiceVersion === readChoiceVersion;
    void deps.preferences.read(owner.userId, isCurrent).then(value => {
      if (!isCurrent() || choiceVersion !== readChoiceVersion) return;
      preference = value; loaded = true; status = value.enabled ? value.lastStatus ?? "pending" : "device"; emit();
      if (eligible()) { if (active) deferred = true; else void trigger(); }
    });
  }
  function preferenceChanged(source?: symbol) {
    if (source === choiceSource || !currentScope()) return;
    // Invalidate immediately, before asynchronous rehydration of the persisted choice.
    invalidate(); choiceVersion++; preference = null; loaded = false; choiceBusy = false;
    pendingChoice = null; preferenceError = null; status = "device"; emit();
    loadPreference({ ...scope! });
  }
  function snapshot(): BackupSnapshot {
    const input = deps.input();
    const owned = currentScope();
    const enabled = owned && loaded && preference?.enabled === true;
    return { available: input.rollout, enabled, busy: owned && (choiceBusy || !loaded),
      status: !input.normal || !input.owner ? "sign-in-required" : !input.rollout || !enabled ? "device" : status,
      preferenceError: owned ? preferenceError : null };
  }
  function observe(envelope: FoodLogEnvelope) {
    if (!currentScope() || envelope.userId !== scope!.userId) return;
    changeVersion++;
    const ids = new Set(envelope.outbox.map(op => op.id));
    const added = [...ids].some(id => !knownOperations.has(id));
    knownOperations = ids;
    hasPending = ids.size > 0 || envelope.pull.watermark != null;
    if (!eligible()) return;
    if (!active && hasPending) { status = online === false ? "offline" : "pending"; emit(); }
    if (added && !active) void trigger();
  }
  async function persistStatus(next: StoredBackupStatus, isCurrent: () => boolean) {
    if (!isCurrent() || !scope) return;
    const owner = { ...scope }; const statusEpoch = epoch;
    const guarded = () => isCurrent() && currentScope() && ownerMatches(scope, owner) && epoch === statusEpoch;
    try {
      let final = next === "up-to-date" && hasPending ? "pending" as const : next;
      await deps.preferences.setStatus(owner.userId, final, guarded);
      if (!guarded()) return;
      // Local writes can finish while the status preference itself is saving.
      // Never report "up to date" over an operation added during that await.
      if (final === "up-to-date" && hasPending) {
        final = "pending";
        await deps.preferences.setStatus(owner.userId, final, guarded);
      }
      if (guarded()) { status = final; emit(); }
    } catch {
      if (guarded()) { status = "failed"; emit(); }
    }
  }
  function trigger(): Promise<void> {
    if (!eligible()) return Promise.resolve();
    if (active) return active; // Coalesce repeated triggers; never overlap runs.
    if (online !== true) {
      status = online === false ? "offline" : status === "failed" || status === "sign-in-required" ? status : "pending"; emit();
      if (online === false) void persistStatus("offline", eligible);
      return Promise.resolve();
    }
    const owner = { ...scope! };
    const token = deps.input().token!;
    const runEpoch = epoch;
    const controller = new AbortController(); abort = controller;
    const isCurrent = () => eligible() && epoch === runEpoch && ownerMatches(scope, owner) &&
      deps.input().token === token && online === true && !controller.signal.aborted;
    const currentOwner = () => isCurrent() ? owner : null;
    status = "syncing";
    // Assign active before invoking any dependency, even one that throws.
    const run = Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      try {
        const boundRepository = deps.repository(owner, token, currentOwner, controller.signal);
        const authorized = async <T,>(dispatch: () => Promise<T>): Promise<T> => {
          try {
            return await deps.preferences.withEnabled(owner.userId, isCurrent, dispatch, controller.signal);
          } catch (error) {
            if (error instanceof FoodLogConsentDisabledError) {
              if (isCurrent()) preferenceChanged();
              throw new FoodLogSyncError("stale");
            }
            if (error instanceof FoodLogSyncError) throw error;
            throw new FoodLogSyncError("storage");
          }
        };
        const repository: FoodLogsRepository = {
          owner: boundRepository.owner,
          apply: batch => authorized(() => boundRepository.apply(batch)),
          pull: (cursor, size, watermark) => authorized(() => boundRepository.pull(cursor, size, watermark)),
        };
        if (!isCurrent()) return;
        const result = await (deps.synchronize ?? synchronizeFoodLogs)({ repository, storage: deps.storage, owner, currentOwner });
        if (!isCurrent() || result.status === "stale") return;
        const beforeRead = changeVersion;
        const envelope = await deps.storage.update(owner.userId, isCurrent);
        if (!isCurrent()) return;
        if (beforeRead === changeVersion) {
          knownOperations = new Set(envelope.outbox.map(op => op.id));
          hasPending = envelope.outbox.length > 0 || envelope.pull.watermark != null;
        }
        const next = result.status === "paused"
          ? result.kind === "authentication" ? "sign-in-required" : result.kind === "transport" ? "offline" : "failed"
          : result.status === "bounded" || hasPending ? "pending" : "up-to-date";
        await persistStatus(next, isCurrent);
      } catch {
        if (isCurrent()) await persistStatus("failed", isCurrent);
      }
    }).finally(() => {
      if (active === run) { active = null; abort = null; }
      if (!disposed && deferred) { deferred = false; void trigger(); }
    });
    active = run; emit(); return run;
  }
  function configure() {
    if (disposed) { disposed = false; binding = null; scope = null; loaded = false; }
    const input = deps.input();
    const sameScope = scope !== null && input.owner !== null && ownerMatches(input.owner, scope) && input.normal;
    const changedBinding = !binding || !ownerMatches(input.owner, binding.owner ?? { userId: "", generation: -1 }) ||
      input.token !== binding.token || input.normal !== binding.normal || input.rollout !== binding.rollout || input.hydrated !== binding.hydrated;
    binding = { ...input };
    if (changedBinding) invalidate();
    if (!sameScope) {
      unsubscribePreference?.(); unsubscribePreference = null;
      scope = input.normal && input.owner ? { ...input.owner } : null;
      preference = null; loaded = false; choiceBusy = false; choiceVersion++; pendingChoice = null;
      preferenceError = null; status = "device"; knownOperations = new Set(); hasPending = false;
      const owner = scope;
      emit();
      if (!owner) return;
      unsubscribePreference = deps.preferences.subscribe(owner.userId, preferenceChanged);
      loadPreference(owner);
    } else {
      emit();
      if (changedBinding && eligible()) { if (active) deferred = true; else void trigger(); }
    }
  }
  async function saveChoice(enabled: boolean, owner: FoodLogOwner, version: number) {
    const isCurrent = () => currentScope() && ownerMatches(scope, owner) && version === choiceVersion;
    if (!isCurrent()) return false;
    pendingChoice = enabled; choiceBusy = true; preferenceError = null; emit();
    try {
      const saved = await deps.preferences.setEnabled(owner.userId, enabled, isCurrent, choiceSource);
      if (!isCurrent()) return false;
      preference = saved; loaded = true; pendingChoice = null; status = enabled ? "pending" : "device";
      return true;
    } catch {
      if (isCurrent()) {
        preferenceError = enabled ? "Your backup choice could not be saved. Try again."
          : "Backup is paused for this session, but your choice could not be saved. Retry before restarting the app.";
      }
      return false;
    } finally {
      if (isCurrent()) {
        choiceBusy = false; emit();
        if (enabled && preference?.enabled) { if (active) deferred = true; else void trigger(); }
      }
    }
  }
  return {
    snapshot, configure, trigger, observe,
    async enable() {
      if (!currentScope() || !deps.input().rollout || choiceBusy) return false;
      const owner = { ...scope! }; const version = ++choiceVersion;
      choiceBusy = true; emit();
      let confirmed = false;
      try { confirmed = await deps.confirm(FOOD_LOG_BACKUP_EXPLANATION); } catch { /* Keep disabled. */ }
      if (!currentScope() || !ownerMatches(scope, owner) || version !== choiceVersion || !deps.input().rollout) {
        if (currentScope() && ownerMatches(scope, owner) && version === choiceVersion) { choiceBusy = false; emit(); }
        return false;
      }
      if (!confirmed) { choiceBusy = false; emit(); return false; }
      return saveChoice(true, owner, version);
    },
    disable() {
      if (!currentScope()) return Promise.resolve(false);
      invalidate(); const version = ++choiceVersion;
      preference = { version: 1, userId: scope!.userId, enabled: false, lastStatus: null };
      loaded = true; status = "device"; emit();
      return saveChoice(false, { ...scope! }, version);
    },
    retryChoice() {
      if (!currentScope() || pendingChoice === null || choiceBusy || (pendingChoice && !deps.input().rollout)) return Promise.resolve(false);
      return saveChoice(pendingChoice, { ...scope! }, ++choiceVersion);
    },
    setNetwork(reachable: boolean | null) {
      const previous = online; online = reachable;
      if (reachable !== true) {
        invalidate();
        if (eligible()) { status = reachable === false ? "offline" : "pending"; emit();
          if (reachable === false) void persistStatus("offline", eligible); }
      } else if (previous !== true && eligible()) {
        if (active) deferred = true; else void trigger();
      }
    },
    dispose() { disposed = true; unsubscribePreference?.(); unsubscribePreference = null; invalidate(); },
  };
}
