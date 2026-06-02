import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// ──────────────────────────────────────────────────────────────
// Supabase client for the multi-user DeanDB platform.
//
// Auth is real Supabase Auth (email magic link). The session is persisted by
// supabase-js itself (sb-<ref>-auth-token in localStorage), so users stay
// logged in across visits. Every table is gated by RLS keyed on auth.uid(),
// so the public anon key is safe by design (see supabase/schema.sql).
// ──────────────────────────────────────────────────────────────

export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** The shared client. Null only if the backend is unconfigured (build error state). */
export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Parse the magic-link token fragment on return, then strip it from the
        // URL so our hash router never sees the #access_token=… payload.
        detectSessionInUrl: true,
      },
    })
  : null;

/** Throws a clear error if code paths that need the backend run without it. */
export function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in src/lib/config.ts.",
    );
  }
  return supabase;
}

/** Where magic links should return the user — under the Pages base path + hash. */
export function authRedirectTo(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/me`;
}
