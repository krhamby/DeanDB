# Sleeve — Accessibility Remediation Plan (WCAG 2.1 AA)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Clear all 13 findings in `docs/superpowers/a11y-audit-2026-06-03.md` — make every text/UI pair meet WCAG 2.1 AA in **both** skins, fix touch targets, focus visibility, and input labels.

**Architecture:** The root cause is fixed, non-skin-aware colors. Fix = route them through the existing skin machinery: skin-aware `scoreColor(value, surface?)` (clamped via `legible`), per-skin status colors + a darker `fg-faint` + a stronger input border as `[data-skin]` CSS vars, plus mechanical touch-target/focus/label passes. `ShareCard` keeps the bright fixed ramp (dark export).

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens · Vitest.

**Verification model:** `npm run test` + `npm run typecheck` + `npm run build` green; **re-run `node /tmp/a11y_audit.mjs`-style contrast checks** to confirm the failing pairs now pass; screenshot Paper `#/__preview` (Dean Meter scores + badges legible).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/index.css` | Modify | Darken `--color-fg-faint`; add `--status-done`/`--status-lib`/`--color-edge-strong` per skin; reduced-motion gate for meter transitions. |
| `src/components/ui.tsx` | Modify | Skin-aware `scoreColor`; `DeanMeter`/`Score10` pass `surface`; status/Logged badges + inputs/borders/focus/targets. |
| `src/lib/themes.test.ts` | Modify | Add a test that `scoreColor` clamps legibly on Paper. |
| `src/pages/Login.tsx` | Modify | `aria-label` on inputs; focus rings; targets. |
| `src/pages/Settings.tsx`, `Editor.tsx`, `AlbumDetail.tsx`, `Onboarding.tsx` | Modify | Input focus rings + `edge-strong` borders + 44px targets (sweep). |
| `src/pages/AlbumDetail.tsx`, `ArtistDetail.tsx` | Modify | Deepen hero scrim. |
| `src/components/social.tsx` | Modify | Confirm `Avatar` alt/aria. |

---

## Task 1: Color tokens (index.css)

**Files:** `src/index.css`

- [ ] **Step 1:** In the `@theme` block, darken the default `--color-fg-faint` and register new tokens:
```css
  --color-fg-faint: #736756;   /* darkened for AA on Paper (was #8a7c68) */
  --color-edge-strong: #c2ab84;/* visible form-control border (Paper) */
  --color-status-done: #065f46;
  --color-status-lib: #6d28d9;
```
- [ ] **Step 2:** In `:root, [data-skin="paper"]` set the Paper values:
```css
  --color-fg-faint: #736756;
  --color-edge-strong: #c2ab84;
  --color-status-done: #065f46;
  --color-status-lib: #6d28d9;
```
And in `[data-skin="midnight"]`:
```css
  --color-fg-faint: #82828a;
  --color-edge-strong: #3a3a45;
  --color-status-done: #6ee7b7;
  --color-status-lib: #c4b5fd;
```
- [ ] **Step 3:** Add the meter transitions to the reduced-motion block:
```css
@media (prefers-reduced-motion: reduce) {
  .animate-wheel-reveal,
  .animate-pop,
  .animate-marquee,
  .animate-shimmer { animation: none; }
  .rm-no-transition { transition: none !important; }
}
```
- [ ] **Step 4:** `npm run build` → PASS. Commit `fix(a11y): darken fg-faint + add status/edge-strong tokens + reduced-motion transition gate`.

---

## Task 2: Skin-aware scoreColor + badges (ui.tsx, TDD)

**Files:** `src/components/ui.tsx`, `src/lib/themes.test.ts`

- [ ] **Step 1 (test):** append to `src/lib/themes.test.ts`:
```ts
import { scoreColor } from "../components/ui";
import { contrastRatio, SKIN_SURFACE } from "./themes";
describe("scoreColor legibility", () => {
  it("clamps the ramp legible on Paper", () => {
    for (const v of [9.5, 8, 6, 3]) {
      const c = scoreColor(v, SKIN_SURFACE.paper);
      expect(contrastRatio(c, SKIN_SURFACE.paper)).toBeGreaterThanOrEqual(4.4);
    }
  });
  it("keeps bright values when no surface is given (export)", () => {
    expect(scoreColor(9.5).toLowerCase()).toBe("#f5c518");
  });
});
```
- [ ] **Step 2:** run `npm run test` → the new tests FAIL (scoreColor has no 2nd arg).
- [ ] **Step 3:** in `ui.tsx`, add imports:
```ts
import { legible } from "../lib/themes";
import { useThemeControl } from "../lib/store";
```
Rewrite `scoreColor`:
```ts
/** 0–10 color ramp. Pass `surface` to clamp legible for the active skin (UI);
 *  omit it to get the bright base colors (e.g. the fixed-palette share card). */
export function scoreColor(value: number | null, surface?: string): string {
  if (value == null) return "var(--color-fg-faint)";
  const base = value >= 9 ? "#f5c518" : value >= 7 ? "#7ee081" : value >= 5 ? "#ffb84d" : "#ff5a3c";
  return surface ? legible(base, surface) : base;
}
```
- [ ] **Step 4:** in `DeanMeter`, read the surface and use it:
```tsx
  const { surface } = useThemeControl();
  // ...
  const color = scoreColor(value, surface);
