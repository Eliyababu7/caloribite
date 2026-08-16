import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { PostgrestClient } from "@supabase/postgrest-js";
import { createClient, processLock } from "@supabase/supabase-js";
import { Platform } from "react-native";

import type { Database } from "../../types/database";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

const configuredSupabaseUrl = supabaseUrl;
const configuredSupabasePublishableKey = supabasePublishableKey;

export const supabase = createClient<Database>(
  configuredSupabaseUrl,
  configuredSupabasePublishableKey,
  {
    auth: {
      ...(Platform.OS === "web" ? {} : { storage: AsyncStorage }),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  },
);

export function createSessionBoundPostgrestClient(
  accessToken: string,
): PostgrestClient<Database> {
  return new PostgrestClient<Database>(
    `${configuredSupabaseUrl.replace(/\/$/, "")}/rest/v1`,
    {
      schema: "public",
      headers: {
        apikey: configuredSupabasePublishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
}
