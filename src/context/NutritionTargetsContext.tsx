import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { type AuthIdentity, useAuth } from "./AuthContext";
import {
  createPendingMutation,
  createStoredTargets,
  isConflictError,
  isNutritionTargets,
  parseNutritionTargetsRow,
  parseStoredTargets,
  storeServerRow,
  type PendingNutritionTargetsMutation,
  type StoredNutritionTargets,
} from "../services/nutrition/nutritionTargetsSync";
import { supabase } from "../services/supabase/supabaseClient";
import type { NutritionTargets } from "../types/nutrition";

type NutritionTargetsHydrationState = "signed-out" | "loading" | "ready" | "error";
type OwnedTargets = { owner: AuthIdentity; stored: StoredNutritionTargets };
type SaveOperation = { id: symbol; owner: AuthIdentity };
type NutritionTargetsContextType = {
  nutritionTargets: NutritionTargets | null;
  hydrationState: NutritionTargetsHydrationState;
  hydrationError: string | null;
  isSaving: boolean;
  saveTargets: (targets: NutritionTargets, expectedOwner: AuthIdentity) => Promise<boolean>;
  retryHydration: () => void;
};

const STORAGE_KEY_PREFIX = "caloribite_nutrition_targets:user:";
const HYDRATION_ERROR_MESSAGE = "Your nutrition targets could not be loaded. Please try again.";
const storageWriteQueues = new Map<string, Promise<void>>();
const NutritionTargetsContext = createContext<NutritionTargetsContextType | undefined>(undefined);

function identitiesMatch(first: AuthIdentity | null, second: AuthIdentity | null) {
  return first !== null && second !== null &&
    first.userId === second.userId && first.generation === second.generation;
}

function enqueueStorageWrite(storageKey: string, stored: StoredNutritionTargets) {
  const previousWrite = storageWriteQueues.get(storageKey) ?? Promise.resolve();
  const write = previousWrite.catch(() => undefined)
    .then(() => AsyncStorage.setItem(storageKey, JSON.stringify(stored)));
  storageWriteQueues.set(storageKey, write);
  const removeCompletedWrite = () => {
    if (storageWriteQueues.get(storageKey) === write) storageWriteQueues.delete(storageKey);
  };
  void write.then(removeCompletedWrite, removeCompletedWrite);
  return write;
}

async function waitForQueuedStorageWrite(storageKey: string) {
  const queuedWrite = storageWriteQueues.get(storageKey);
  if (queuedWrite) await queuedWrite.catch(() => undefined);
}

