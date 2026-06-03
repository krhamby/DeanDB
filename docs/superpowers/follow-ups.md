# Sleeve — Follow-ups & TODOs

Running list of deferred items surfaced during the Sleeve UI/UX elevation. Not blockers for the
phases they came from; parked here so they aren't lost.

## High priority

- [ ] **Accessibility / contrast expert review across the whole app.** Run a WCAG 2.1 **AA** audit of
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

- [ ] **Per-album `--color-gold-soft`** is currently set equal to the album accent on the scoped detail-page
  wrapper (not a softened variant like `applyTheme` derives). Mirror the soft derivation if the difference
  ever shows (used by `text-gold-soft` / subtle fills).
- [ ] **Preview harness noise:** `AlbumDetail` calls the `album_aggregate` RPC on mount, which 400s for the
  fixture's fake album ids in `#/__preview` (caught + harmless). Optionally skip the aggregate fetch when in
  preview to keep the dev console clean.
- [ ] **Midnight contrast pass** when the in-app skin toggle ships (Phase 4): re-audit the dark skin once it's
  user-reachable (today Paper is the default and Midnight is dev/localStorage-only).
