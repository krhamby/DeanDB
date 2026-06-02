-- ============================================================================
-- DeanDB · Supabase schema (multi-user social listening platform)
-- ----------------------------------------------------------------------------
-- Paste this whole file into the Supabase SQL Editor and click "Run".
-- It is designed to be idempotent — safe to run more than once.
--
-- Model
--   • A SHARED catalog (artists / albums / tracks) deduped by MusicBrainz mbid,
--     so ratings, feeds and recommendations all point at canonical rows.
--   • A per-user JOURNEY layer (user_artists / user_albums / user_tracks) that
--     holds each person's status, ratings, reviews and runtime.
--   • profiles: one row per auth user (username, display name, visibility…).
--   • Social graph (follows) + recommendations + a feed view.
--
-- Security
--   • Auth is real Supabase Auth (email magic link). Every row is gated by RLS
--     using auth.uid(); the public anon key is safe by design.
--   • Journeys default to PRIVATE. A journey is visible to its owner, to anyone
--     if it is public, or to accepted followers ("friends").
--   • Catalog writes go only through SECURITY DEFINER RPCs, so the shared
--     catalog can be deduped centrally and never corrupted by clients.
-- ============================================================================

create extension if not exists citext;

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type visibility_enum as enum ('private', 'public');
exception when duplicate_object then null; end $$;

