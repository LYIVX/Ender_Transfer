import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  // eslint-disable-next-line no-var
  var __ftpBrowserSupabase: SupabaseClient | undefined;
}

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const createSupabase = () => {
  if (typeof window !== "undefined") {
    try {
      const projectRef = (() => {
        try {
          const url = new URL(supabaseUrl);
          return url.hostname.split(".")[0] ?? "";
        } catch {
          return "";
        }
      })();
      const legacyKey = "ftpbrowser-auth";
      const defaultKey = projectRef ? `sb-${projectRef}-auth-token` : "";
      if (defaultKey) {
        const legacyValue = window.localStorage.getItem(legacyKey);
        const defaultValue = window.localStorage.getItem(defaultKey);
        if (legacyValue && !defaultValue) {
          window.localStorage.setItem(defaultKey, legacyValue);
        }
      }
    } catch {
      // ignore storage migration errors
    }
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
};

export const supabase = isSupabaseConfigured
  ? (globalThis.__ftpBrowserSupabase ?? (globalThis.__ftpBrowserSupabase = createSupabase()))
  : null;
