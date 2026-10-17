import * as Network from "expo-network";
import { supabase } from "../supabase/supabaseClient";
import { createFoodSearchService } from "./foodSearchService";

export const foodSearchClient = createFoodSearchService(
  async (body, signal) => {
    const { data, error } = await supabase.functions.invoke("food-search", { body, signal });
    return { data, error };
  },
  async () => {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected !== false && state.isInternetReachable !== false;
  },
);
