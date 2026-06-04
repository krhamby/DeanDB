# Sleeve — Phase 1: Foundation (Theming Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the "Sleeve" visual foundation — Fraunces + Inter typography, a skin-able semantic token system with **Paper** (warm off-white editorial) as the default, surface-aware contrast math, and automatic per-album accent color — without changing any data, routes, or the `DeanDBData` keystone.

**Architecture:** Tailwind v4 already drives `bg-panel`/`border-edge`/`text-gold`/`from-dean` from `@theme` CSS variables, so re-skinning is mostly **redefining those variables under a `[data-skin]` attribute** — existing token-based utilities reskin for free. Only *hardcoded* dark assumptions (`text-white`, `text-zinc-*`, raw hex in JS) get migrated to new semantic foreground tokens (`fg`/`fg-muted`/`fg-faint`). Hero/cover "on-media" zones stay light in both skins by design. Per-album accent is a **scoped CSS-var override** (`--color-gold`) on the detail-page wrapper — no global state, no nav flash. The contrast helper `legible()` is generalized to clamp an accent toward legibility against *whichever* surface is active (lighten on dark, darken on light).

**Tech Stack:** React 18 + TS (strict) · Vite 6 · Tailwind CSS v4 (config-less, `@theme` in `src/index.css`) · `@fontsource-variable/*` for self-hosted fonts · Vitest (new — pure-function tests only).

**Verification model (read this — it differs from generic TDD):** This project has **no test runner today**; the existing gate is `npm run typecheck` / `npm run build` (see `CLAUDE.md`). We add **Vitest for *pure functions only*** (the contrast math), where TDD genuinely pays off. For UI/visual work the gate is: **`npm run typecheck` green → `npm run build` green → visual check in `npm run dev`** (and a quick `data-skin="midnight"` toggle in DevTools to sanity-check contrast). Do not invent a DOM testing stack for component tasks.

**Out of scope for this plan (own follow-up plans):** motion/needle-drop transitions, the gradient-first loading language + skeletons, the service-worker cover cache, real cover-color extraction + Supabase Storage, the Midnight toggle UI + `profiles.skin` persistence (Midnight values are authored here; persistence lands with Phase 4). See the spec at `docs/superpowers/specs/2026-06-03-sleeve-ui-elevation-design.md`.

---

## File Structure

| File | Change | Responsibility after this plan |
|---|---|---|
| `package.json` | Modify | Add `@fontsource-variable/fraunces`, `@fontsource-variable/inter`, `vitest` (dev), `test` script. |
| `src/main.tsx` | Modify | Import the two variable fonts (Vite bundles them, base-path safe). |
| `src/index.css` | Modify | Register `fg`/`fg-muted`/`fg-faint` + `surface`/`app-bg` tokens in `@theme`; define **Paper** (default) + **Midnight** skin maps under `[data-skin]`; skin-drive `body`, scrollbar, fonts. |
| `index.html` | Modify | Default `data-skin="paper"` on `<html>` (no first-paint flash); update `theme-color`. |
| `src/lib/themes.ts` | Modify | Generalize `legible()`/add `darken()`; make `applyTheme(theme, surface)` surface-aware; export `SKIN_SURFACE`. |
| `src/lib/themes.test.ts` | Create | Vitest unit tests for the contrast math on both surfaces. |
| `src/lib/store.tsx` | Modify | `ThemeProvider` tracks the active skin (localStorage, default `paper`), sets `document.documentElement.dataset.skin`, passes the skin surface to `applyTheme`; expose `skin`/`surface`/`setSkin` on `ThemeContext`. |
| `src/components/ui.tsx` | Modify | Replace hardcoded chrome colors + JS hex (`scoreColor` unrated, `DeanMeter` track ring, `Score10` input, `StatusBadge` "want", `ProgressBar` track, `SectionTitle`, `Select`) with tokens. |
| `src/components/cards.tsx` | Modify | `AlbumCard`/`ArtistCard` chrome text → tokens (hero/cover overlays stay on-media). |
| `src/components/Layout.tsx` | Modify | Header/footer chrome text → tokens (token sweep, per checklist). |
| `src/pages/*.tsx` | Modify | On-surface `text-white`/`text-zinc-*` → tokens via the sweep checklist; on-media hero text left as-is. |
| `src/pages/AlbumDetail.tsx` | Modify | Wrap return in a scoped per-album accent (`--color-gold` = legible cover color). |
| `src/pages/ArtistDetail.tsx` | Modify | Same scoped per-album accent from `artist.color`. |

