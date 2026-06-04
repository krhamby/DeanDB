-- 4b · profiles.skin — cross-device Paper/Midnight skin sync.
--
-- The client (api.ts PROFILE_COLS, ThemeProvider) selects and writes profiles.skin.
-- This column was first applied out-of-band via the SQL Editor (see
-- docs/superpowers/INFRA_SETUP.md §4b); committing it here version-controls the
-- schema so a fresh deploy / CI database has it too. Idempotent — re-applying on a
-- database that already has the column is a no-op (ADD COLUMN IF NOT EXISTS).
--
-- The existing profiles UPDATE policy (own row) already covers skin — no new policy.

alter table public.profiles
  add column if not exists skin text not null default 'paper'
  check (skin in ('paper', 'midnight'));
