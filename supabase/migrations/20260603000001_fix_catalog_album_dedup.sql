-- Make upsert_catalog_album idempotent on (artist_id, title), not just mbid.
-- Previously, when an mbid was supplied it deduped ONLY by mbid; a second album
-- with the same (artist_id, title) but a different/blank mbid then hit the
-- unique(artist_id, title) constraint instead of resolving to the existing row.
-- This blocked migrating legacy data with duplicate-titled albums and could
-- break the live Editor import. Fall back to an (artist, title) match.
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
          coalesce(nullif(p_runtime_min,0), 40), auth.uid())
  returning id into existing;
  return existing;
end;
$$;

grant execute on function public.upsert_catalog_album(uuid, text, text, int, text[], text, int) to authenticated;