---

## Task 0: Add Vitest (pure-function tests only)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

Run: `cd /Users/kevinhamby/Documents/deandb/DeanDB && npm i -D vitest`
Expected: adds `vitest` to `devDependencies`, no peer-dep errors.

- [ ] **Step 2: Add a `test` script**

In `package.json`, add to `"scripts"` (after `"typecheck"`):

```json
    "test": "vitest run"
```

- [ ] **Step 3: Verify the runner starts (no tests yet is fine)**

Run: `npm run test`
Expected: Vitest runs and reports "No test files found" (exit 0 or the "no tests" notice). This confirms wiring before we write the first test in Task 2.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest for pure-function unit tests"
```

---

## Task 1: Self-host Fraunces + Inter

**Files:**
- Modify: `package.json`, `src/main.tsx`, `src/index.css`, `index.html`

- [ ] **Step 1: Install the variable fonts**

Run: `npm i @fontsource-variable/fraunces @fontsource-variable/inter`
Expected: both packages added to `dependencies`. (Fontsource ships self-hosted woff2 + `@font-face`; Vite bundles them through the `/DeanDB/` base path automatically — no manual subsetting, no CDN.)

- [ ] **Step 2: Import the fonts at the app entry**

In `src/main.tsx`, add these imports at the very top (before the existing imports):

```ts
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
```

- [ ] **Step 3: Point the font tokens at the new families**

In `src/index.css`, inside the existing `@theme { … }` block, replace the `--font-display` line and add a UI font token:

```css
  --font-display: "Fraunces Variable", "Fraunces", Georgia, serif;
  --font-ui: "Inter Variable", "Inter", system-ui, -apple-system, sans-serif;
```

Then change the `body { font-family: … }` declaration to use Inter:

```css
  font-family: var(--font-ui);
```

- [ ] **Step 4: Preload to cut FOUT on the display face**

In `index.html`, the fonts are bundled by Vite so no manual `<link rel="preload">` path is stable; instead rely on `font-display`. Confirm no action needed here beyond Step 5. (Skip — documented intentionally so the next engineer doesn't add a broken hashed preload path.)

- [ ] **Step 5: Verify build + visual**

Run: `npm run build`
Expected: PASS (type-check + Vite build) with the two font packages bundled into `dist/assets`.
Then `npm run dev` and confirm: body text renders in Inter; any `font-display`/`.font-display` headings (e.g. the Dashboard `<h1>`) render in Fraunces serif.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/main.tsx src/index.css
git commit -m "feat(type): self-host Fraunces (display) + Inter (UI)"
```

---

## Task 2: Generalize the contrast math for any surface

Today `themes.ts` hardcodes `SURFACE = "#15151a"` and `legible()` only *lightens*. Paper needs to *darken* a too-light accent. Make the surface a parameter and clamp in the correct direction.

**Files:**
- Modify: `src/lib/themes.ts`
- Create: `src/lib/themes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/themes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { legible, contrastRatio, darken, SKIN_SURFACE } from "./themes";

const MIDNIGHT = SKIN_SURFACE.midnight; // "#15151a"
const PAPER = SKIN_SURFACE.paper;       // off-white

describe("contrast math", () => {
  it("clears 4.5:1 against the dark surface by lightening", () => {
    const out = legible("#3a2c00", MIDNIGHT); // very dark gold
    expect(contrastRatio(out, MIDNIGHT)).toBeGreaterThanOrEqual(4.5);
  });

  it("clears 4.5:1 against the light Paper surface by darkening", () => {
    const out = legible("#f5c518", PAPER); // bright gold is illegible on cream
    expect(contrastRatio(out, PAPER)).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves an already-legible color essentially unchanged", () => {
    const out = legible("#e9e9ee", MIDNIGHT);
    expect(out.toLowerCase()).toBe("#e9e9ee");
  });

  it("darken moves a color toward black", () => {
    expect(contrastRatio(darken("#ffffff", 0.5), "#ffffff")).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test`
