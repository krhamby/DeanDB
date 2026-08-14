-- Direct messages, blocking, and reporting.
--
-- • blocks       — a one-way "never contact me" edge. Blocking severs follow
--                  edges in BOTH directions, prevents new follows either way,
--                  and makes DMs between the pair impossible (all server-side).
-- • dm_messages  — 1:1 messages. You can DM someone only when an ACCEPTED
--                  follow edge exists in either direction (you follow them or
--                  they follow you) and neither party blocks the other. That
--                  keeps stranger spam impossible while letting any real
--                  connection chat.
-- • reports      — user-filed moderation reports (about a person, optionally
--                  anchored to a specific message). Insert-only for users;
--                  reviewed by the operator via the service role / SQL editor.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. BLOCKS
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.blocks (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- True when either user blocks the other. SECURITY DEFINER so policies on other
-- tables can consult it without exposing who-blocked-whom to clients.
create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

-- Blocking severs the relationship immediately: any follow edge between the
-- pair (either direction, accepted or pending) is removed, which also revokes
-- a blocked follower's access to a private journey via can_view_journey.
create or replace function public.sever_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists blocks_sever_follows on public.blocks;
create trigger blocks_sever_follows
  after insert on public.blocks
  for each row execute function public.sever_on_block();

alter table public.blocks enable row level security;

-- You can see, create, and lift only YOUR OWN blocks. The blocked party never
-- learns they were blocked (no select path to incoming blocks).
drop policy if exists "blocks read own" on public.blocks;
create policy "blocks read own" on public.blocks for select
  using (blocker_id = auth.uid());
drop policy if exists "blocks insert own" on public.blocks;
create policy "blocks insert own" on public.blocks for insert
  with check (blocker_id = auth.uid());
drop policy if exists "blocks delete own" on public.blocks;
create policy "blocks delete own" on public.blocks for delete
  using (blocker_id = auth.uid());

-- Re-issue the follows INSERT policy with the block check, so a blocked user
-- can't re-follow (or re-request) after the trigger severed the edge.
drop policy if exists "follows insert" on public.follows;
create policy "follows insert" on public.follows for insert
  with check (
    follower_id = auth.uid()
    and (status = 'pending' or public.is_public(followee_id))
    and not public.is_blocked_pair(follower_id, followee_id)
  );

-- Likewise, no recommendations across a block.
drop policy if exists "recs insert" on public.recommendations;
create policy "recs insert" on public.recommendations for insert
  with check (
    from_user = auth.uid()
    and not public.is_blocked_pair(from_user, to_user)
  );

-- The blocked users management list (Settings). SECURITY DEFINER because the
-- blocked party's profile may be private (normal RLS would hide the row and the
-- block would become un-liftable from the UI). Exposes public identity only.
create or replace function public.list_blocked()
returns table (id uuid, username citext, display_name text, avatar_url text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.list_blocked() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. DIRECT MESSAGES
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.dm_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  check (sender_id <> recipient_id)
);

-- Thread + unread lookups both scan by participant.
create index if not exists dm_messages_pair_idx
  on public.dm_messages (sender_id, recipient_id, created_at desc);
create index if not exists dm_messages_unread_idx
  on public.dm_messages (recipient_id, created_at desc) where read_at is null;

