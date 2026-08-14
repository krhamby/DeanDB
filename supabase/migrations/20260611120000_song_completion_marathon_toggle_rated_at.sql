-- ============================================================================
-- DeanDB · Song completion, per-user marathon toggle, and rating recency
-- ----------------------------------------------------------------------------
-- Three additive changes (idempotent — safe to re-run):
--
--   1. user_albums.rated_at — when the album RATING last changed. Fixes the
--      "Latest Verdicts" bug: the Dashboard sorted by date_listened (a day-
--      granularity date set once when the album is first completed), so rating
--      an already-completed album — or a second album on the same day — never
--      surfaced as the freshest verdict. Maintained by trigger so every write
--      path (app, imports, legacy migration) stays correct.
--
--   2. user_tracks.listened — per-song completion. Lets listeners who don't do
--      whole albums mark individual songs as heard. Rated songs are treated as
--      heard (the client enforces this on new writes; the backfill below makes
--      existing rows consistent).
--
--   3. profiles.marathon_enabled — the "chill mode" switch. When false the
--      client hides the goal meter / Summit / Marathon Wheel and presents the
--      journey as a pressure-free listening journal. Purely presentational:
--      no stats are lost by toggling it off and back on.
--
-- Deploy note (skew window): the client merged alongside this file SELECTs all
-- three new columns, and the Pages deploy + this migration ride the same merge.
-- To rule out a client-before-schema window entirely, pre-apply the three
-- `add column if not exists` statements via the SQL editor BEFORE merging
-- (the same out-of-band discipline used for 20260603170000_add_profiles_skin);
-- this whole file stays idempotent over that.
--
-- Known acceptable gap: the operator-only legacy migrate_deandb_state() (init
-- migration) predates rated_at, so a future legacy import would stamp rated_at
-- at apply time rather than historically. It has already been run for Dean and
-- is not re-created here; its rated track inserts ARE covered by the
-- user_tracks trigger below.
-- ============================================================================

-- ── 1. Album rating recency ──────────────────────────────────────────────────
alter table public.user_albums
  add column if not exists rated_at timestamptz;

-- Set rated_at whenever the rating value actually changes; clear it when the
-- rating is cleared (the album is no longer a "verdict"). Re-saving a review or
-- toggling favorite must NOT bump it — that's what updated_at is for.
create or replace function public.touch_rated_at()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.rating is not null and new.rated_at is null then
      new.rated_at := now();
    end if;
  elsif new.rating is distinct from old.rating then
    new.rated_at := case when new.rating is null then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists user_albums_rated_at on public.user_albums;
create trigger user_albums_rated_at
  before insert or update on public.user_albums
  for each row execute function public.touch_rated_at();

-- Backfill existing rated rows with their last-edit time (best approximation).
-- user_albums_touch is disabled around the update so this backfill doesn't
-- stamp updated_at = now() on every rated album, which would scramble the
-- activity feed's ordering. The rated_at trigger is a no-op here (rating is
-- not changing), so the explicit SET value is preserved.
alter table public.user_albums disable trigger user_albums_touch;
update public.user_albums
  set rated_at = updated_at
  where rating is not null and rated_at is null;
alter table public.user_albums enable trigger user_albums_touch;

-- ── 2. Per-song completion ───────────────────────────────────────────────────
alter table public.user_tracks
  add column if not exists listened boolean not null default false;

-- A rating implies the song was heard — enforce it structurally so stale cached
-- clients (rating writes that omit `listened`) and any future import path can't
-- drift. Deliberately also means a rated song can never be un-heard, which is
-- exactly how the client displays it (isHeard in stats.ts).
create or replace function public.touch_track_listened()
returns trigger language plpgsql as $$
begin
  if new.rating is not null then
    new.listened := true;
  end if;
  return new;
end;
$$;

drop trigger if exists user_tracks_listened on public.user_tracks;
create trigger user_tracks_listened
  before insert or update on public.user_tracks
  for each row execute function public.touch_track_listened();

-- Backfill existing rated rows (idempotent; also repairs any skew-written rows
-- on a re-run).
update public.user_tracks set listened = true
  where rating is not null and listened = false;

-- ── 3. Marathon on/off (chill mode) ──────────────────────────────────────────
alter table public.profiles
  add column if not exists marathon_enabled boolean not null default true;