do $$ begin
  create type album_status as enum ('want', 'listening', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type follow_status as enum ('pending', 'accepted');
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. SHARED CATALOG
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.catalog_artists (
  id           uuid primary key default gen_random_uuid(),
  mbid         text unique,                       -- dedupe key (null for manual)
  name         text not null,
  genre        text,
  country      text,
  catalog_size int  not null default 1,
  bio          text not null default '',
  color        text[] not null default array['#3b82f6', '#1e3a8a'],
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.catalog_albums (
  id          uuid primary key default gen_random_uuid(),
  artist_id   uuid not null references public.catalog_artists(id) on delete cascade,
  mbid        text unique,
  title       text not null,
  year        int,
  cover       text[] not null default array['#3b82f6', '#1e3a8a'],
  cover_url   text,
  runtime_min int not null default 40,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (artist_id, title)                       -- soft dedupe when mbid absent
);

create table if not exists public.catalog_tracks (
  id        uuid primary key default gen_random_uuid(),
  album_id  uuid not null references public.catalog_albums(id) on delete cascade,
  position  int  not null,
  title     text not null,
  mbid      text,
  unique (album_id, position)
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. IDENTITY
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  username           citext unique not null,
  display_name       text not null,
  handle             text,
  tagline            text not null default '',
  bio                text not null default '',
  avatar_url         text,
  season             text not null default 'The 2026 Marathon',
  goal_hours         int  not null default 250,
  journey_visibility visibility_enum not null default 'private',  -- PRIVATE by default
  created_at         timestamptz not null default now()
);

-- Auto-create a profile when a new auth user signs up. Username is seeded from
-- the email local-part (made unique with a short suffix); the user can change
-- it later in Settings. display_name mirrors it until edited.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate citext;
  n int := 0;
begin
  base := regexp_replace(split_part(coalesce(new.email, 'listener'), '@', 1),
                         '[^a-zA-Z0-9_]+', '', 'g');
  if base = '' then base := 'listener'; end if;
  candidate := left(base, 24);
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := left(base, 20) || n::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, initcap(base));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. PER-USER JOURNEY
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.user_artists (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  artist_id uuid not null references public.catalog_artists(id) on delete cascade,
  color     text[],                               -- optional per-user override
  added_at  timestamptz not null default now(),
  unique (user_id, artist_id)
);

-- Logged "Library" flag + per-user artist verdict + self-attributed recommender.
-- Added idempotently so re-running this file upgrades an existing database.
--   • logged: an already-listened artist (kept for ratings/Hall of Fame but
--     OUT of the marathon — goal hours, progress, the wheel). Defaults false so
--     every existing row and new import stays a marathon artist.
--   • verdict / verdict_note: one overall 0–10 score for the whole artist.
--   • rec_by_user / rec_by_text: who recommended this artist to the listener —
--     an on-platform profile (FK to profiles, so the feed/detail can embed
--     their identity) and/or a free-text name for someone off-platform.
alter table public.user_artists
  add column if not exists logged       boolean not null default false,
  add column if not exists verdict      numeric(3,1),
  add column if not exists verdict_note text not null default '',
  add column if not exists rec_by_user  uuid references public.profiles(id) on delete set null,
  add column if not exists rec_by_text  text not null default '';

create table if not exists public.user_albums (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  album_id      uuid not null references public.catalog_albums(id) on delete cascade,
  status        album_status not null default 'want',
  rating        numeric(3,1),                     -- 0.0–10.0 Dean Meter, null = unrated
  review        text not null default '',
  minutes       int  not null default 0,          -- per-user logged runtime
  date_listened date,
  favorite      boolean not null default false,
  excluded      boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (user_id, album_id)
);

create table if not exists public.user_tracks (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.catalog_tracks(id) on delete cascade,
  rating   numeric(3,1),                          -- 0.0–10.0, null = unrated
  favorite boolean not null default false,
  unique (user_id, track_id)
);

-- Keep user_albums.updated_at fresh on every edit (drives the feed ordering).
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_albums_touch on public.user_albums;
create trigger user_albums_touch
  before update on public.user_albums
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. SOCIAL GRAPH
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.follows (
  id          uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  status      follow_status not null default 'pending',
  created_at  timestamptz not null default now(),
  unique (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- Following a public journey auto-accepts; following a private one stays
-- pending until the recipient approves. This runs regardless of what the client
-- submits, so the visibility decision is always made server-side.
create or replace function public.set_follow_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := case when public.is_public(new.followee_id) then 'accepted'::follow_status
                     else 'pending'::follow_status end;
  return new;
end;
$$;

drop trigger if exists follows_set_status on public.follows;
create trigger follows_set_status
  before insert on public.follows
  for each row execute function public.set_follow_status();

create table if not exists public.recommendations (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references auth.users(id) on delete cascade,
  to_user    uuid not null references auth.users(id) on delete cascade,
  artist_id  uuid references public.catalog_artists(id) on delete cascade,
  album_id   uuid references public.catalog_albums(id) on delete cascade,
  note       text not null default '',
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  check (num_nonnulls(artist_id, album_id) = 1)   -- exactly one subject
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. SECURITY HELPER FUNCTIONS
-- ════════════════════════════════════════════════════════════════════════════

-- True when `viewer` has an accepted follow edge to `owner`.
create or replace function public.is_following(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.follows
    where follower_id = viewer and followee_id = owner and status = 'accepted'
  );
$$;

-- The single journey-visibility rule, reused by every per-user table + profiles.
create or replace function public.can_view_journey(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    owner = auth.uid()
    or coalesce(
         (select journey_visibility from public.profiles where id = owner),
         'private'
       ) = 'public'
    or public.is_following(auth.uid(), owner);
$$;

-- Username availability check for the Settings screen (doesn't expose profiles).
create or replace function public.username_available(name citext)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles where username = name);
$$;

grant execute on function public.username_available(citext) to anon, authenticated;

-- Is a given user's journey public? (Used by the follows insert guard.)
create or replace function public.is_public(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select journey_visibility from public.profiles where id = owner), 'private'
  ) = 'public';
$$;

grant execute on function public.is_public(uuid) to authenticated;

-- People discovery. Returns only public identity fields (username/display name/
-- avatar) for ANY profile — private or not — so private users can still be found
-- and sent a follow request. Journey *content* stays protected by table RLS.
create or replace function public.search_profiles(q text)
returns table (id uuid, username citext, display_name text, avatar_url text, visibility visibility_enum)
language sql
stable
security definer
set search_path = public
as $$
  select id, username, display_name, avatar_url, journey_visibility
  from public.profiles
  where id <> auth.uid()
    and (username ilike '%' || q || '%' or display_name ilike '%' || q || '%')
  order by username
  limit 25;
$$;

grant execute on function public.search_profiles(text) to authenticated;

-- Minimal public header for ONE profile by username (works even for private
-- journeys, so the profile page can show a name + "request to follow" button).
create or replace function public.profile_header(p_username citext)
returns table (id uuid, username citext, display_name text, avatar_url text, visibility visibility_enum)
language sql
stable
security definer
set search_path = public
as $$
  select id, username, display_name, avatar_url, journey_visibility
  from public.profiles where username = p_username;
$$;

grant execute on function public.profile_header(citext) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════

alter table public.catalog_artists  enable row level security;
alter table public.catalog_albums   enable row level security;
alter table public.catalog_tracks   enable row level security;
alter table public.profiles         enable row level security;
alter table public.user_artists     enable row level security;
alter table public.user_albums      enable row level security;
alter table public.user_tracks      enable row level security;
alter table public.follows          enable row level security;
alter table public.recommendations  enable row level security;

-- ── Catalog: world-readable, no client writes (writes via RPCs in §7) ─────────
drop policy if exists "catalog_artists read" on public.catalog_artists;
create policy "catalog_artists read" on public.catalog_artists for select using (true);
drop policy if exists "catalog_albums read" on public.catalog_albums;
create policy "catalog_albums read" on public.catalog_albums for select using (true);
drop policy if exists "catalog_tracks read" on public.catalog_tracks;
create policy "catalog_tracks read" on public.catalog_tracks for select using (true);

-- ── profiles ──────────────────────────────────────────────────────────────────
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select
  using (
    journey_visibility = 'public'
    or id = auth.uid()
    or public.is_following(auth.uid(), id)
  );
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
-- (insert handled by the on_auth_user_created trigger, which is SECURITY DEFINER)

-- ── Per-user journey tables: read if allowed, write only your own ─────────────
drop policy if exists "user_artists read" on public.user_artists;
create policy "user_artists read" on public.user_artists for select
  using (public.can_view_journey(user_id));
drop policy if exists "user_artists write" on public.user_artists;
create policy "user_artists write" on public.user_artists for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user_albums read" on public.user_albums;
create policy "user_albums read" on public.user_albums for select
  using (public.can_view_journey(user_id));
drop policy if exists "user_albums write" on public.user_albums;
create policy "user_albums write" on public.user_albums for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user_tracks read" on public.user_tracks;
create policy "user_tracks read" on public.user_tracks for select
  using (public.can_view_journey(user_id));
drop policy if exists "user_tracks write" on public.user_tracks;
create policy "user_tracks write" on public.user_tracks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── follows ───────────────────────────────────────────────────────────────────
drop policy if exists "follows read" on public.follows;
create policy "follows read" on public.follows for select
  using (follower_id = auth.uid() or followee_id = auth.uid());
-- You may only create your own edges. An `accepted` edge can be self-created
-- ONLY toward a public journey; private targets are forced to `pending` (and
-- the trigger below enforces this), so nobody can self-grant private access.
drop policy if exists "follows insert" on public.follows;
create policy "follows insert" on public.follows for insert
  with check (
    follower_id = auth.uid()
    and (status = 'pending' or public.is_public(followee_id))
  );
-- Only the recipient may flip pending -> accepted.
drop policy if exists "follows accept" on public.follows;
create policy "follows accept" on public.follows for update
  using (followee_id = auth.uid()) with check (followee_id = auth.uid());
-- Either side may remove the edge (unfollow / remove a follower).
drop policy if exists "follows delete" on public.follows;
create policy "follows delete" on public.follows for delete
  using (follower_id = auth.uid() or followee_id = auth.uid());

-- ── recommendations ───────────────────────────────────────────────────────────
drop policy if exists "recs read" on public.recommendations;
create policy "recs read" on public.recommendations for select
  using (from_user = auth.uid() or to_user = auth.uid());
drop policy if exists "recs insert" on public.recommendations;
create policy "recs insert" on public.recommendations for insert
  with check (from_user = auth.uid());
drop policy if exists "recs mark read" on public.recommendations;
create policy "recs mark read" on public.recommendations for update
  using (to_user = auth.uid()) with check (to_user = auth.uid());
drop policy if exists "recs delete" on public.recommendations;
create policy "recs delete" on public.recommendations for delete
  using (from_user = auth.uid() or to_user = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- 7. CATALOG WRITE RPCs (SECURITY DEFINER — centralized dedupe by mbid)
-- ════════════════════════════════════════════════════════════════════════════

-- Upsert an artist into the shared catalog, returning its id. Dedupes on mbid
-- when present; otherwise matches an existing row by name (case-insensitive).
create or replace function public.upsert_catalog_artist(
  p_mbid text, p_name text, p_genre text, p_country text,
  p_catalog_size int, p_color text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare existing uuid;
begin
  if auth.uid() is null then raise exception 'Must be signed in'; end if;

  if p_mbid is not null then
    select id into existing from public.catalog_artists where mbid = p_mbid;
  else
    select id into existing from public.catalog_artists where lower(name) = lower(p_name) limit 1;
  end if;

  if existing is not null then
    update public.catalog_artists
      set name = p_name,
          mbid = coalesce(mbid, p_mbid),
          genre = coalesce(p_genre, genre),
          country = coalesce(p_country, country),
          catalog_size = greatest(catalog_size, coalesce(p_catalog_size, 1))
      where id = existing;
    return existing;
  end if;

  insert into public.catalog_artists (mbid, name, genre, country, catalog_size, color, created_by)
  values (p_mbid, p_name, p_genre, p_country, coalesce(p_catalog_size, 1),
          coalesce(p_color, array['#3b82f6','#1e3a8a']), auth.uid())
  returning id into existing;
  return existing;
end;
$$;

-- Upsert an album under an artist, returning its id. Dedupes on mbid, else on
-- (artist_id, title).
create or replace function public.upsert_catalog_album(
  p_artist_id uuid, p_mbid text, p_title text, p_year int,
  p_cover text[], p_cover_url text, p_runtime_min int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare existing uuid;
begin
  if auth.uid() is null then raise exception 'Must be signed in'; end if;

  if p_mbid is not null then
    select id into existing from public.catalog_albums where mbid = p_mbid;
  else
    select id into existing from public.catalog_albums
      where artist_id = p_artist_id and lower(title) = lower(p_title) limit 1;
  end if;

  if existing is not null then
    update public.catalog_albums
      set year = coalesce(p_year, year),
          mbid = coalesce(mbid, p_mbid),
          cover_url = coalesce(p_cover_url, cover_url),
          runtime_min = case when coalesce(p_runtime_min,0) > 0 then p_runtime_min else runtime_min end
      where id = existing;
    return existing;
  end if;

  insert into public.catalog_albums (artist_id, mbid, title, year, cover, cover_url, runtime_min, created_by)
  values (p_artist_id, p_mbid, p_title, p_year,
          coalesce(p_cover, array['#3b82f6','#1e3a8a']), p_cover_url,
          coalesce(nullif(p_runtime_min,0), 40), auth.uid())
  returning id into existing;
  return existing;
end;
$$;

-- Replace an album's tracklist from an ordered array of titles. Returns the
-- catalog_tracks ids in order so the client can attach per-user ratings.
create or replace function public.upsert_catalog_tracks(
  p_album_id uuid, p_titles text[]
)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare i int;
begin
  if auth.uid() is null then raise exception 'Must be signed in'; end if;
  delete from public.catalog_tracks where album_id = p_album_id;
  for i in 1 .. coalesce(array_length(p_titles, 1), 0) loop
    return query
      insert into public.catalog_tracks (album_id, position, title)
      values (p_album_id, i, p_titles[i])
      returning id;
  end loop;
end;
$$;

-- Append a single track to an album's catalog tracklist (manual editor add).
create or replace function public.add_catalog_track(p_album_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid; next_pos int;
begin
  if auth.uid() is null then raise exception 'Must be signed in'; end if;
  select coalesce(max(position), 0) + 1 into next_pos
    from public.catalog_tracks where album_id = p_album_id;
  insert into public.catalog_tracks (album_id, position, title)
  values (p_album_id, next_pos, p_title)
  returning id into new_id;
  return new_id;
end;
$$;

-- Remove a track from an album's catalog tracklist.
create or replace function public.remove_catalog_track(p_track_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Must be signed in'; end if;
  delete from public.catalog_tracks where id = p_track_id;
end;
$$;

-- Remove an artist from the CURRENT user's journey: drops their user_albums for
-- that artist (+ orphaned user_tracks via cascade) and the user_artists row.
-- The shared catalog is untouched.
create or replace function public.remove_user_artist(p_artist_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Must be signed in'; end if;
  delete from public.user_tracks ut
    using public.catalog_tracks ct, public.catalog_albums ca
    where ut.user_id = auth.uid()
      and ut.track_id = ct.id and ct.album_id = ca.id and ca.artist_id = p_artist_id;
  delete from public.user_albums ua
    using public.catalog_albums ca
    where ua.user_id = auth.uid() and ua.album_id = ca.id and ca.artist_id = p_artist_id;
  delete from public.user_artists
    where user_id = auth.uid() and artist_id = p_artist_id;
end;
$$;

grant execute on function public.upsert_catalog_artist(text, text, text, text, int, text[]) to authenticated;
grant execute on function public.upsert_catalog_album(uuid, text, text, int, text[], text, int) to authenticated;
grant execute on function public.upsert_catalog_tracks(uuid, text[]) to authenticated;
grant execute on function public.add_catalog_track(uuid, text) to authenticated;
grant execute on function public.remove_catalog_track(uuid) to authenticated;
grant execute on function public.remove_user_artist(uuid) to authenticated;
grant execute on function public.is_following(uuid, uuid) to authenticated;
grant execute on function public.can_view_journey(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. ACTIVITY FEED (view — RLS of the querying user applies via security_invoker)
-- ════════════════════════════════════════════════════════════════════════════

create or replace view public.feed_items
with (security_invoker = on) as
  select
    ua.id              as user_album_id,
    ua.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    ua.album_id,
    ca.title           as album_title,
    ca.cover,
    ca.cover_url,
    car.id             as artist_id,
    car.name           as artist_name,
    ua.status,
    ua.rating,
    ua.review,
    ua.favorite,
    ua.updated_at,
    -- NOTE: new columns MUST be appended at the END. CREATE OR REPLACE VIEW
    -- cannot reorder/rename existing output columns, so inserting before
    -- updated_at would break the idempotent re-run on an existing database.
    coalesce(uar.logged, false) as logged   -- drives the "logged an old favorite" feed verb
  from public.user_albums ua
  join public.catalog_albums  ca  on ca.id = ua.album_id
  join public.catalog_artists car on car.id = ca.artist_id
  join public.profiles        p   on p.id = ua.user_id
  -- LEFT join: a feed row should still show even if the artist isn't in the
  -- user's roster. Logged favorites already pass the rating/status filter below,
  -- so the flag only changes how the activity is labeled, not whether it appears.
  left join public.user_artists uar
    on uar.user_id = ua.user_id and uar.artist_id = car.id
  where ua.excluded = false
    and (ua.status <> 'want' or ua.rating is not null)
  order by ua.updated_at desc;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. ALBUM COMMUNITY AGGREGATE (cross-user average for the album page)
-- ════════════════════════════════════════════════════════════════════════════

-- Only rows the caller may see (RLS on user_albums) feed the average, so this
-- is run as the invoker.
create or replace function public.album_aggregate(p_album_id uuid)
returns table (avg_rating numeric, listener_count bigint)
language sql
stable
as $$
  select round(avg(rating), 1) as avg_rating, count(rating) as listener_count
  from public.user_albums
  where album_id = p_album_id and rating is not null;
$$;

grant execute on function public.album_aggregate(uuid) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. REALTIME (optional: live feed / journey updates)
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  alter publication supabase_realtime add table public.user_albums;
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 11. MIGRATION: seed the legacy single-document marathon into a real account
-- ----------------------------------------------------------------------------
-- The old app stored everything in one JSONB row (public.deandb_state, id=1).
-- To migrate:
--   1. Sign in once as Dean via the app (magic link) to create his auth user.
--      Grab his uuid from Supabase → Authentication → Users.
--   2. Run (from the SQL editor / service role):
--        select public.migrate_deandb_state('<dean-uuid>'::uuid);
--   3. Verify Dean's journey, set it public in Settings if desired (migration
--      leaves visibility at the private default), then optionally drop the
--      legacy objects:
--        drop table if exists public.deandb_state, public.deandb_config cascade;
--        drop function if exists public.save_deandb, public.check_passcode;
-- The function is a no-op if the legacy table doesn't exist. It is operator-only:
-- execute is revoked from anon/authenticated (see the REVOKE after the function),
-- and it refuses to migrate any account other than the caller's own.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.migrate_deandb_state(target_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  doc      jsonb;
  artist   jsonb;
  album    jsonb;
  track    jsonb;
  a_id     uuid;
  al_id    uuid;
  t_titles text[];
  t_ids    uuid[];
  k        int;
begin
  -- Operator-only migration. The REVOKE below removes it from the PostgREST RPC
  -- surface (anon/authenticated cannot call it); it runs from the SQL editor /
  -- service role, where auth.uid() is null. Defense in depth: if a user session
  -- ever reaches it, only allow migrating one's OWN account — never another user.
  if auth.uid() is not null and auth.uid() <> target_user then
    raise exception 'migrate_deandb_state: not authorized to migrate another user';
  end if;

  if to_regclass('public.deandb_state') is null then
    return 'No legacy deandb_state table found — nothing to migrate.';
  end if;

  select data into doc from public.deandb_state where id = 1;
  if doc is null then return 'Legacy row empty — nothing to migrate.'; end if;

  -- Profile branding from the legacy listener block. Visibility is intentionally
  -- left untouched (journeys default to PRIVATE) — the owner can make it public
  -- in Settings after verifying the migration, rather than this forcing it.
  update public.profiles set
    display_name = coalesce(doc->'listener'->>'name', display_name),
    handle       = coalesce(doc->'listener'->>'handle', handle),
    tagline      = coalesce(doc->'listener'->>'tagline', tagline),
    season       = coalesce(doc->>'season', season)
  where id = target_user;

  for artist in select * from jsonb_array_elements(coalesce(doc->'artists', '[]'::jsonb)) loop
    a_id := public.upsert_catalog_artist(
      nullif(artist->>'mbid',''), artist->>'name', artist->>'genre', artist->>'country',
      coalesce((artist->>'catalogSize')::int, 1),
      array(select jsonb_array_elements_text(artist->'color'))
    );
    insert into public.user_artists (user_id, artist_id, color)
    values (target_user, a_id, array(select jsonb_array_elements_text(artist->'color')))
    on conflict (user_id, artist_id) do nothing;

    for album in select * from jsonb_array_elements(coalesce(artist->'albums','[]'::jsonb)) loop
      al_id := public.upsert_catalog_album(
        a_id, nullif(album->>'mbid',''), album->>'title',
        (album->>'year')::int,
        array(select jsonb_array_elements_text(album->'cover')),
        nullif(album->>'coverUrl',''),
        coalesce((album->>'minutes')::int, 40)
      );

      insert into public.user_albums
        (user_id, album_id, status, rating, review, minutes, date_listened, favorite, excluded)
      values (
        target_user, al_id,
        coalesce((album->>'status')::album_status, 'want'),
        (album->>'rating')::numeric,
        coalesce(album->>'review',''),
        coalesce((album->>'minutes')::int, 0),
        (album->>'dateListened')::date,
        coalesce((album->>'favorite')::boolean, false),
        coalesce((album->>'excluded')::boolean, false)
      )
      on conflict (user_id, album_id) do nothing;

      -- Tracks: build ordered title array, create catalog rows, attach ratings.
      t_titles := array(select x->>'title'
                        from jsonb_array_elements(coalesce(album->'tracks','[]'::jsonb)) x);
      if array_length(t_titles, 1) is not null then
        t_ids := array(select public.upsert_catalog_tracks(al_id, t_titles));
        k := 0;
        for track in select * from jsonb_array_elements(album->'tracks') loop
          k := k + 1;
          insert into public.user_tracks (user_id, track_id, rating, favorite)
          values (target_user, t_ids[k],
                  (track->>'rating')::numeric,
                  coalesce((track->>'favorite')::boolean, false))
          on conflict (user_id, track_id) do nothing;
        end loop;
      end if;
    end loop;
  end loop;

  return 'Migrated legacy marathon into user ' || target_user::text;
end;
$$;

-- Lock this SECURITY DEFINER maintenance function down: it must NOT be callable
-- from the public RPC surface. Revoke the default PUBLIC execute (and any role
-- grants) so only the table owner / service role can run it (e.g. the SQL
-- editor). Idempotent — safe to re-run.
revoke execute on function public.migrate_deandb_state(uuid) from public;
revoke execute on function public.migrate_deandb_state(uuid) from anon, authenticated;

-- Done. Set SUPABASE_URL / SUPABASE_ANON_KEY in src/lib/config.ts (or
-- VITE_SUPABASE_ANON_KEY), and add your site URL (e.g.
-- https://<user>.github.io/DeanDB/) to Supabase → Authentication → URL
-- Configuration → Redirect URLs so magic links return to the app.
