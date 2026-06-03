-- ════════════════════════════════════════════════════════════════════════════
-- Fix the "40-minute placeholder" runtime bug (plan §A1).
--
-- Albums imported without a tracklist were seeded to a fake 40 minutes at BOTH
-- the shared-catalog layer (catalog_albums.runtime_min default + upsert RPC
-- fallback) and the per-user layer (user_albums.minutes). That truthy 40
--   (a) shadowed real catalog runtimes in journey reassembly
--       (`ur.minutes || cat.runtime_min` always picked the 40), and
--   (b) understated marathon goal-hours and stopped the Endurance achievement
--       ("complete a single album longer than 90 minutes") from ever firing.
--
-- New client code seeds 0 ("runtime unknown"). This migration retires the stored
-- 40 placeholder and stops the DB from re-introducing it. SQL can zero the
-- placeholders; it cannot recover a real runtime that was never fetched — those
-- albums read 0 minutes until the user clicks "Load all tracklists" / "Get
-- tracks", which writes the real runtime to both layers via the existing path.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Stop the COLUMN default from re-seeding 40 on future inserts.
alter table public.catalog_albums
  alter column runtime_min set default 0;

-- 2. Repoint the catalog upsert RPC's INSERT fallback 40 -> 0.
--    Mirrors 20260603000001_fix_catalog_album_dedup.sql verbatim; ONLY the final
--    coalesce changes (nullif(...,0),40  ->  coalesce(...,0)). Keep everything
--    else identical so dedup behavior is preserved.
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
  end if;
  if existing is null then
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
          coalesce(p_runtime_min, 0), auth.uid())   -- was coalesce(nullif(p_runtime_min,0), 40)
  returning id into existing;
  return existing;
end;
$$;

grant execute on function public.upsert_catalog_album(uuid, text, text, int, text[], text, int) to authenticated;

-- 3. Zero the placeholder in the CATALOG. We treat runtime_min = 40 as the seed
--    placeholder ("unknown"); real runtimes (from a tracklist fetch) are almost
--    never exactly 40, and any false positive simply re-fills on the next pull.
update public.catalog_albums
  set runtime_min = 0
  where runtime_min = 40;

-- 4. Zero the placeholder in the PER-USER layer so reassembly stops being
--    shadowed by the truthy 40 and defers to the catalog value (0 until a pull).
--    The join guard (catalog is placeholder/zeroed) avoids wiping a genuinely
--    typed 40-minute album the user may have entered by hand.
update public.user_albums ua
  set minutes = 0
  from public.catalog_albums ca
  where ua.album_id = ca.id
    and ua.minutes = 40
    and ca.runtime_min in (0, 40);
