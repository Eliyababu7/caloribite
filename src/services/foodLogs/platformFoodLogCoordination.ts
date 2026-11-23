import { Platform } from "react-native";
import { createWebFoodLogCoordination, nativeFoodLogCoordination } from "./foodLogCoordination";

export const foodLogCoordination = Platform.OS === "web"
  ? createWebFoodLogCoordination(() => ({
    locks: typeof navigator === "undefined" ? undefined : navigator.locks,
    subscribeStorage(listener) {
      if (typeof window === "undefined") return () => {};
      const changed = (event: StorageEvent) => {
        if (event.storageArea === window.localStorage) listener(event.key, { oldValue: event.oldValue, newValue: event.newValue });
      };
      window.addEventListener("storage", changed);
      return () => window.removeEventListener("storage", changed);
    },
  }))
  : nativeFoodLogCoordination;
