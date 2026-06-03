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

-- Enforce the same shape the client guarantees, at the database boundary: the
-- theme colors are applied to *other* users' CSS, so the DB is the right place
-- to reject anything but a 6-digit hex (defense-in-depth alongside the JS
-- isHexColor guard), and to bound the free-text label. Wrapped so re-running
-- the migration doesn't error on already-present constraints.
do $$ begin
  alter table public.profiles
    add constraint profiles_theme_accent_hex
      check (theme_accent is null or theme_accent ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles
    add constraint profiles_theme_secondary_hex
      check (theme_secondary is null or theme_secondary ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles
    add constraint profiles_meter_name_len
      check (meter_name is null or char_length(meter_name) <= 40);
exception when duplicate_object then null; end $$;
