# Sleeve — §5.2 Dashboard + §5.5 Hall of Fame Layout Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Deliver the *desktop layout compositions* the design spec committed to but the first pass under-delivered — the Dashboard **§5.2** rebalance (balanced hero + even three-across closing row) and the Hall of Fame **§5.5** poster — so the app matches the approved design, not just the rebrand. Presentation-only; no data/logic/`DeanDBData` changes.

**Background (why this exists):** The PR that merged elevated/reskinned the existing page structures but kept the Dashboard's vertical stack and Hall of Fame's list. Spec §5.2 explicitly called for *"balanced hero (title + meter ⟷ featured record) … then an even three-across row (Wheel / Achievements / Hall of Fame) — fixes the right-weighting of a stacked rail,"* and §5.5 for a *"poster-like, art-forward leaderboard."* AlbumDetail §5.3 (Verdict composer) and ArtistDetail already meet spec — out of scope here.

**Architecture:** Both pages consume `DeanDBData` and are shared by the owner view (`App.tsx` `MyJourney`, `canEdit`) and the read-only profile view (`Profile.tsx`). All changes are composition/CSS only. The hero's featured-record accent is **scoped** via an inline CSS var on the hero wrapper (mirrors `AlbumDetail`/§4.2 — never `document.documentElement`, so no nav flash). Everything stays token-driven (both skins), reduced-motion-safe, and behind the existing responsive breakpoints (`sm`/`lg`) so mobile keeps its single-column stack.

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens · `legible()`/`SKIN_SURFACE` from `themes.ts` · existing `Cover`/`DeanMeter`/`Panel`/`NextSpinner`.

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green; visual via `#/__preview` in **both skins** at **desktop AND mobile widths** — the controller screenshots and iterates. Because the 3-across row needs realistic width, the preview's Dashboard section is widened to the real `max-w-6xl` for the shot. **The 3-across row is a best reconstruction of the studio mockup (which wasn't saved as a file); the controller screenshots it for the user to confirm it matches their memory.**

---

## Task 1: Dashboard — featured record + balanced hero (§5.2)

**Files:** `src/pages/Dashboard.tsx`

**What:** Turn the hero from `title + tagline + full-width meter panel` into a **balanced two-column composition on desktop**: left = season kicker + title + tagline + the marathon meter; right = the **featured record** (its cover, title, score). Draw the hero's accent from the featured record's cover color, scoped to the hero only. On mobile it stacks (record under the meter, or above — controller decides visually).

- [ ] **Step 1 — pick the featured record + scoped accent.** After the existing `recent`/`nowSpinning` computation, add:
```tsx
  // The hero's "featured record" — the freshest verdict, else what's currently
  // spinning. Drives the hero's scoped accent (§4.2: cover-derived, not global).
  const featured = recent[0] ?? nowSpinning[0] ?? null;
  const heroAccent = featured ? legible(featured.dominantColor ?? featured.cover[0], surface) : null;
```
Import `legible` from `"../lib/themes"` and `useThemeControl` (for `surface`) from `"../lib/store"` (note: `useMyJourney` is already imported; add `useThemeControl`). `Album` already carries `dominantColor?`/`cover`.

- [ ] **Step 2 — scope the accent on the hero `<section>`.** Give the hero section an inline style that sets `--color-gold`/`--color-gold-soft`/`--color-on-accent` from `heroAccent` **only when `featured` exists** (mirror `AlbumDetail` lines 126–132: `darken(accent,0.12)` on Paper / `lighten(accent,0.55)` on Midnight; `pickOnAccent`). Import `darken, lighten, pickOnAccent, SKIN_SURFACE`. When `featured` is null, render the hero exactly as today (no scoped style).

- [ ] **Step 3 — balanced two-column hero.** Restructure the hero `<section>` so the meter Panel and a new **featured-record card** sit side-by-side on `lg` (`grid lg:grid-cols-[1fr_320px] gap-6 items-stretch` or similar — controller tunes the ratio so it reads balanced, fixing the right-weighting), stacking on mobile. The featured card: the album `Cover` (size `md`/`lg`), a "Featured / Latest verdict" kicker, the album title + artist, and a `DeanMeter` for its score; the whole card links to the album (`navigate(\`${basePath}/album/${featured.artistId}/${featured.id}\`)`). Keep the existing Summit-vs-meter branch intact inside the left column. Preserve the `animate-pop` and count-up.

- [ ] **Step 4:** `npm run typecheck && npm run build` → PASS. Commit `feat(dashboard): balanced hero with featured record + scoped accent (§5.2)`.

*(Controller screenshots the hero, both skins, desktop + mobile; confirms it reads balanced, not right-weighted.)*

---

## Task 2: Dashboard — even three-across closing row (§5.2)

**Files:** `src/pages/Dashboard.tsx`

**What:** Replace the lower **stacked rail** (standalone full-width Wheel section + full-width Achievements grid) with an **even three-across row on desktop** (`lg:grid-cols-3`, stacking on mobile): **Wheel · Achievements · Hall of Fame**. Each is a `Panel` of equal weight. This is the rebalance §5.2 calls out.

