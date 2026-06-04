-- 4c · cover-art color extraction columns + writer RPC.
--
-- fetchJourney (api.ts) selects catalog_albums.dominant_color; the extract-cover
-- Edge Function writes it (+ cover_storage_url) via set_catalog_album_art. These
-- were first applied out-of-band via the SQL Editor (see
-- docs/superpowers/INFRA_SETUP.md §4c); committing here version-controls the schema.
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op when present; CREATE OR REPLACE
-- re-defines the function to this canonical body.
--
-- NOTE: dominant_color is the only column actually used today (storage-free design —
-- covers stay on the Cover Art Archive + the browser SW cache); cover_storage_url is
-- kept for parity with the deployed RPC but is intentionally unwritten.

alter table public.catalog_albums
  add column if not exists dominant_color text,
  add column if not exists cover_storage_url text;

-- Only the importer's own authenticated session triggers this; SECURITY DEFINER
-- writes the shared catalog row (catalog_albums has no direct authenticated UPDATE).
create or replace function public.set_catalog_album_art(p_album_id uuid, p_color text, p_url text)
returns void language sql security definer set search_path = public as $$
  update public.catalog_albums
     set dominant_color = p_color,
         cover_storage_url = coalesce(p_url, cover_storage_url)
   where id = p_album_id;
$$;

revoke all on function public.set_catalog_album_art(uuid, text, text) from anon;
grant execute on function public.set_catalog_album_art(uuid, text, text) to authenticated;