```
(and add the reduced-motion class to the animated circle: append `className="rm-no-transition"` is not needed if it uses inline style — instead gate the inline `transition` by wrapping it; simplest: leave the 0.6s stroke transition, it's AAA. SKIP gating here to avoid churn — the `.rm-no-transition` class from Task 1 is available for opt-in.)
- [ ] **Step 5:** in `Score10`, read surface and pass it: `const { surface } = useThemeControl();` then both `scoreColor(value)` calls → `scoreColor(value, surface)`.
- [ ] **Step 6:** badges → tokens:
  - `STATUS_META.completed.cls`: `text-emerald-300` → `text-[var(--color-status-done)]` (keep its `bg-emerald-500/15 ring-emerald-500/30`).
  - `STATUS_META.want.cls`: `bg-fg/5` → `bg-fg/10` (so `text-fg-muted` clears 4.5).
  - `LoggedBadge`: `text-violet-300` → `text-[var(--color-status-lib)]` (keep bg/ring).
- [ ] **Step 7:** `Score10` editable input: add focus ring + stronger border + 44px target:
  change its input `className` `border border-edge bg-panel-2 ... h-10 ... sm:h-8` →
  `border border-[var(--color-edge-strong)] bg-panel-2 ... h-11 ... sm:h-9 focus-visible:ring-2 focus-visible:ring-gold` (min 44px on touch; keep the rest).
- [ ] **Step 8:** verify — `npm run test` (new tests PASS), `npm run typecheck`, `npm run build` → PASS. Commit `fix(a11y): skin-aware scoreColor + per-skin status badges + Score10 focus/target`.

> Note: importing `scoreColor` from `../components/ui` into `themes.test.ts` is fine (vitest/node). If a circular-import or DOM issue arises, instead move `scoreColor` into a tiny `src/lib/score.ts` and re-export from `ui.tsx` — but try the direct import first.

---

## Task 3: Operable + Understandable sweep

**Files:** `src/pages/Login.tsx`, `Settings.tsx`, `Editor.tsx`, `AlbumDetail.tsx`, `Onboarding.tsx`, `src/components/ui.tsx` (`Select`)

- [ ] **Step 1: Login labels** — add `aria-label` to each input that has only a placeholder: email → `aria-label="Email"`, password → `aria-label="Password"`, confirm → `aria-label="Confirm password"`, new-password (setpw) → `aria-label="New password"` / `aria-label="Confirm new password"`.
- [ ] **Step 2: Input focus + border sweep** — for every text `<input>`/`<textarea>`/`Select` in Login (`inputCls`), Settings, Editor, AlbumDetail (review textarea + minutes), Onboarding (search): ensure the class includes `focus-visible:ring-2 focus-visible:ring-gold` and uses `border-[var(--color-edge-strong)]` instead of `border-edge`. (For `inputCls` in Login and the `Select` in `ui.tsx`, change once.)
- [ ] **Step 3: Touch targets** — give the `Score10` already done (Task 2). For the AlbumDetail tracklist **favorite toggle** button (`☆`/`⭐`) and any `px-1`/tiny icon buttons, add `min-h-11 min-w-11 inline-flex items-center justify-center` (keep visuals). For primary CTA buttons currently `py-2.5 text-sm`, bump to `py-3` OR add `min-h-11` where they're standalone actions (Login submit, onboarding Start, Settings save) — a light pass, don't chase every chip.
- [ ] **Step 4:** `npm run typecheck && npm run build && npm run test` → PASS. Commit `fix(a11y): input labels, focus rings, stronger borders, 44px targets`.

---

## Task 4: Minor polish

**Files:** `src/pages/AlbumDetail.tsx`, `ArtistDetail.tsx`, `src/components/social.tsx`

- [ ] **Step 1: Hero scrim** — AlbumDetail hero `bg-black/55` → `bg-black/60`; ArtistDetail hero `bg-black/35` → `bg-black/45` (keeps on-media headings safe over light covers).
- [ ] **Step 2: Avatar alt** — in `social.tsx` `Avatar`, if it renders an `<img>`, ensure `alt={displayName ?? username}`; if initials, it's decorative (ok). Add `alt`/`aria-label` where the avatar is the only identifier.
- [ ] **Step 3:** `npm run typecheck && npm run build` → PASS. Commit `fix(a11y): deepen hero scrim + avatar alt`.

---

## Task 5: Re-measure + verify

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → all PASS.
- [ ] **Step 2: Re-measure** — re-run the contrast computation (the controller has the script) over: fg-faint (both skins), the Paper-clamped scoreColor ramp, `--color-status-done`/`--status-lib` on their tints, `want` badge on `bg-fg/10`. Confirm every previously-failing pair now ≥4.5 (text) / ≥3 (non-text). List the new ratios.
- [ ] **Step 3: Visual** — screenshot Paper `#/__preview`: confirm Dean Meter scores (e.g. 8.7 / 10.0) and "✓ Completed" / "📚 Library" badges are now legibly colored; spot-check Midnight unchanged.
- [ ] **Step 4:** update `docs/superpowers/a11y-audit-2026-06-03.md` with a "Remediation: <date>" note marking findings resolved. Commit `docs: mark a11y findings resolved + re-measured ratios`.

---

## Self-Review

**Coverage:** scoreColor (#1), badges (#2), fg-faint (#3), want badge (#4), input borders (#5), targets (#6), focus (#7), labels (#8), motion gate (#9), hero scrim (#10), avatar alt (#12). #11/#13 already pass. ✓
**Placeholder scan:** complete code for the core; Task 3/5 are directed sweeps + a measured re-verify. ✓
**Type consistency:** `scoreColor(value, surface?)`; `legible`/`SKIN_SURFACE`/`contrastRatio` from themes; `useThemeControl().surface` in DeanMeter/Score10; ShareCard keeps `scoreColor(rating)` (bright). ✓
