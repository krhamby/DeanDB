# Sleeve — §5.2 Dashboard + §5.5 Hall of Fame Layout Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).
> **Revision 2** — incorporates the plan-review findings (HoF preview sort, preview-width nesting, no-Wheel collapse, NextSpinner-width decision, snippet/`surface`, dean-token scoping, masking-in-both-views, viewer preview).

**Goal:** Deliver the *desktop layout compositions* the design spec committed to but the first pass under-delivered — the Dashboard **§5.2** rebalance (balanced hero + even closing trio) and the Hall of Fame **§5.5** poster — so the app matches the approved design, not just the rebrand. Presentation-only; no data/logic/`DeanDBData` changes.

**Background:** The merged PR elevated/reskinned the existing structures but kept the Dashboard's vertical stack and Hall of Fame's list. Spec §5.2: *"balanced hero (title + meter ⟷ featured record) … then an even three-across row (Wheel / Achievements / Hall of Fame) — fixes the right-weighting of a stacked rail."* §5.5: *"poster-like, art-forward leaderboard."* AlbumDetail §5.3 (Verdict composer) and ArtistDetail already meet spec — out of scope (verified: both already scope a per-album accent).

**Key design decision (flag to user):** The spec lists the **Wheel** as one of the three-across cards, but `NextSpinner` is a fixed-width horizontal reel (`CARD_W 168`, `w-[156px]` selection frame, dual `w-16` fades) that **breaks at ⅓ width**. The Wheel is also the #1 ownable interaction (§5.4). **Resolution:** keep the Wheel **full-width** (restyled) for owners; make the closing trio **Achievements · Hall of Fame · Now-Spinning/Season** — an even three-across that fixes the right-weighting and is identical for owner & viewer (no `canEdit` branching in the trio). The controller screenshots the result; **the user confirms it matches the studio mockup, or asks for a compact-Wheel-tile variant.**

**Architecture:** Both pages consume `DeanDBData`, shared by owner (`App.tsx` `MyJourney`, `canEdit`) and read-only viewer (`Profile.tsx`). Composition/CSS only. Hero's featured-record accent is **scoped** via inline CSS vars on the hero wrapper (mirrors `AlbumDetail` §4.2 — never `document.documentElement`; **only `--color-gold`/`-gold-soft`/`-on-accent`, leaving `--color-dean` global, exactly as AlbumDetail does**). Token-driven (both skins), reduced-motion-safe, mobile stays single-column.

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens · `legible`/`darken`/`lighten`/`pickOnAccent`/`SKIN_SURFACE` from `themes.ts` · `useThemeControl().surface` · existing `Cover`/`DeanMeter`/`Panel`/`NextSpinner`.

**Verification:** `npm run typecheck` + `npm run build` + `npm run test` green; visual via `#/__preview` in **both skins** at **desktop (≥1280px) AND mobile (~390px)**, for **both an owner (`canEdit`) and a read-only viewer (`canEdit={false}`)** Dashboard. The 3-across row is a best reconstruction of the (unsaved) studio mockup — **screenshots go to the user to confirm.**

---

## Task 1: Dashboard — featured record + balanced hero (§5.2)

**Files:** `src/pages/Dashboard.tsx`

**What:** Hero becomes a **balanced two-column composition on desktop**: left = season kicker + title + tagline + the marathon meter (keep the Summit branch); right = the **featured record** card. Hero accent is drawn from the featured record's cover, scoped to the hero. Mobile stacks with the **record below the meter** (hours stay the first thing seen). Hero renders above the empty-journey branch and is null-safe with zero albums.

- [ ] **Step 1 — imports + featured/accent.** Add `useThemeControl` to the `../lib/store` import (alongside `useMyJourney`) and `legible, darken, lighten, pickOnAccent, SKIN_SURFACE` from `../lib/themes`. Near the other hooks (Dashboard has **no early returns**, so this is safe), add `const { surface } = useThemeControl();` next to the existing `const { myUnlockedAchievementIds } = useMyJourney();`. After `recent`/`nowSpinning` are computed, add:
```tsx
  // Hero "featured record" — freshest verdict, else what's currently spinning.
  // Drives the hero's SCOPED accent (§4.2: cover-derived, gold-only like AlbumDetail).
  // (We intentionally do NOT add the lazy extractCover flow here — out of scope.)
  const featured = recent[0] ?? nowSpinning[0] ?? null;
  const heroAccent = featured ? legible(featured.dominantColor ?? featured.cover[0], surface) : null;
  const heroStyle = heroAccent
    ? ({
        ["--color-gold" as string]: heroAccent,
        ["--color-gold-soft" as string]:
          surface === SKIN_SURFACE.paper ? darken(heroAccent, 0.12) : lighten(heroAccent, 0.55),
        ["--color-on-accent" as string]: pickOnAccent(heroAccent),
      } as React.CSSProperties)
    : undefined;
```

