// ──────────────────────────────────────────────────────────────
// Supabase configuration for DeanDB.
//
// The anon key is *public by design* — it ships in the browser bundle.
// Security comes from Row Level Security in Supabase (see supabase/schema.sql),
// NOT from hiding this key. Writes are gated behind an editor passcode.
//
// Leave SUPABASE_ANON_KEY empty to disable Supabase entirely; the app then
// falls back to the bundled JSON + localStorage (fully offline-capable).
// ──────────────────────────────────────────────────────────────

export const SUPABASE_URL = "https://ixpxefsjrswujuxmnwkk.supabase.co";

// Project's publishable / anon key (Supabase → Project Settings → API).
// Public-safe by design — RLS does the protecting. Env var wins if set.
export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "sb_publishable_A2LJpp-CHwqN5Q9WNtCHzg_476cUgwu";