Expected: FAIL — `darken`, `SKIN_SURFACE`, and the 2-arg `legible` signature don't exist yet.

- [ ] **Step 3: Implement the generalized helpers**

In `src/lib/themes.ts`:

(a) Add a `darken()` beside `lighten()`:

```ts
/** Mix a hex color toward black by `amt` (0–1). */
export function darken(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * (1 - amt));
  const to2 = (c: number) => mix(c).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
```

(b) Add the skin surfaces and keep `SURFACE` as the Midnight default for back-compat:

```ts
/** The base surface each skin sits on (drives the contrast clamp direction). */
export const SKIN_SURFACE = { midnight: "#15151a", paper: "#f1e8d8" } as const;
export type SkinId = keyof typeof SKIN_SURFACE;
```

(c) Replace `legible()` so it takes a surface and clamps in the correct direction:

```ts
/**
 * Nudge a colour just enough to clear `min`:1 contrast against `surface`,
 * preserving hue. On a dark surface we lighten; on a light surface we darken.
 * Already-legible colours pass through untouched.
 */
export function legible(hex: string, surface: string = SKIN_SURFACE.midnight, min = 4.5): string {
  let c = isHexColor(hex) ? hex : DEFAULT_THEME.accent;
  const surfaceIsDark = relativeLuminance(surface) < 0.5;
  for (let i = 0; i < 24 && contrastRatio(c, surface) < min; i++) {
    c = surfaceIsDark ? lighten(c, 0.1) : darken(c, 0.1);
  }
  return c;
}
```

(d) Make `applyTheme` surface-aware (default Midnight keeps current callers working):

```ts
export function applyTheme(t: Theme, surface: string = SKIN_SURFACE.midnight): void {
  if (typeof document === "undefined") return;
  const accent = legible(isHexColor(t.accent) ? t.accent : DEFAULT_THEME.accent, surface);
  const secondary = legible(isHexColor(t.secondary) ? t.secondary : DEFAULT_THEME.secondary, surface);
  const root = document.documentElement.style;
  root.setProperty("--color-gold", accent);
  root.setProperty("--color-gold-soft", surface === SKIN_SURFACE.paper ? darken(accent, 0.12) : lighten(accent, 0.55));
  root.setProperty("--color-dean", secondary);
}
```

> Note: the old single-arg `legible(hex)` call site inside `applyTheme` is replaced above. Remove the now-unused module constant `SURFACE` only if nothing else references it (grep first: `grep -n "SURFACE" src/lib/themes.ts` — keep `SKIN_SURFACE`).

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm run test`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `npm run typecheck`
Expected: PASS. (If `SURFACE` was removed, ensure no other file imported it: `grep -rn "SURFACE" src` should show only `SKIN_SURFACE`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/themes.ts src/lib/themes.test.ts
git commit -m "feat(theme): surface-aware legible() + darken() with vitest coverage"
```

---

## Task 3: Define the skin token system (Paper default + Midnight)

**Files:**
- Modify: `src/index.css`, `index.html`

- [ ] **Step 1: Register semantic foreground + surface tokens in `@theme`**

In `src/index.css`, inside `@theme { … }`, add these tokens (keep the existing `--color-ink/panel/panel-2/edge/gold/...`):

```css
  --color-fg: #241c14;        /* primary text (Paper default) */
  --color-fg-muted: #6f6353;  /* secondary text */
  --color-fg-faint: #8a7c68;  /* tertiary text / hints */
  --color-surface: #f1e8d8;   /* base page surface */
```

(These defaults are Paper; the `[data-skin]` blocks below make them authoritative per skin. Registering them in `@theme` generates the `text-fg`, `text-fg-muted`, `text-fg-faint`, `bg-surface` utilities we use in the sweep.)

