-- ════════════════════════════════════════════════════════════════════════════
-- DeanDB · Achievements (plan §C)
--
-- Durable unlock records so achievements can surface in the social feed. The
-- table stores ONLY the durable facts — (user_id, achievement_id, unlocked_at).
-- Presentation (emoji/title/desc/hidden) and the secret-masking rule live in the
-- client catalog (src/lib/achievements.ts), so the Dashboard and the Feed render
-- identically and copy edits never need a migration.
--
-- RLS mirrors the per-user journey: reads gated by can_view_journey (same
-- accepted-follower / public / self rule as the feed). Writes go through a
-- SECURITY DEFINER RPC (record_achievement_unlocks) — direct INSERT/UPDATE/DELETE
-- are revoked — so user_id and unlocked_at are SERVER-stamped: a client can't
-- forge ownership or back-date an unlock. (The achievement_id is still
-- client-asserted; closing that fully needs server-side journey recomputation,
-- which is out of scope — so an id can be claimed, but its owner and time are
-- trustworthy.)
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.user_achievements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,                       -- matches a client catalog id
  unlocked_at    timestamptz not null default now(),  -- DB clock = trusted ordering
  unique (user_id, achievement_id)                    -- idempotency key for upsert
);

create index if not exists user_achievements_user_idx
  on public.user_achievements (user_id, unlocked_at desc);

alter table public.user_achievements enable row level security;

-- Read: same visibility gate as every per-user journey table + the feed.
drop policy if exists "user_achievements read" on public.user_achievements;
create policy "user_achievements read" on public.user_achievements for select
  using (public.can_view_journey(user_id));

-- Writes go through a SECURITY DEFINER RPC only (mirrors the upsert_catalog_*
-- pattern): revoke direct writes so a client can neither forge another user's
-- row nor set/back-date unlocked_at. The RPC stamps auth.uid() and now() itself.
revoke insert, update, delete on public.user_achievements from anon, authenticated;

create or replace function public.record_achievement_unlocks(p_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Must be signed in'; end if;
  insert into public.user_achievements (user_id, achievement_id, unlocked_at)
  select auth.uid(), unnest(p_ids), now()
  on conflict (user_id, achievement_id) do nothing;  -- idempotent; never rewrites unlocked_at
end;
$$;

grant execute on function public.record_achievement_unlocks(text[]) to authenticated;

-- ── Achievement feed source ─────────────────────────────────────────────────
-- Parallel to feed_items; security_invoker so the caller's RLS on
-- user_achievements applies (accepted-follower / public / self).
create or replace view public.achievement_feed
with (security_invoker = on) as
  select
    ua.id            as achievement_row_id,
    ua.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    ua.achievement_id,
    ua.unlocked_at
  from public.user_achievements ua
  join public.profiles p on p.id = ua.user_id
  order by ua.unlocked_at desc;

-- Realtime parity with user_albums (best-effort; ignore if already added).
do $$ begin
  alter publication supabase_realtime add table public.user_achievements;
exception when duplicate_object then null; end $$;
