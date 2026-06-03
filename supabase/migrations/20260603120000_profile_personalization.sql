-- ============================================================================
-- DeanDB · profile personalization
-- ----------------------------------------------------------------------------
-- Adds a short "meter name" (used for per-journey labels like "Kevin Meter")
-- and two theme accent colors that recolor the app. All nullable — null falls
-- back to the display name's first word / the default gold + red accents.
-- Additive and idempotent; existing profiles RLS policies already cover the
-- new columns (row-level, not column-level).
-- ============================================================================

alter table public.profiles
  add column if not exists meter_name      text,
  add column if not exists theme_accent    text,
  add column if not exists theme_secondary text;
