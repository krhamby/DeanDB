# Sleeve — Follow-ups & TODOs

Running list of deferred items surfaced during the Sleeve UI/UX elevation. Not blockers for the
phases they came from; parked here so they aren't lost.

## High priority

- [x] **Accessibility / contrast expert review across the whole app.** ✅ Done 2026-06-03 — measured audit + full remediation; see [a11y-audit-2026-06-03.md](a11y-audit-2026-06-03.md) (all findings resolved, both skins now AA). Run a WCAG 2.1 **AA** audit of
  every surface in **both skins** (Paper = light/default, Midnight = dark), since the redesign introduced
  light-mode and per-album/per-cover dynamic accent colors. Specifically check:
  - Text/!accent contrast on **Paper** cream (`--color-surface` `#f1e8d8`) — especially `--color-fg-muted`
    / `--color-fg-faint` on panels, and `text-gold`/accent text after the `legible()` clamp.
  - **Accent fills**: `bg-gold` + `--color-on-accent` (deep-amber + white on Paper; bright-gold + black on
    Midnight) across buttons/pills/badges.
  - **Per-album accents** (`AlbumDetail`/`ArtistDetail` scoped `--color-gold`): worst-case cover colors
    after `legible()` — confirm they clear AA on both skins, and on-media hero text over cover gradients.
  - **Focus visibility**: `ring-fg/*` focus rings on both skins (keyboard nav).
  - The Dean Meter score ramp (`scoreColor()`) and `StatusBadge` variants on both skins.
  - Touch-target sizes (≥44px) and `prefers-reduced-motion` coverage for new animations (Wheel reveal, etc.).
  - Tooling: the `design:accessibility-review` skill + the `#/__preview` harness (renders all surfaces with
    sample data; toggle skins) make this auditable without a logged-in account.

## Minor / polish

- [ ] **Error-text contrast on light (`text-dean` on panels).** `text-dean` (`#ff5a3c`) is used for inline error
  messages (Settings save/validation, etc.) and is ~3:1 on the Paper panel — below AA for normal-size text. The
  a11y pass left the brand red as-is; revisit with a surface-aware error token (mirror `--color-status-done`,
  e.g. a darker dean on Paper / brighter on Midnight) if we want errors to clear AA everywhere. (Success text was
  fixed to `--color-status-done` on 2026-06-03.)
- [ ] **Live badge-unlock toasts:** when `useMyJourney` detects a newly unlocked achievement, surface a transient neon toast (portal + the existing `detectAndRecord` diff). Deferred from Phase 2d (needs global toast state).

- [ ] **Per-album `--color-gold-soft`** is currently set equal to the album accent on the scoped detail-page
  wrapper (not a softened variant like `applyTheme` derives). Mirror the soft derivation if the difference
  ever shows (used by `text-gold-soft` / subtle fills).
- [ ] **Preview harness noise:** `AlbumDetail` calls the `album_aggregate` RPC on mount, which 400s for the
  fixture's fake album ids in `#/__preview` (caught + harmless). Optionally skip the aggregate fetch when in
  preview to keep the dev console clean.
- [ ] **Midnight contrast pass** when the in-app skin toggle ships (Phase 4): re-audit the dark skin once it's
  user-reachable (today Paper is the default and Midnight is dev/localStorage-only).
- [ ] **More share artifacts:** "Season Wrapped" (calendar-year recap) card and a Hall-of-Fame poster, plus OG link-unfurl previews (needs a Supabase Edge Function — Phase 5). Phase 3c shipped only the Verdict card.