- [ ] **Step 2: Add the skin maps after the `@theme` block**

In `src/index.css`, immediately after the closing `}` of `@theme`, add:

```css
/* ── Skins: Paper (default) + Midnight. Override the @theme tokens per skin so
   every token-driven utility (bg-panel, text-gold, text-fg…) reskins for free. */
:root, [data-skin="paper"] {
  --color-ink: #f1e8d8;
  --color-panel: #fcf7ec;
  --color-panel-2: #f6efe1;
  --color-edge: #e2d5bf;
  --color-fg: #241c14;
  --color-fg-muted: #6f6353;
  --color-fg-faint: #8a7c68;
  --color-surface: #f1e8d8;
  --app-bg:
    radial-gradient(1200px 600px at 80% -10%, color-mix(in srgb, var(--color-gold) 14%, transparent), transparent 60%),
    radial-gradient(900px 500px at -10% 10%, color-mix(in srgb, var(--color-dean) 10%, transparent), transparent 55%),
    var(--color-surface);
  --scrollbar-track: #e7dcc7;
  --scrollbar-thumb: #cdbfa4;
}
[data-skin="midnight"] {
  --color-ink: #0a0a0b;
  --color-panel: #15151a;
  --color-panel-2: #1d1d24;
  --color-edge: #2a2a33;
  --color-fg: #e9e9ee;
  --color-fg-muted: #a1a1aa;
  --color-fg-faint: #71717a;
  --color-surface: #15151a;
  --app-bg:
    radial-gradient(1200px 600px at 80% -10%, color-mix(in srgb, var(--color-gold) 8%, transparent), transparent 60%),
    radial-gradient(900px 500px at -10% 10%, color-mix(in srgb, var(--color-dean) 7%, transparent), transparent 55%),
    var(--color-surface);
  --scrollbar-track: var(--color-ink);
  --scrollbar-thumb: var(--color-edge);
}
```

- [ ] **Step 3: Drive `body` + scrollbar from the skin tokens**

In `src/index.css`, replace the hardcoded `body { background: …; color: #e9e9ee; … }` background/color with:

```css
  background: var(--app-bg);
  color: var(--color-fg);
```

And replace the scrollbar rules:

```css
::-webkit-scrollbar-track { background: var(--scrollbar-track); }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 6px; }
```

- [ ] **Step 4: Default the skin attribute (no first-paint flash)**

In `index.html`, change `<html lang="en">` to:

```html
<html lang="en" data-skin="paper">
```

And update the status-bar color for the light default:

```html
    <meta name="theme-color" content="#f1e8d8" />
```

- [ ] **Step 5: Verify the override mechanism works**

Run: `npm run dev`. The app background should now be warm off-white. In DevTools, set `<html data-skin="midnight">` and confirm panels/background flip to dark — proving token-driven utilities (`bg-panel`, `border-edge`) reskin without component edits. (Text will look wrong until Task 5 — expected.)

- [ ] **Step 6: Type-check + build, then commit**

Run: `npm run build` → Expected: PASS.

```bash
git add src/index.css index.html
git commit -m "feat(theme): skin token system — Paper default + Midnight map"
```

---

## Task 4: Wire the active skin in ThemeProvider

Make the app set `data-skin` from state and feed the matching surface to `applyTheme` (so accents clamp correctly per skin). Persist locally (no DB column yet).

**Files:**
- Modify: `src/lib/store.tsx`

- [ ] **Step 1: Extend the ThemeControl contract + provider**

In `src/lib/store.tsx`, update the import from themes:

```ts
import { applyTheme, resolveTheme, SKIN_SURFACE, type SkinId, type Theme } from "./themes";
```

Replace the `ThemeControl` interface and `ThemeContext` default:

```ts
interface ThemeControl {
  setThemeOverride: (t: Theme | null) => void;
  skin: SkinId;
  /** Active skin's base surface hex (for per-surface accent legibility). */
  surface: string;
  setSkin: (s: SkinId) => void;
}

const ThemeContext = createContext<ThemeControl>({
  setThemeOverride: () => {},
  skin: "paper",
  surface: SKIN_SURFACE.paper,
  setSkin: () => {},
});
```

