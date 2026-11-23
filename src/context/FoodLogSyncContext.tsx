import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { useAuth } from "./AuthContext";
import { useFoodLogs } from "./FoodLogContext";
import { createFoodLogBackupCoordinator, type BackupInput, type BackupSnapshot } from "../services/foodLogs/foodLogBackupCoordinator";
import { createBackupPreferenceStorage, foodLogRolloutEnabled } from "../services/foodLogs/foodLogBackupPreferences";
import { foodLogStorage } from "../services/foodLogs/localFoodLogStorage";
import { createFoodLogsRepository } from "../services/supabase/foodLogsRepository";
import { createSessionBoundPostgrestClient } from "../services/supabase/supabaseClient";
import { confirmAction } from "../utils/confirmAction";
import { foodLogCoordination } from "../services/foodLogs/platformFoodLogCoordination";

type BackupContextValue = BackupSnapshot & {
  enable: () => Promise<boolean>; disable: () => Promise<boolean>;
  retryChoice: () => Promise<boolean>; syncNow: () => Promise<void>;
};
const BackupContext = createContext<BackupContextValue | undefined>(undefined);
const preferences = createBackupPreferenceStorage(AsyncStorage, foodLogCoordination);

export function FoodLogSyncProvider({ children }: { children: ReactNode }) {
  const { authIdentity, session, recoveryState, isLoading, isSigningOut } = useAuth();
  const { foodStorageHydrationState } = useFoodLogs();
  const rollout = foodLogRolloutEnabled(process.env.EXPO_PUBLIC_FOOD_LOG_CLOUD_SYNC_ENABLED);
  const input: BackupInput = { rollout, owner: authIdentity, token: session?.access_token ?? null,
    normal: !isLoading && !isSigningOut && recoveryState === "idle" && !!authIdentity && session?.user.id === authIdentity.userId,
    hydrated: foodStorageHydrationState === "ready" };
  const live = useRef(input); live.current = input;
  const [, update] = useState(0);
  const controllerRef = useRef<ReturnType<typeof createFoodLogBackupCoordinator> | null>(null);
  if (!controllerRef.current) controllerRef.current = createFoodLogBackupCoordinator({
    input: () => live.current, preferences, storage: foodLogStorage,
    changed: () => update(version => version + 1),
    confirm: explanation => confirmAction({ title: "Enable diary cloud backup?", message: explanation, confirmLabel: "Enable cloud backup" }),
    repository: (owner, token, currentOwner, signal) => createFoodLogsRepository(owner, token, fixedToken => {
      const client = createSessionBoundPostgrestClient(fixedToken);
      return { rpc: (name, args) => client.rpc(name, args).abortSignal(signal) };
    }, currentOwner),
  });
  const controller = controllerRef.current;
  useEffect(() => {
    controller.configure();
  }, [controller, rollout, authIdentity, input.token, input.normal, input.hydrated]);
  useEffect(() => {
    if (!authIdentity) return;
    return foodLogStorage.subscribe(authIdentity.userId, controller.observe);
  }, [controller, authIdentity]);
  useEffect(() => {
    let mounted = true;
    const network = (state: Network.NetworkState) => {
      if (!mounted) return;
      controller.setNetwork(state.isConnected === false || state.isInternetReachable === false ? false : state.isConnected === true ? true : null);
    };
    let subscription: ReturnType<typeof Network.addNetworkStateListener> | undefined;
    try { subscription = Network.addNetworkStateListener(network); } catch { /* Local diary stays available. */ }
    void Network.getNetworkStateAsync().then(network).catch(() => { if (mounted) controller.setNetwork(null); });
    let previous = AppState.currentState;
    const foreground = AppState.addEventListener("change", state => {
      if (state === "active" && previous !== "active") void controller.trigger();
      previous = state;
    });
    return () => { mounted = false; subscription?.remove(); foreground.remove(); controller.dispose(); };
  }, [controller]);
  return <BackupContext.Provider value={{ ...controller.snapshot(), enable: controller.enable, disable: controller.disable,
    retryChoice: controller.retryChoice, syncNow: async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        controller.setNetwork(state.isConnected === false || state.isInternetReachable === false ? false : state.isConnected === true ? true : null);
      } catch { /* A connectivity query must not affect local diary use. */ }
      await controller.trigger();
    } }}>{children}</BackupContext.Provider>;
}
export function useFoodLogBackup() {
  const context = useContext(BackupContext);
  if (!context) throw new Error("useFoodLogBackup must be used inside FoodLogSyncProvider");
  return context;
}
