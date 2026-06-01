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

// Paste your project's anon / publishable key here (Supabase → Project
// Settings → API → "anon public"). Env var wins if provided at build time.
export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";