- [ ] **Step 2: Track skin + apply it in `ThemeProvider`**

Replace the body of `ThemeProvider` with:

```tsx
function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [override, setOverride] = useState<Theme | null>(null);
  const [skin, setSkinState] = useState<SkinId>(() => {
    if (typeof localStorage !== "undefined") {
      const s = localStorage.getItem("deandb.skin");
      if (s === "paper" || s === "midnight") return s;
    }
    return "paper"; // Paper is the authored default
  });
  const surface = SKIN_SURFACE[skin];
  const active = override ?? resolveTheme(profile);

  // Reflect the skin on <html> and feed the surface to the accent clamp.
  useEffect(() => {
    document.documentElement.dataset.skin = skin;
  }, [skin]);
  useEffect(() => {
    applyTheme(active, surface);
  }, [active.accent, active.secondary, surface]);

  const setSkin = useCallback((s: SkinId) => {
    setSkinState(s);
    try { localStorage.setItem("deandb.skin", s); } catch { /* ignore */ }
  }, []);

  const value = useMemo<ThemeControl>(
    () => ({ setThemeOverride: setOverride, skin, surface, setSkin }),
    [skin, surface, setSkin],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
```

- [ ] **Step 3: Type-check + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. `useCallback` is already imported in this file (used elsewhere) — confirm no missing import.

- [ ] **Step 4: Visual check**

