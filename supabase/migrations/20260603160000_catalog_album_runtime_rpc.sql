-- ════════════════════════════════════════════════════════════════════════════
-- Set an album's runtime in the SHARED catalog (plan §Bug 1).
--
-- Runtime is an album-level fact, not a per-user one. Until now a tracklist fetch
-- wrote the real runtime ONLY to the per-user layer (user_albums.minutes), so it
-- was never shared: a viewer of someone else's journey (who can't edit it) could
-- never see a runtime, and albums that already had tracks but 0 runtime had no
-- backfill path at all.
--
-- This focused RPC lets any signed-in user write a real (>0) runtime to the
-- shared catalog_albums row (mirrors the upsert_catalog_* SECURITY DEFINER
-- pattern — catalog writes are world-contributed by design). Journey reassembly
-- already prefers `user_albums.minutes` and falls back to `catalog_albums.
-- runtime_min`, so once this is set the runtime surfaces for the owner AND every
-- viewer, permanently. Tracks/cover are untouched, so song ratings are safe.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.set_catalog_album_runtime(p_album_id uuid, p_runtime_min int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Must be signed in'; end if;
  -- Only ever write a real runtime; a 0/null is "unknown" and must never clobber
  -- an already-known value.
  update public.catalog_albums
    set runtime_min = p_runtime_min
    where id = p_album_id and coalesce(p_runtime_min, 0) > 0;
end;
$$;

grant execute on function public.set_catalog_album_runtime(uuid, int) to authenticated;
