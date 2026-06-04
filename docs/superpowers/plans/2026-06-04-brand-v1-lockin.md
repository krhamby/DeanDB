# DeanDB — Brand v1 Lock-in ("Sleeve") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Lock the "Sleeve" identity into a definitive v1 brand: an **editorial wordmark** (no pill), an **editorial nav** (gold underline instead of a filled gold tab), a brand-consistency color sweep, browser/app identity, a `BRAND.md` source of truth, and a reviewable brand sheet in the preview.

**Architecture:** A new `src/components/Wordmark.tsx` is the single source of truth for the logo lockup (`DeanDB` in Fraunces — "Dean" gold, "DB" fg) and replaces every hand-rolled pill. `NavButton` (Layout) switches its active state from a filled gold rectangle to a 2px gold underline that reads the `--color-gold` var (so per-profile/theme accents flow through automatically). A sweep replaces off-brand raw colors (emerald success text, red destructive text) with the skin-aware semantic tokens. `index.html`/`manifest`/`icon.svg` get aligned brand identity. Everything token-driven, both skins, reduced-motion-safe; no logic/data changes.

**Decisions (locked with the user):** editorial wordmark (no pill); nav active = gold underline (theme-accent-aware), only for primary top-nav tabs (segmented toggles + CTAs keep fills); tagline provisional = "Listen deeper. Keep spinning." (NOT final). Domain referenced in ShareCard: `deandb.app`.

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens · Fraunces/Inter.

**Verification:** `npm run typecheck` + `npm run build` + `npm run test` green; visual via `#/__preview` brand sheet + nav, both skins — wordmark renders, active tab underlines in gold, palette/type/components read correctly.

---

## Task 1: `<Wordmark>` component + editorial nav underline

**Files:** Create `src/components/Wordmark.tsx`; modify `src/components/Layout.tsx`.

- [ ] **Step 1:** Create `src/components/Wordmark.tsx`:

```tsx
type WordmarkSize = "nav" | "hero" | "footer";

const SIZES: Record<WordmarkSize, string> = {
  nav: "text-xl",
  hero: "text-4xl sm:text-5xl",
  footer: "text-base",
};

/**
 * The DeanDB editorial wordmark — the single source of truth for the logo
 * lockup. "Dean" in the accent (`--color-gold`, so it tracks theme overrides),
 * "DB" in the foreground; set in Fraunces. No pill (brand v1 decision).
 */
export function Wordmark({ size = "nav", className = "" }: { size?: WordmarkSize; className?: string }) {
  return (
    <span className={`font-display font-black leading-none tracking-tight ${SIZES[size]} ${className}`}>
      <span className="text-gold">Dean</span>
      <span className="text-fg">DB</span>
    </span>
  );
}
```

- [ ] **Step 2:** In `Layout.tsx`, import the Wordmark (`import { Wordmark } from "./Wordmark";`) and replace the `Logo()` body. The button wrapper + navigate stay; only the inner pill markup changes:

```tsx
function Logo() {
  return (
    <button onClick={() => navigate("/")} className="flex shrink-0 items-center" aria-label="DeanDB home">
      <Wordmark size="nav" />
    </button>
  );
}
```

- [ ] **Step 3:** In `Layout.tsx`, rewrite `NavButton`'s active treatment from the filled rectangle to the gold underline. Replace the `<button className=...>` line and add an underline span before the closing `</button>`:

```tsx
    <button
      onClick={() => navigate(path)}
      aria-current={isActive ? "page" : undefined}
      className={`relative shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50 sm:px-3 ${
        isActive ? "text-fg" : "text-fg-muted hover:text-fg"
      }`}
    >
      {label}
      {badge ? (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-dean px-1 text-[10px] font-bold text-black">
          {badge}
        </span>
      ) : null}
      {isActive && (
        <span aria-hidden className="absolute inset-x-2.5 bottom-0.5 h-0.5 rounded-full bg-gold sm:inset-x-3" />
      )}
    </button>
```
(The underline is absolutely positioned, so it doesn't change the width-measured overflow calc. It uses `bg-gold` = `--color-gold`, which theme overrides set, so a themed profile's nav underline picks up that accent.)

- [ ] **Step 4:** In `Layout.tsx` footer, replace the hand-rolled `<span className="font-display font-black text-fg-muted">DeanDB</span>` with `<Wordmark size="footer" />`.

- [ ] **Step 5:** `npm run typecheck && npm run build` → PASS. Commit `feat(brand): editorial Wordmark component + gold-underline nav`.

---

