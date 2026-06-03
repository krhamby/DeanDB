-- Accessibility (plan §D5): let a user lock the app to THEIR OWN theme, so other
-- users' profile accent themes are never applied while they browse those
-- profiles. This is a VIEWER-side preference (the signed-in user's own flag
-- gates whether profile-theme overrides apply when they view others).
--
-- Existing profiles RLS already covers this column: the SELECT policy
-- (can_view_journey / public identity) and the UPDATE policy (id = auth.uid()),
-- so no policy changes are needed.

alter table public.profiles
  add column if not exists lock_own_theme boolean not null default false;
