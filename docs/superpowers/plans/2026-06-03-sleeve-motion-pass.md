# Sleeve — Motion Language Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the whole app feel alive (spec §4.4) — a "needle-drop" page transition on every navigation, a tasteful staggered rise on signature card grids, and tactile press feedback on cards. Layered so they complement: the page **fades in**, content **rises in sequence**. Fully `prefers-reduced-motion`-gated.

**Architecture:** Two new CSS utilities in `index.css` — `.animate-fade-in` (opacity-only, for the routed page) and `.stagger-children` (per-child rise with small incremental delays). `Layout`'s `<main>` is keyed on the route so it remounts + fades on each navigation (plus scroll-to-top). `.stagger-children` is applied to three high-visibility grids. Cards gain `active:scale` press feedback. No new deps, no behavior change.

**Tech Stack:** React 18 + TS · Tailwind v4 · CSS keyframes.

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green; visual in `#/__preview` (content renders at full opacity — not stuck at 0 — in both skins); reduced-motion sanity (animations disabled).

---

## Task 1: Motion utilities (index.css)

**Files:** `src/index.css`

- [ ] **Step 1:** after the existing `.animate-wheel-reveal` block (before the `@media (prefers-reduced-motion)` block), add:
```css
/* Page transition — a calm fade as the routed view mounts. */
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
.animate-fade-in { animation: fade-in 0.25s ease both; }

/* Staggered rise for signature card grids (applied to the grid container). */
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.stagger-children > * { animation: rise 0.42s cubic-bezier(0.16, 1, 0.2, 1) both; }
.stagger-children > *:nth-child(1) { animation-delay: 0.02s; }
.stagger-children > *:nth-child(2) { animation-delay: 0.06s; }
.stagger-children > *:nth-child(3) { animation-delay: 0.10s; }
.stagger-children > *:nth-child(4) { animation-delay: 0.14s; }
.stagger-children > *:nth-child(5) { animation-delay: 0.18s; }
.stagger-children > *:nth-child(6) { animation-delay: 0.22s; }
.stagger-children > *:nth-child(n + 7) { animation-delay: 0.26s; }
```

- [ ] **Step 2:** extend the reduced-motion block so these are disabled too (so nothing is ever stuck mid-animation):
```css
@media (prefers-reduced-motion: reduce) {
  .animate-wheel-reveal,
  .animate-pop,
  .animate-marquee,
  .animate-shimmer,
  .animate-fade-in,
  .stagger-children > * { animation: none; }
  .rm-no-transition { transition: none !important; }
}
```
(Replace the existing reduced-motion block with this expanded one — keep `.rm-no-transition`.)

- [ ] **Step 3:** `npm run build` → PASS. Commit `feat(motion): fade-in + staggered-rise utilities (reduced-motion gated)`.

---

## Task 2: Page transition + scroll reset (Layout)

**Files:** `src/components/Layout.tsx`

- [ ] **Step 1:** the main `Layout` component already has `const route = useHashRoute();` (~line 268) and imports `useEffect`. Add a scroll-to-top on route change (place with the other effects in that component):
```tsx
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);
```
- [ ] **Step 2:** key the `<main>` on the route and fade it in. Change:
```tsx
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
```
to:
```tsx
      <main key={route} className="mx-auto max-w-6xl px-4 py-8 animate-fade-in">{children}</main>
```
- [ ] **Step 3:** `npm run typecheck && npm run build` → PASS. Commit `feat(motion): needle-drop page transition + scroll reset on navigation`.

---

## Task 3: Stagger signature grids + card press feedback

**Files:** `src/pages/Dashboard.tsx`, `src/pages/ArtistDetail.tsx`, `src/pages/HallOfFame.tsx`, `src/components/cards.tsx`

- [ ] **Step 1:** add `stagger-children` to three grid containers (append to the existing className):
  - `Dashboard.tsx` "Latest Verdicts" grid (`<div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">`) → add ` stagger-children`.
  - `ArtistDetail.tsx` album grid (`<div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4">`) → add ` stagger-children`.
  - `HallOfFame.tsx` ranked list (`<div className="space-y-2">`) → add ` stagger-children`.
- [ ] **Step 2:** card press feedback in `cards.tsx`:
  - `AlbumCard` root button: it has `transition-transform hover:-translate-y-1` → add `active:scale-[0.98]`.
  - `ArtistCard` root button: it has `transition-all hover:border-gold/40 hover:bg-panel-2` → add `active:scale-[0.99]`.
- [ ] **Step 3:** `npm run typecheck && npm run build && npm run test` → PASS. Commit `feat(motion): stagger signature grids + tactile card press`.

---

## Task 4: QA

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 2: Code review** — `both` fill is fine because the reduced-motion block sets `animation: none` (full-opacity resting state); `.stagger-children` is only on grid containers whose DIRECT children are the cards/rows; page key is the route string; nothing else changed.
- [ ] **Step 3 (controller, visual):** load `#/__preview` (both skins) — confirm all content renders at **full opacity** (not stuck at 0), grids look correct. (Animation itself won't show in a static screenshot; the key check is nothing is left invisible.) Optionally toggle the OS reduce-motion and confirm content still shows.

---

## Self-Review
**Coverage:** spec §4.4 motion language — page transition (Layout), count-ups (already shipped Phase 2b), card lifts/press (cards), staggered reveals (grids). Reduced-motion fully honored. ✓
**Placeholder scan:** exact edits; Task 4 Step 3 is an explicit controller visual check. ✓
**Type consistency:** uses existing `route`/`useHashRoute`/`useEffect` in Layout; pure CSS + className additions elsewhere. ✓
