-- Follow requests/edges involving a PRIVATE counterparty were silently dropped
-- because the client read the other party's profile through normal RLS (visible
-- only if public / self / already-followed). Journeys default to private, so a
-- typical follow request never appeared on the recipient's People page.
--
-- Fix: expose follow edges via SECURITY DEFINER RPCs that return only the
-- counterparty's PUBLIC identity (username / display name / avatar / visibility)
-- regardless of their journey visibility — exactly what search_profiles already
-- does for discovery. Each RPC is scoped to auth.uid()'s own edges, so it leaks
-- nothing a user couldn't already find by searching.

-- Incoming: people who follow me (accepted) and pending requests to me.
create or replace function public.list_followers()
returns table (
  id uuid, username citext, display_name text, avatar_url text,
  visibility visibility_enum, status follow_status
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.journey_visibility, f.status
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.followee_id = auth.uid()
  order by f.created_at desc;
$$;

-- Outgoing: people I follow (accepted) and requests I've sent (pending).
create or replace function public.list_following()
returns table (
  id uuid, username citext, display_name text, avatar_url text,
  visibility visibility_enum, status follow_status
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.journey_visibility, f.status
  from public.follows f
  join public.profiles p on p.id = f.followee_id
  where f.follower_id = auth.uid()
  order by f.created_at desc;
$$;

grant execute on function public.list_followers() to authenticated;
grant execute on function public.list_following() to authenticated;
