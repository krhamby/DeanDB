-- Start-a-conversation support: who can I DM right now?
--
-- Mirrors the can_dm rule exactly (accepted follow edge in EITHER direction,
-- no block either way) so a person picked from this list can never produce a
-- refused send. SECURITY DEFINER like the other follow-edge RPCs: the
-- counterparty's profile may be private, and only public identity is exposed —
-- nothing a user couldn't already see on their People page. Someone who has
-- blocked you simply doesn't appear (blocks are never revealed).
create or replace function public.list_dm_contacts(q text default '')
returns table (id uuid, username citext, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id, p.username, p.display_name, p.avatar_url
  from public.follows f
  join public.profiles p
    on p.id = case when f.follower_id = auth.uid() then f.followee_id else f.follower_id end
  where f.status = 'accepted'
    and (f.follower_id = auth.uid() or f.followee_id = auth.uid())
    and not public.is_blocked_pair(auth.uid(), p.id)
    and (q = '' or p.username ilike '%' || q || '%' or p.display_name ilike '%' || q || '%')
  order by display_name, username
  limit 50;
$$;

grant execute on function public.list_dm_contacts(text) to authenticated;
