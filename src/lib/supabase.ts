import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// ──────────────────────────────────────────────────────────────
// Supabase client for the multi-user DeanDB platform.
//
// Auth is real Supabase Auth (email + password, with optional TOTP MFA). The session is persisted by
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
        // PKCE (the supabase-js default) secures the only remaining email-link
        // flow — password recovery / email confirmation. Password sign-in and
        // TOTP don't use the URL flow at all. A recovery link must be opened in
        // the same browser that requested it to complete the exchange — standard
        // and acceptable for the occasional reset.
        flowType: "pkce",
        // Parse the recovery/confirmation token on return (drives the
        // PASSWORD_RECOVERY event), then strip it so the hash router never sees it.
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