`npm run dev` → app is Paper. In the console run `document.documentElement.dataset.skin='midnight'` is now superseded by state, so instead temporarily call (via React DevTools or a scratch button) — skip for now; the toggle UI ships in Phase 4. Confirm Paper renders and `--color-gold` on `<html>` is a *darkened* gold (legible on cream) via DevTools computed styles.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.tsx
git commit -m "feat(theme): ThemeProvider tracks skin + feeds surface to accent clamp"
```

---

## Task 5: Token sweep — migrate hardcoded chrome colors

Replace **on-surface** hardcoded colors with semantic tokens. **Leave on-media zones** (album/artist hero overlays: `bg-black/xx` + `text-white`/`text-white/xx` layered over a cover gradient) **unchanged** — they are intentionally light-on-color in both skins.

**Mapping (on-surface only):**

| Find | Replace |
|---|---|
| `text-white` (on a panel/body, e.g. titles, list rows) | `text-fg` |
| `text-zinc-200` / `text-zinc-300` | `text-fg` (labels) or `text-fg-muted` (secondary) |
| `text-zinc-400` | `text-fg-muted` |
| `text-zinc-500` / `text-zinc-600` | `text-fg-faint` |
| raw hex in JS for chrome | a token (see exact edits) |

**Files:** `src/components/ui.tsx`, `src/components/cards.tsx`, `src/components/Layout.tsx`, and pages under `src/pages/*` per checklist.

- [ ] **Step 1: Inventory the occurrences**

Run: `grep -rn "text-white\b\|text-zinc-\|bg-black/\|bg-white/\|text-white/" src/components src/pages | wc -l` then without `| wc -l` to see them. Use this list to drive the per-file edits; for each hit decide **on-surface** (migrate) vs **on-media hero/cover** (leave).

- [ ] **Step 2: `ui.tsx` — exact edits (shared atoms; highest leverage)**

In `src/components/ui.tsx`:

(a) `scoreColor()` unrated color → token:

```ts
  if (value == null) return "var(--color-fg-faint)";
```

(b) `DeanMeter` track ring `stroke="#26262e"` → token:

```tsx
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-edge)" strokeWidth={stroke} fill="none" />
```

(c) `Score10` editable input: `border-edge bg-panel-2` already token-driven; change `text-zinc-600` on the `/10` suffix:

```tsx
        <span className="text-xs text-fg-faint">/10</span>
```

(d) `StatusBadge` "want" variant uses `text-zinc-400` on `bg-white/5` — make it skin-safe:

```ts
  want: { label: "☆ On the List", cls: "bg-fg/5 text-fg-muted ring-fg/10" },
```

(e) `ProgressBar` track `bg-white/8` → `bg-fg/10` (visible on both skins):

```tsx
    <div className={`h-2 w-full overflow-hidden rounded-full bg-fg/10 ${className}`}>
```

(f) `SectionTitle` heading `text-white` → `text-fg`:

```tsx
      <h2 className="font-display text-2xl font-black tracking-tight text-fg">{title}</h2>
```

(g) `Select` control `text-zinc-200` → `text-fg`, chevron `text-zinc-500` → `text-fg-faint`.

- [ ] **Step 3: `cards.tsx` — exact edits**

In `src/components/cards.tsx`:
- `Cover` (size other than the vinyl overlay): the vinyl/title overlay (`text-white drop-shadow…`, `from-black/55`) is **on-media → leave as-is**.
- `AlbumCard` footer chrome: `text-white` (title) → `text-fg`; `text-zinc-500` (year) → `text-fg-faint`. The `bg-black/70` excluded ribbon + `DeanMeter` badge `bg-black/70` sit over the cover → **leave**.
- `ArtistCard`: the circular monogram `text-white` over a gradient is **on-media → leave**; `text-white` (artist name, on panel) → `text-fg`; `text-zinc-500` (genre line) → `text-fg-faint`; `text-gold` percent stays (token).

- [ ] **Step 4: `Layout.tsx` + pages — checklist sweep**

For each file in `src/components/Layout.tsx` and `src/pages/*.tsx`, apply the mapping from Step 0, honoring the on-media exception. Known on-media heroes to **leave**: `AlbumDetail.tsx` hero block (lines ~101–153), `ArtistDetail.tsx` hero block (lines ~43–81). Everything else (panels, list rows, labels, empty-state text, buttons like `text-zinc-300`) migrates.

Per-file loop:
1. `grep -n "text-white\b\|text-zinc-\|bg-white/\|text-white/" src/pages/<File>.tsx`
2. Edit each on-surface hit per the mapping; skip hero/cover-overlay hits.
3. `npm run typecheck` (fast feedback).

- [ ] **Step 5: Full verify**

Run: `npm run typecheck && npm run build`
Expected: PASS.
Then `npm run dev` and walk the app in **Paper**: confirm no invisible/low-contrast text on panels, lists, the Dashboard stat grid, Settings, Feed, People. Then flip `<html data-skin="midnight">` in DevTools and re-walk: text should be legible in dark too. Pay attention to `StatusBadge`, `Score10`, the achievements grid, and Hall of Fame.

- [ ] **Step 6: Commit**

```bash
git add src/components src/pages
git commit -m "refactor(theme): migrate chrome colors to semantic fg tokens (skin-safe)"
```

---

## Task 6: Per-album accent (color from the cover)

Scope a per-page accent by overriding `--color-gold` (and `--color-gold-soft`) on the detail-page wrapper — so every `text-gold`/accent element inside the page takes the album's hue, while the global nav keeps the user's accent. Source = the cover's first gradient stop, clamped legible for the active skin.

**Files:**
- Modify: `src/pages/AlbumDetail.tsx`, `src/pages/ArtistDetail.tsx`

- [ ] **Step 1: AlbumDetail — compute + apply the scoped accent**

In `src/pages/AlbumDetail.tsx`:

(a) Add imports:

```ts
import { useThemeControl } from "../lib/store";
import { legible } from "../lib/themes";
```

(b) Inside the component, after `const album = …` resolves, compute the accent (guard for the not-found branch which returns early — compute *after* the early return, i.e. just before the main `return (`):

```ts
  const { surface } = useThemeControl();
  const albumAccent = legible(album.cover[0], surface);
```

(c) Wrap the main return's outermost `<div>` with the scoped CSS vars. Change `return (\n    <div>` to:

```tsx
  return (
    <div style={{ ["--color-gold" as string]: albumAccent, ["--color-gold-soft" as string]: albumAccent }}>
```

(The hero already paints `gradient(album.cover)`; now the Review label, "load runtime" link hover, Edit affordances, and any `text-gold` inside echo the album's color.)

- [ ] **Step 2: ArtistDetail — same pattern from `artist.color`**

In `src/pages/ArtistDetail.tsx`:

(a) Add imports:

```ts
import { useThemeControl } from "../lib/store";
import { legible } from "../lib/themes";
```

(b) After `const artist = …` (and after the not-found early return), before the main `return (`:

```ts
  const { surface } = useThemeControl();
  const artistAccent = legible(artist.color[0], surface);
```

(c) Wrap the outer `<div>`:

```tsx
  return (
    <div style={{ ["--color-gold" as string]: artistAccent, ["--color-gold-soft" as string]: artistAccent }}>
```

- [ ] **Step 3: Type-check + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. (The `["--color-gold" as string]` cast satisfies TS for custom properties in `style`.)

- [ ] **Step 4: Visual check**

`npm run dev` → open two different albums (and two artists) with distinct cover gradients. Confirm the in-page accent (e.g. the "The Verdict"/Review accents, percentage on ArtistDetail) shifts to match each cover, and that navigating back to a list page shows the global accent again (no leakage). Verify in both skins via the DevTools `data-skin` toggle that the accent stays legible (darkened on Paper).

- [ ] **Step 5: Commit**

```bash
git add src/pages/AlbumDetail.tsx src/pages/ArtistDetail.tsx
git commit -m "feat(theme): per-album/-artist accent scoped to the detail page"
```

---

## Task 7: Final QA pass

**Files:** none (verification only)

- [ ] **Step 1: Gate**

Run: `npm run test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 2: Visual QA checklist (Paper, then Midnight via DevTools `data-skin`)**

- [ ] Dashboard: hero, stat grid, Now Spinning, Latest Verdicts, achievements — all legible.
- [ ] Artists list + ArtistDetail (hero stays light-on-color; chrome flips; per-artist accent).
- [ ] AlbumDetail (hero on-media; Review/tracklist chrome flips; per-album accent; Dean Meter ring uses edge token).
- [ ] Hall of Fame, Feed, People, Recommendations, Settings, Editor — no invisible text.
- [ ] Login (will be fully reskinned in Phase 3; just confirm nothing is unreadable now).
- [ ] Headings render in Fraunces; body in Inter.

- [ ] **Step 3: Tag the phase**

```bash
git commit --allow-empty -m "chore: Sleeve Phase 1 (foundation) complete"
```

---

## Self-Review (performed against the spec)

**Spec coverage (§4.1 skins, §4.2 per-album accent, §4.3 type, §4.8 a11y):** Tasks 1 (type), 3–4 (skins/tokens), 6 (per-album accent), 2 + Task 7 checklist (contrast/legibility) cover these. Motion (§4.4), loading (§4.6), cover caching (§4.7), real extraction (§4.2 "later"), and Midnight persistence are explicitly deferred to follow-up plans (stated up top) — not gaps, scope boundaries.

**Placeholder scan:** No "TBD"/"handle later"/vague steps; every code step shows the code. Task 1 Step 4 is an explicit *no-op with rationale* (avoid a broken hashed preload path), not a placeholder.

**Type consistency:** `legible(hex, surface, min?)`, `darken(hex, amt)`, `SKIN_SURFACE`, `SkinId`, and `applyTheme(theme, surface)` are defined in Task 2 and used consistently in Tasks 4 and 6. `ThemeControl` gains `skin`/`surface`/`setSkin` in Task 4 and `useThemeControl().surface` is consumed in Task 6. New utility classes `text-fg`/`text-fg-muted`/`text-fg-faint`/`bg-surface` are registered in Task 3 before use in Task 5.

**Known caveat to validate during execution:** Task 3 assumes Tailwind v4 emits theme colors as `var(--color-*)` (so `[data-skin]` overrides reskin utilities). Step 5 verifies this empirically before the sweep depends on it; if a utility ever inlines a literal instead, fall back to `text-[var(--color-fg)]` arbitrary values for that case.
