import { createClient } from "@supabase/supabase-js";

const backendUrl = import.meta.env.VITE_SUPABASE_URL;
const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(backendUrl && publicAnonKey);

if (!isSupabaseConfigured) {
  console.warn("SafeMind backend is not configured. Add the public backend URL and anonymous key to the environment.");
}

export const supabase = isSupabaseConfigured
  ? createClient(backendUrl, publicAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;