- [ ] **Step 1 — Wheel card.** Move the `NextSpinner` (owner + `marathonArtistsTotal > 0`) into the first column as a compact card. If the viewer can't spin (not owner, or no marathon artists), this slot shows a small "Up next" teaser or collapses (controller decides so the row stays even — e.g. a 2-across row when there's no Wheel). Keep `NextSpinner`'s props/logic unchanged; only its container changes.
- [ ] **Step 2 — Achievements card.** A compact summary: the `unlocked.length / achievements.length` count, the most-recent few unlocked emoji/titles, and a "View all" affordance. Keep the full detail reachable — either a disclosure that expands the full grid in place, or keep the full grid rendered below the row on mobile. (Do NOT lose access to the full achievements list; controller picks the cleanest pattern. Secret-masking logic via `shouldMaskSecret` must be preserved.)
- [ ] **Step 3 — Hall of Fame preview card.** Top 3 rated records as small covers + scores (reuse `flattenAlbums` + the existing `recent`/ranked sort, or compute a `top3` by rating), with a "See the Hall of Fame →" link to `${basePath}/hall-of-fame`. This is what puts HoF into the dashboard composition per §5.2.
- [ ] **Step 4 — order + responsiveness.** Final dashboard order: hero → stat grid → Now Spinning (if any) → **Latest Verdicts** (full-width gallery) → **three-across row**. Row is `grid gap-4 lg:grid-cols-3` (or `lg:grid-cols-2` when no Wheel), `items-stretch` so cards are even height; single column on mobile. Use `stagger-children` for entrance.
- [ ] **Step 5:** `npm run typecheck && npm run build && npm run test` → PASS. Commit `feat(dashboard): even three-across Wheel/Achievements/Hall-of-Fame row (§5.2)`.

*(Controller screenshots the full dashboard, both skins, desktop + mobile.)*

---

## Task 3: Hall of Fame — poster composition (§5.5)

**Files:** `src/pages/HallOfFame.tsx`

**What:** Elevate the ranked **list** into a **poster-like, art-forward leaderboard**: a **podium** for the top 3 (large covers, rank 1 emphasized — bigger/centered), then the remainder as a tighter ranked grid/list; keep the Desert-Island Tracks section. Preserve all data logic (`flattenAlbums`, ranking, medals, `meterName`).

- [ ] **Step 1 — podium (top 3).** Render `ranked.slice(0,3)` as three feature cards with large `Cover`s, the medal, album title/artist/year, and a prominent `DeanMeter`. Give #1 visual primacy (larger, or centered with #2/#3 flanking on desktop; stacked on mobile). Keep the gold/silver/bronze accent treatment (the documented medal exception).
- [ ] **Step 2 — the rest.** `ranked.slice(3)` as a compact ranked list/grid (the current row treatment is fine, tightened) under the podium.
- [ ] **Step 3 — keep** the Desert-Island Tracks section and the empty state.
- [ ] **Step 4:** `npm run typecheck && npm run build` → PASS. Commit `feat(hall-of-fame): poster podium for the top 3 (§5.5)`.

*(Controller screenshots HoF, both skins, desktop + mobile.)*

---

## Task 4: Preview width + QA

**Files:** `src/pages/Preview.tsx`; then QA.

- [ ] **Step 1 — realistic preview width.** The harness wraps sections in `max-w-4xl`, too narrow to judge the 3-across row (real journey pages are `max-w-6xl`). Widen the Dashboard + Hall of Fame preview sections to `max-w-6xl` (e.g. wrap those two `Section`s in a `<div className="mx-auto max-w-6xl">` or add a prop), so screenshots reflect production width. Don't change other sections.
- [ ] **Step 2 — gate:** `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 3 — code review:** presentation-only; no `DeanDBData`/handler/API change; `NextSpinner`/achievements/secret-masking logic preserved; hero accent scoped (no `document.documentElement` mutation); tokens both skins; reduced-motion-safe; mobile still single-column.
- [ ] **Step 4 — controller visual:** screenshot `#/__preview` Dashboard + Hall of Fame in **Paper AND Midnight**, at **desktop (≥1280px) and mobile (~390px)** widths. Confirm: balanced hero (no right-weighting), even 3-across row that collapses cleanly on mobile, HoF podium. Iterate until it reads like the spec. **Then surface the desktop screenshots to the user to confirm the composition matches the studio mockup they remember.**

---

## Self-Review
**Coverage:** §5.2 balanced hero + featured record (Task 1) and three-across row (Task 2); §5.5 poster podium (Task 3); realistic preview + QA (Task 4). AlbumDetail §5.3 / ArtistDetail confirmed already-to-spec, excluded. ✓
**Placeholder scan:** Task 1 has concrete code for the load-bearing accent/featured logic; Tasks 2–3 are design-direction + acceptance criteria the controller verifies by screenshot (the studio mockup wasn't saved, so visual confirmation with the user is the gate). ✓
**Type consistency:** `featured: AlbumWithArtist | null`; `legible/darken/lighten/pickOnAccent/SKIN_SURFACE` from themes.ts; `useThemeControl().surface`; `Album.dominantColor?`/`cover` real. ✓