-- Who may DM whom: an accepted follow edge in either direction, and no block
-- either way. Evaluated server-side on every insert — the client check is UX only.
create or replace function public.can_dm(sender uuid, recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.is_blocked_pair(sender, recipient)
     and (public.is_following(sender, recipient) or public.is_following(recipient, sender));
$$;

grant execute on function public.can_dm(uuid, uuid) to authenticated;

alter table public.dm_messages enable row level security;

drop policy if exists "dms read" on public.dm_messages;
create policy "dms read" on public.dm_messages for select
  using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists "dms send" on public.dm_messages;
create policy "dms send" on public.dm_messages for insert
  with check (sender_id = auth.uid() and public.can_dm(sender_id, recipient_id));
-- The recipient may update ONLY read_at (column-level grant below) — never the
-- body, so a reported message can't be doctored by the person reporting it.
drop policy if exists "dms mark read" on public.dm_messages;
create policy "dms mark read" on public.dm_messages for update
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
-- The sender may unsend their own message.
drop policy if exists "dms unsend" on public.dm_messages;
create policy "dms unsend" on public.dm_messages for delete
  using (sender_id = auth.uid());

revoke update on table public.dm_messages from anon, authenticated;
grant update (read_at) on table public.dm_messages to authenticated;

-- Conversation list: latest message per counterparty + unread count. SECURITY
-- DEFINER for the same reason as list_followers — the counterparty's profile
-- may be private; only public identity fields are exposed, and only for people
-- you already exchanged messages with.
create or replace function public.list_dm_conversations()
returns table (
  other_id uuid, username citext, display_name text, avatar_url text,
  last_body text, last_sender_id uuid, last_at timestamptz, unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select m.*,
           case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as other
    from public.dm_messages m
    where m.sender_id = auth.uid() or m.recipient_id = auth.uid()
  ),
  latest as (
    select distinct on (other) other, body, sender_id, created_at
    from mine
    order by other, created_at desc
  )
  select l.other, p.username, p.display_name, p.avatar_url,
         l.body, l.sender_id, l.created_at,
         (select count(*) from mine u
           where u.other = l.other and u.recipient_id = auth.uid() and u.read_at is null)
  from latest l
  join public.profiles p on p.id = l.other
  order by l.created_at desc;
$$;

grant execute on function public.list_dm_conversations() to authenticated;

-- Live delivery: stream INSERTs to signed-in clients. Realtime respects RLS, so
-- each user only ever receives rows the "dms read" policy lets them select.
do $$
begin
  alter publication supabase_realtime add table public.dm_messages;
exception
  when duplicate_object then null;   -- already in the publication
  when undefined_object then null;   -- no realtime publication (e.g. bare Postgres in CI)
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. REPORTS
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  -- Optional anchor to the offending message. SET NULL (not CASCADE) so an
  -- "unsend" can't destroy the report itself.
  message_id       uuid references public.dm_messages(id) on delete set null,
  reason           text not null check (reason in ('spam', 'harassment', 'impersonation', 'other')),
  details          text not null default '' check (char_length(details) <= 2000),
  -- Evidence snapshot: the message body at filing time, so the report stays
  -- reviewable even after the sender unsends the message. Written by the
  -- trigger below — never trusted from the client.
  message_body     text,
  status           text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at       timestamptz not null default now(),
  check (reporter_id <> reported_user_id)
);

-- Snapshot the reported message server-side. Ignores whatever the client sent
-- in message_body (a reporter must not be able to fabricate evidence) and
-- verifies the reporter actually participates in the referenced message.
create or replace function public.snapshot_reported_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.message_id is null then
    new.message_body := null;
    return new;
  end if;
  select body into new.message_body
  from public.dm_messages
  where id = new.message_id
    and (sender_id = new.reporter_id or recipient_id = new.reporter_id);
  if new.message_body is null then
    raise exception 'reported message not found or not yours to report';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_snapshot_message on public.reports;
create trigger reports_snapshot_message
  before insert on public.reports
  for each row execute function public.snapshot_reported_message();

alter table public.reports enable row level security;

-- Users can file reports and see what they've filed. There is intentionally no
-- client update/delete path — triage happens operator-side (service role), like
-- migrate_deandb_state.
drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own" on public.reports for insert
  with check (reporter_id = auth.uid());
drop policy if exists "reports read own" on public.reports;
create policy "reports read own" on public.reports for select
  using (reporter_id = auth.uid());

revoke update, delete on table public.reports from anon, authenticated;
