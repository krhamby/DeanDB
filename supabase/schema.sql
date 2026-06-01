-- ============================================================================
-- DeanDB · Supabase schema
-- ----------------------------------------------------------------------------
-- Paste this whole file into the Supabase SQL Editor and click "Run".
-- It is safe to run more than once.
--
-- Model: the entire DeanDB document lives as one JSONB row. Everyone can READ
-- it (so friends see the marathon); writing is gated behind an editor passcode
-- checked server-side, so the public anon key alone cannot change anything.
-- ============================================================================

-- 1. The single document row -------------------------------------------------
create table if not exists public.deandb_state (
  id         int primary key default 1,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  constraint deandb_state_single_row check (id = 1)
);

-- 2. Private config holding the editor passcode (never exposed to anon) -------
create table if not exists public.deandb_config (
  id              int primary key default 1,
  editor_passcode text not null,
  constraint deandb_config_single_row check (id = 1)
);

-- 3. Row Level Security -------------------------------------------------------
alter table public.deandb_state  enable row level security;
alter table public.deandb_config enable row level security;

-- Anyone may READ the marathon. (No write policy => no direct writes.)
drop policy if exists "deandb public read" on public.deandb_state;
create policy "deandb public read"
  on public.deandb_state for select
  using (true);

-- deandb_config has NO policies, so anon can neither read nor write it.

-- 4. Set your editor passcode ------------------------------------------------
--    👉 CHANGE 'change-me-now' to a secret only Dean (and you) know.
insert into public.deandb_config (id, editor_passcode)
values (1, 'change-me-now')
on conflict (id) do update set editor_passcode = excluded.editor_passcode;

-- 5. Secure write function ----------------------------------------------------
--    Runs as the table owner (security definer) and verifies the passcode
--    before upserting. The anon role may execute it, but cannot bypass it.
create or replace function public.save_deandb(new_data jsonb, passcode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if passcode is distinct from
       (select editor_passcode from public.deandb_config where id = 1) then
    raise exception 'Invalid editor passcode';
  end if;

  insert into public.deandb_state (id, data, updated_at)
  values (1, new_data, now())
  on conflict (id) do update
    set data = excluded.data, updated_at = now();
end;
$$;

grant execute on function public.save_deandb(jsonb, text) to anon;

-- 5b. Passcode check for "editor login" --------------------------------------
--     Returns true if the passcode matches, without ever exposing the value.
create or replace function public.check_passcode(passcode text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select editor_passcode = passcode from public.deandb_config where id = 1),
    false
  );
$$;

grant execute on function public.check_passcode(text) to anon;

-- 6. Realtime: let viewers see edits the instant Dean publishes --------------
alter publication supabase_realtime add table public.deandb_state;

-- Done. Now drop your project's anon key into src/lib/config.ts (or set
-- VITE_SUPABASE_ANON_KEY at build time) and click "Publish" in the Editor.