- [ ] **Step 2 — balanced hero.** Put `style={heroStyle}` on the hero `<section>`. Restructure its body so on `lg` the meter Panel and a new **featured-record card** sit side-by-side (e.g. `grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-stretch`), stacking on mobile with the featured card **after** the meter. Left column keeps the kicker/title/tagline + the existing Summit-vs-meter Panel + count-ups untouched. The featured card (only when `featured`): a "Featured · latest verdict" kicker, the `Cover` (size `md`), title + artist, and a `DeanMeter value={featured.rating}`; the whole card is a button → `navigate(\`${basePath}/album/${featured.artistId}/${featured.id}\`)`. When `featured` is null, render the left column full-width (today's behavior).

- [ ] **Step 3:** `npm run typecheck && npm run build` → PASS. Commit `feat(dashboard): balanced hero with featured record + scoped accent (§5.2)`.

*(Controller screenshots the hero — both skins, desktop + mobile — and confirms it reads balanced.)*

---

## Task 2: Dashboard — even closing trio + full-width Wheel (§5.2)

**Files:** `src/pages/Dashboard.tsx`

**What:** Replace the lower vertical stack with: a **full-width Wheel** (owner + marathon, restyled) followed by an **even three-across closing trio** (`lg:grid-cols-3`, `items-stretch`, single-column mobile, `stagger-children`): **Achievements · Hall of Fame · Now-Spinning/Season**. The trio does **not** branch on `canEdit`, so owner and viewer get the same balanced row. Fold the standalone "Now Spinning" section into the trio's third card to avoid duplication.

- [ ] **Step 1 — Wheel stays full-width.** Leave the `NextSpinner` block (`canEdit && marathonArtistsTotal > 0`) as its own full-width section above the trio (keep the existing "Library only" teaser for `canEdit && marathonArtistsTotal === 0`). Props/logic unchanged. (Rationale: the reel needs width; see the key decision above.)

- [ ] **Step 2 — Achievements card.** A compact `Panel`: its own mini-header (`SectionTitle` or equivalent) with `unlocked.length / achievements.length`, plus the most-recent few unlocked tiles. **Secret-masking is preserved and applied here too** via `shouldMaskSecret(a, myUnlockedAchievementIds.has(a.id))` (viewer-perspective). Keep the **full** achievements grid reachable: render it below the trio inside a disclosure ("View all N achievements") that reuses the existing grid markup verbatim (masking intact) — do NOT drop the full list.

- [ ] **Step 3 — Hall of Fame preview card.** A compact `Panel` with mini-header, showing the **top 3 by rating** (mirror HallOfFame's ranking exactly, NOT `recent`):
```tsx
  const top3 = flattenAlbums(data)
    .filter((a) => a.rating != null)
    .sort((a, b) => (b.rating as number) - (a.rating as number))
    .slice(0, 3);
```
Render each as a small `Cover` + medal + score; whole card links "See the Hall of Fame →" to `${basePath}/hall-of-fame`. (Empty state: "No inductees yet.")

- [ ] **Step 4 — third card (Now Spinning / Season).** If `nowSpinning.length > 0`, a compact "Now Spinning" card (the existing now-spinning content, condensed); else a "This Season" card (season name + total time logged + the Summit progress as a one-liner). Remove the old standalone Now-Spinning section.

- [ ] **Step 5 — assemble + responsiveness.** Final order: hero → stat grid → **full-width Wheel** (owner) → **Latest Verdicts** gallery → **closing trio** (`grid gap-4 lg:grid-cols-3 items-stretch stagger-children`) → (full achievements disclosure). All three trio cards equal-height; single column on mobile. Each card self-labels (mini-header) so the row reads without a section title.

- [ ] **Step 6:** `npm run typecheck && npm run build && npm run test` → PASS. Commit `feat(dashboard): even closing trio (Achievements/HoF/Season) + full-width Wheel (§5.2)`.

*(Controller screenshots the full dashboard — both skins, desktop + mobile, owner + viewer.)*

---

## Task 3: Hall of Fame — poster composition (§5.5)

**Files:** `src/pages/HallOfFame.tsx`

**What:** Elevate the ranked **list** into a **poster-like, art-forward leaderboard**: a **podium** for the top 3 (large covers, #1 emphasized), then the remainder as a tighter ranked list; keep Desert-Island Tracks + empty state. Preserve all data logic (`flattenAlbums`, rating sort, medals, `meterName`, gold/silver/bronze medal exception).

- [ ] **Step 1 — podium (top 3).** Render `ranked.slice(0, 3)` as feature cards with large `Cover`s, the medal glyph, title/artist/year, and a prominent `DeanMeter`. Give #1 primacy (larger, or centered with #2/#3 flanking on `lg`; stacked on mobile). Keep the `rankClass` gold/silver/bronze treatment.
- [ ] **Step 2 — the rest.** `ranked.slice(3)` as the current compact ranked rows (tightened) beneath the podium.
- [ ] **Step 3 — keep** Desert-Island Tracks + the "no rated albums yet" empty state unchanged in logic.
- [ ] **Step 4:** `npm run typecheck && npm run build` → PASS. Commit `feat(hall-of-fame): poster podium for the top 3 (§5.5)`.

*(Controller screenshots HoF — both skins, desktop + mobile.)*

---

## Task 4: Preview width + viewer section + QA

**Files:** `src/pages/Preview.tsx`; then QA.

- [ ] **Step 1 — realistic preview width (fix the nesting).** The harness wraps everything in `mx-auto max-w-4xl` (Preview.tsx ~71). A `max-w-6xl` wrapper *inside* that is a **no-op** (a child can't exceed a constrained parent). So: **hoist the Dashboard + Hall of Fame sections out of the `max-w-4xl` container** — e.g. close the `max-w-4xl` wrapper before them and render those two `Section`s inside their own `mx-auto max-w-6xl` wrapper (matching real journey-page width), then continue. Don't widen the Brand sheet / skeletons / other sections.
- [ ] **Step 2 — add a read-only viewer Dashboard.** The harness only renders `canEdit` dashboards, so the no-Wheel/viewer path is never seen. Add a second Dashboard section `canEdit={false}` (same `sampleJourney`) so the trio's owner-vs-viewer behavior is actually screenshot-tested.
- [ ] **Step 3 — gate:** `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 4 — code review:** presentation-only; no `DeanDBData`/handler/API change; `NextSpinner`/achievements/secret-masking preserved (compact **and** expanded); hero accent scoped (gold-only, no `document.documentElement`); HoF preview sorted by rating; tokens both skins; reduced-motion-safe; mobile single-column.
- [ ] **Step 5 — controller visual:** screenshot `#/__preview` Dashboard (owner + viewer) + Hall of Fame in **Paper AND Midnight**, **desktop + mobile**. Confirm: balanced hero (no right-weighting), even trio that collapses cleanly on mobile and stays even for the viewer (no Wheel), HoF podium. Iterate. **Then surface the desktop screenshots to the user to confirm the composition matches the studio mockup — especially the Wheel-placement decision.**

---

## Self-Review
**Coverage:** §5.2 balanced hero + featured record (T1) and even closing trio + full-width Wheel (T2); §5.5 podium (T3); realistic + viewer preview + QA (T4). AlbumDetail §5.3 / ArtistDetail confirmed already-to-spec, excluded. ✓
**Review findings folded in:** HoF preview sorts by rating (T2.3); preview-width nesting fixed by hoisting (T4.1); viewer preview added (T4.2); no-Wheel handled by keeping Wheel full-width + canEdit-independent trio (T2); NextSpinner-width risk resolved + flagged to user; snippet includes `surface`; dean token left global (stated); masking preserved in compact + expanded (T2.2); mobile hero order pinned (T1.2). ✓
**Type consistency:** `featured: AlbumWithArtist | null`; `heroStyle?: React.CSSProperties`; helpers from themes.ts; `useThemeControl().surface`; `Album.dominantColor?`/`cover` real. ✓
