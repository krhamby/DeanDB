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
        // Magic links are emailed and frequently opened in a DIFFERENT browser
        // than the one that requested them. PKCE (the supabase-js default)
        // stashes a code_verifier in the requesting browser's localStorage, so a
        // cross-browser click can't complete the code exchange and the user
        // lands logged out. Implicit flow returns the session straight in the
        // URL fragment, so the link works from any browser/device.
        flowType: "implicit",
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

/**
 * Where magic links return the user. MUST be a plain URL with NO hash fragment:
 * Supabase appends the session (`#access_token=…`) to this URL, and a second
 * `#` mangles the token so the session is never parsed. We return the Pages base
 * path; once the session is detected the app routes a signed-in user to the feed.
 */
export function authRedirectTo(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}