async function fetchServerTargets(userId: string) {
  const { data, error } = await supabase.from("nutrition_targets")
    .select("user_id, calories, protein, carbs, fat, revision, updated_at, last_mutation_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data === null ? null : parseNutritionTargetsRow(data);
}

async function invokeApplyTargets(owner: AuthIdentity, mutation: PendingNutritionTargetsMutation) {
  const { data, error } = await supabase.rpc("apply_nutrition_targets", {
    p_calories: mutation.targets.calories,
    p_protein: mutation.targets.protein,
    p_carbs: mutation.targets.carbs,
    p_fat: mutation.targets.fat,
    p_base_revision: mutation.baseRevision,
    p_mutation_id: mutation.id,
  });
  if (error) throw error;
  const row = parseNutritionTargetsRow(data);
  if (row.user_id !== owner.userId) {
    throw new Error("Nutrition-target server response has the wrong owner");
  }
  return row;
}

async function applyWithConflictRetry(
  owner: AuthIdentity,
  mutation: PendingNutritionTargetsMutation,
  storageKey: string,
) {
  try {
    return await invokeApplyTargets(owner, mutation);
  } catch (error) {
    if (!isConflictError(error)) throw error;
    const latest = await fetchServerTargets(owner.userId);
    if (latest === null) throw error;
    const rebasedMutation = { ...mutation, baseRevision: latest.revision };
    const pendingStored = storeServerRow(latest);
    pendingStored.targets = { ...mutation.targets };
    pendingStored.pendingMutation = rebasedMutation;
    await enqueueStorageWrite(storageKey, pendingStored);
    return invokeApplyTargets(owner, rebasedMutation);
  }
}

export function NutritionTargetsProvider({ children }: { children: ReactNode }) {
  const { authIdentity } = useAuth();
  const authIdentityRef = useRef(authIdentity);
  authIdentityRef.current = authIdentity;
  const [ownedTargets, setOwnedTargets] = useState<OwnedTargets | null>(null);
  const [failedOwner, setFailedOwner] = useState<AuthIdentity | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [, setSaveStateVersion] = useState(0);
  const loadOperationRef = useRef<symbol | null>(null);
  const saveOperationRef = useRef<SaveOperation | null>(null);
  const readyIdentityRef = useRef<AuthIdentity | null>(null);
  const storedTargetsRef = useRef<StoredNutritionTargets | null>(null);

  useEffect(() => {
    const loadId = Symbol("nutritionTargetsLoad");
    loadOperationRef.current = loadId;
    readyIdentityRef.current = null;
    storedTargetsRef.current = null;
    setOwnedTargets(null);
    setFailedOwner(null);
    if (authIdentity === null) return;
    const owner = authIdentity;
    const storageKey = `${STORAGE_KEY_PREFIX}${owner.userId}`;

    const publishReady = (stored: StoredNutritionTargets) => {
      if (loadOperationRef.current === loadId && identitiesMatch(authIdentityRef.current, owner)) {
        readyIdentityRef.current = owner;
        storedTargetsRef.current = stored;
        setOwnedTargets({ owner, stored });
      }
    };

    const loadTargets = async () => {
      try {
        await waitForQueuedStorageWrite(storageKey);
        const savedTargets = await AsyncStorage.getItem(storageKey);
        let stored = createStoredTargets();
        if (savedTargets !== null) {
          try { stored = parseStoredTargets(savedTargets); } catch { stored = createStoredTargets(); }
        }
        const serverTargets = await fetchServerTargets(owner.userId);
        if (stored.pendingMutation) {
          stored = storeServerRow(await applyWithConflictRetry(owner, stored.pendingMutation, storageKey));
        } else if (serverTargets) {
          stored = storeServerRow(serverTargets);
        } else {
          const mutation = createPendingMutation(stored.targets, 0);
          stored.pendingMutation = mutation;
          await enqueueStorageWrite(storageKey, stored);
          stored = storeServerRow(await applyWithConflictRetry(owner, mutation, storageKey));
        }
        await enqueueStorageWrite(storageKey, stored);
        publishReady(stored);
      } catch {
        if (loadOperationRef.current === loadId && identitiesMatch(authIdentityRef.current, owner)) {
          readyIdentityRef.current = null;
          storedTargetsRef.current = null;
          setFailedOwner(owner);
        }
      }
    };
    void loadTargets();
    return () => {
      if (loadOperationRef.current === loadId) loadOperationRef.current = null;
    };
  }, [authIdentity, retryCount]);

  const targetsBelongToCurrentIdentity = identitiesMatch(ownedTargets?.owner ?? null, authIdentity);
  const nutritionTargets = targetsBelongToCurrentIdentity ? ownedTargets!.stored.targets : null;
  const hydrationState: NutritionTargetsHydrationState = authIdentity === null ? "signed-out"
    : identitiesMatch(failedOwner, authIdentity) ? "error"
      : targetsBelongToCurrentIdentity ? "ready" : "loading";
  const hydrationError = hydrationState === "error" ? HYDRATION_ERROR_MESSAGE : null;
  const activeSave = saveOperationRef.current;
  const isSaving = activeSave !== null && identitiesMatch(activeSave.owner, authIdentity);

  const retryHydration = useCallback(() => {
    if (authIdentityRef.current !== null && identitiesMatch(failedOwner, authIdentityRef.current)) {
      setRetryCount((count) => count + 1);
    }
  }, [failedOwner]);

  const saveTargets = useCallback(async (targets: NutritionTargets, expectedOwner: AuthIdentity) => {
    const currentSave = saveOperationRef.current;
    const currentStored = storedTargetsRef.current;
    if (!identitiesMatch(authIdentityRef.current, expectedOwner) ||
      !identitiesMatch(readyIdentityRef.current, expectedOwner) ||
      !isNutritionTargets(targets) || currentStored === null ||
      (currentSave !== null && identitiesMatch(currentSave.owner, expectedOwner))) return false;

    const operation: SaveOperation = { id: Symbol("nutritionTargetsSave"), owner: expectedOwner };
    const storageKey = `${STORAGE_KEY_PREFIX}${expectedOwner.userId}`;
    const mutation = createPendingMutation(targets, currentStored.revision);
    const pendingStored: StoredNutritionTargets = {
      ...currentStored,
      targets: { ...targets },
      pendingMutation: mutation,
    };
    saveOperationRef.current = operation;
    setSaveStateVersion((version) => version + 1);
    try {
      await enqueueStorageWrite(storageKey, pendingStored);
      const syncedStored = storeServerRow(
        await applyWithConflictRetry(expectedOwner, mutation, storageKey),
      );
      await enqueueStorageWrite(storageKey, syncedStored);
      if (saveOperationRef.current?.id !== operation.id ||
        !identitiesMatch(authIdentityRef.current, expectedOwner)) return false;
      storedTargetsRef.current = syncedStored;
      setOwnedTargets({ owner: expectedOwner, stored: syncedStored });
      setFailedOwner(null);
      return true;
    } catch {
      return false;
    } finally {
      if (saveOperationRef.current?.id === operation.id) {
        saveOperationRef.current = null;
        if (identitiesMatch(authIdentityRef.current, expectedOwner)) {
          setSaveStateVersion((version) => version + 1);
        }
      }
    }
  }, []);

  return <NutritionTargetsContext.Provider value={{
    nutritionTargets, hydrationState, hydrationError, isSaving, saveTargets, retryHydration,
  }}>{children}</NutritionTargetsContext.Provider>;
}

export function useNutritionTargets() {
  const context = useContext(NutritionTargetsContext);
  if (!context) throw new Error("useNutritionTargets must be used inside NutritionTargetsProvider");
  return context;
}
