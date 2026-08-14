-- Recommendations inbox via a SECURITY DEFINER RPC.
--
-- Bug: the recipient's inbox always came back EMPTY. listInbox() embedded the
-- sender as `profiles!recommendations_from_user_fkey`, but recommendations.from_user
-- is a foreign key to auth.users (NOT public.profiles). PostgREST can't resolve a
-- profiles relationship through that FK, so the whole SELECT errored — and the
-- client swallowed the error, leaving an empty inbox.
--
-- Fix: a SECURITY DEFINER function that returns each recommendation joined to the
-- sender's PUBLIC identity (username / display name / avatar). This mirrors the
-- list_followers() pattern: it exposes only public identity, so the inbox works
-- even when the sender's journey is private (a direct RLS-gated profiles read
-- would hide a private, non-followed sender and blank out their name). The
-- `where to_user = auth.uid()` guard means a caller only ever sees their own inbox.

create or replace function public.list_inbox()
returns table (
  id               uuid,
  from_user        uuid,
  from_username    citext,
  from_display_name text,
  from_avatar_url  text,
  album_id         uuid,
  artist_id        uuid,
  note             text,
  created_at       timestamptz,
  read_at          timestamptz,
  album_title      text,
  artist_name      text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.from_user,
    p.username,
    p.display_name,
    p.avatar_url,
    r.album_id,
    coalesce(r.artist_id, al.artist_id) as artist_id,   -- album recs resolve to the album's artist
    r.note,
    r.created_at,
    r.read_at,
    al.title                            as album_title,
    coalesce(ar.name, alar.name)        as artist_name
  from public.recommendations r
  left join public.profiles        p    on p.id    = r.from_user
  left join public.catalog_albums  al   on al.id   = r.album_id
  left join public.catalog_artists ar   on ar.id   = r.artist_id
  left join public.catalog_artists alar on alar.id = al.artist_id
  where r.to_user = auth.uid()
  order by r.created_at desc;
$$;

revoke all on function public.list_inbox() from public, anon;
grant execute on function public.list_inbox() to authenticated;
