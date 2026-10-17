import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { foodSearchClient } from "./foodSearchClient";
import { createSavedFoodStore } from "./savedFoods";
import { createUserFoodSearchService } from "./userFoodSearchService";

const savedFoods = createSavedFoodStore(AsyncStorage, randomUUID);

export function useAccountFoodSearch() {
  const { authIdentity } = useAuth();
  const owner = useRef(authIdentity);
  owner.current = authIdentity;
  useEffect(() => {
    owner.current = authIdentity;
    return () => { owner.current = null; };
  }, [authIdentity]);
  return useMemo(() => {
    const expected = authIdentity;
    return createUserFoodSearchService(foodSearchClient, savedFoods, () => {
      const current = owner.current;
      return current?.userId === expected?.userId && current?.generation === expected?.generation ? current : null;
    });
  }, [authIdentity]);
}
