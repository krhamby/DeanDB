// ──────────────────────────────────────────────────────────────
// Supabase configuration for DeanDB.
//
// The anon key is *public by design* — it ships in the browser bundle.
// Security comes from Row Level Security in Supabase (see supabase/schema.sql),
// NOT from hiding this key. Every row is scoped to the signed-in user via
// auth.uid(); writes are gated by RLS, reads by per-journey visibility.
//
// Auth is email magic link (Supabase Auth). DeanDB requires this backend —
// leaving SUPABASE_ANON_KEY empty shows a "backend not configured" screen.
// ──────────────────────────────────────────────────────────────

export const SUPABASE_URL = "https://ixpxefsjrswujuxmnwkk.supabase.co";

// Project's publishable / anon key (Supabase → Project Settings → API).
// Public-safe by design — RLS does the protecting. Env var wins if set.
export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "sb_publishable_A2LJpp-CHwqN5Q9WNtCHzg_476cUgwu";