## Task 2: Swap the wordmark in at the remaining brand sites

**Files:** `src/App.tsx`, `src/pages/Login.tsx`, `src/components/ShareCard.tsx`.

- [ ] **App.tsx:** import `import { Wordmark } from "./components/Wordmark";`. In `Loading()` replace `<div className="animate-pulse font-display text-2xl font-black text-gold">DeanDB</div>` with:
  ```tsx
  <div className="animate-pulse"><Wordmark size="hero" /></div>
  ```
- [ ] **Login.tsx:** import `import { Wordmark } from "../components/Wordmark";`. Replace the lockup (lines ~181–184):
  ```tsx
          <div className="inline-flex items-center font-display text-2xl leading-none">
            <span className="rounded-lg bg-gold px-2.5 py-1 text-on-accent">Dean</span>
            <span className="ml-1.5 text-fg">DB</span>
          </div>
  ```
  with:
  ```tsx
          <Wordmark size="hero" />
  ```
- [ ] **ShareCard.tsx:** this is an exported image with a FIXED palette (no skin tokens). Replace the inline pill (lines ~82–83):
  ```tsx
            <span style={{ background: "#f5c518", color: "#000", padding: "2px 8px", borderRadius: 7 }}>Dean</span>
            <span style={{ marginLeft: 5 }}>DB</span>
  ```
  with the editorial inline form (keeps Fraunces/weight from the parent span; "Dean" gold, "DB" the card's light fg):
  ```tsx
            <span style={{ color: "#f5c518" }}>Dean</span>
            <span style={{ color: "#e7e2d8" }}>DB</span>
  ```
- [ ] **Verify + commit:** `npm run typecheck && npm run build` → PASS. `git commit -am "feat(brand): use the editorial wordmark on boot, auth, and the share card"`.

---

## Task 3: Brand consistency color sweep

**Files:** `src/components/social.tsx`, `src/pages/Login.tsx`, `src/pages/Discover.tsx`, `src/pages/Editor.tsx`, `src/components/Menu.tsx`.

Replace off-brand raw colors with the skin-aware semantic tokens (`--color-status-done` for success; `dean` for destructive/alert). Leave the Hall of Fame medal gold/silver/bronze (`zinc`/`amber`) — those are intentional medal semantics.

- [ ] **social.tsx** (~line 199): `text-emerald-400` → `text-[var(--color-status-done)]`.
- [ ] **Login.tsx** (~line 361): `text-emerald-400` → `text-[var(--color-status-done)]`.
- [ ] **Discover.tsx** (~line 207): `text-sm font-semibold text-emerald-400 hover:text-emerald-300` → `text-sm font-semibold text-[var(--color-status-done)] hover:opacity-80`.
- [ ] **Editor.tsx** (~line 692): in the import-log line, `l.includes("✓") ? "text-emerald-400"` → `l.includes("✓") ? "text-[var(--color-status-done)]"` (leave the `text-dean` for "✗").
- [ ] **Menu.tsx** (~line 83): `text-red-400 hover:bg-red-500/10` → `text-dean hover:bg-dean/10`.
- [ ] **Verify + commit:** `npm run typecheck && npm run build && npm run test` → PASS. `git commit -am "fix(brand): unify success/destructive colors on the semantic tokens"`.

---

## Task 4: Browser / app identity

**Files:** `index.html`, `public/manifest.webmanifest`, `public/icon.svg`.

- [ ] **icon.svg:** change the `font-family` from `"Arial Black, Arial, sans-serif"` to `"Georgia, 'Times New Roman', serif"` (echoes Fraunces). Keep the gold (`#f5c518`) field + ink (`#0a0a0b`) "D".
- [ ] **index.html — favicon:** replace the inline `data:image/svg+xml` icon's `font-family='Arial Black,Arial'` with `font-family='Georgia,serif'` so the tab "D" echoes the wordmark. Keep the dark rounded field + gold "D".
- [ ] **index.html — theme-color per skin:** replace the single `<meta name="theme-color" content="#f1e8d8" />` with two:
  ```html
  <meta name="theme-color" content="#f1e8d8" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#15151a" media="(prefers-color-scheme: dark)" />
  ```
- [ ] **index.html — OG/Twitter meta:** add inside `<head>` (after the description meta):
  ```html
  <meta property="og:type" content="website" />
  <meta property="og:title" content="DeanDB" />
  <meta property="og:description" content="Listen deeper. Keep spinning. Track your discography marathon and share the verdict." />
  <meta property="og:image" content="icon.svg" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="DeanDB" />
  <meta name="twitter:description" content="Listen deeper. Keep spinning. Track your discography marathon and share the verdict." />
  ```
  (A proper 1200×630 raster OG image is a Design follow-up — note it in BRAND.md.)
- [ ] **manifest.webmanifest:** align the splash/theme to the default Paper skin — set `"background_color": "#f1e8d8"` and `"theme_color": "#f1e8d8"` (was `#0a0a0b`). Leave name/short_name/icons.
- [ ] **Verify + commit:** `npm run build` → PASS (assets copy). `git commit -am "feat(brand): aligned favicon, theme-color per skin, OG meta, manifest"`.

---

## Task 5: `docs/BRAND.md` source of truth

**Files:** Create `docs/BRAND.md`.

- [ ] Write the brand bible covering: **Identity** (Sleeve — cover-art-first, editorial liner-notes type, rationed neon; soulful + monetizable; made-for-a-friend-group but welcoming). **Name/domain** (DeanDB, deandb.app). **Wordmark** (editorial, "Dean" gold + "DB" fg, Fraunces, no pill; the `<Wordmark>` component is the only correct usage; sizes nav/hero/footer; the favicon/app-icon = serif gold "D"). **Color** (signature Gold `#f5c518` = the rationed accent; Dean-red `#ff5a3c` = secondary/alert; the two skins Paper `#f1e8d8` default / Midnight `#15151a`; the semantic token table from `index.css` with each token's meaning + both-skin values; the rule: fills = button/segment, the gold rule = "you-are-here"). **Type** (Fraunces display + wordmark, Inter UI/body, editorial kicker = uppercase letter-spaced fg-faint; a short scale). **Voice** (plain-spoken, playful, album-as-art reverence without snobbery; provisional tagline "Listen deeper. Keep spinning." — NOT final). **Signature elements** (Dean Meter, Verdict card, Marathon Wheel). **Motion** (calm fades, staggered rises, cover shimmer→fade, all reduced-motion gated). **Accessibility** (WCAG AA both skins; open follow-up: `text-dean` error ~3:1 on Paper). **Design hand-off** (what to refine in a design tool: a raster OG image, app-icon polish; tokens live in `index.css`, lockup in `Wordmark.tsx`).
- [ ] Commit `docs(brand): add BRAND.md — Sleeve v1 source of truth`.

---

## Task 6: Brand sheet in the preview + QA

**Files:** `src/pages/Preview.tsx`; then QA.

- [ ] **Step 1:** Add a `Section label="Brand"` (place it right after the top bar, before the Dashboard section) that shows, using the real tokens/components:
  - The `<Wordmark>` at `hero`, `nav`, `footer` sizes.
  - A palette row: swatches for `bg-gold`, `bg-dean`, `bg-panel`, `bg-panel-2`, `bg-surface`, `bg-edge`, plus text samples `text-fg` / `text-fg-muted` / `text-fg-faint` / `text-[var(--color-status-done)]` / `text-[var(--color-status-lib)]` — each labeled.
  - A type scale: a Fraunces display line, a `SectionTitle`, body Inter, and an editorial kicker.
  - Core components together: a `DeanMeter` (e.g. 9.2), `StatusBadge` for each status, a gold CTA button, and a mini nav-tab demo (one active w/ the gold underline + one inactive) so the new nav treatment is visible.
  - Import `Wordmark`, and reuse already-imported `DeanMeter`/`StatusBadge`/`SectionTitle` (add to the existing `../components/ui` import if needed).
- [ ] **Step 2:** `npm run typecheck && npm run build && npm run test` → PASS. Commit `chore(dev): brand sheet in the preview harness`.
- [ ] **Step 3 (controller, visual):** screenshot `#/__preview` brand sheet + the live header nav in Paper AND Midnight — wordmark legible, active nav tab shows the gold underline (not a filled box), palette/type/components correct in both skins. Confirm `aria-current` still set on the active tab.

---

## Self-Review
**Coverage:** editorial wordmark everywhere (component + 6 sites incl. export) ✓; nav underline (theme-aware, nav-only) ✓; color sweep to semantic tokens ✓; browser/app identity ✓; BRAND.md ✓; brand sheet ✓. ✓
**Placeholder scan:** full code for Wordmark + NavButton + sweep + index.html/manifest/icon; BRAND.md content enumerated; brand sheet enumerated. ✓
**Type consistency:** `Wordmark({size,className})` with `WordmarkSize = nav|hero|footer`; consumers import `{ Wordmark }`; tokens (`--color-gold`/`--color-status-done`/`dean`) are real. ✓
