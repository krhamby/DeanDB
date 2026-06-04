# DeanDB — Brand v1 ("Sleeve")

The source of truth for DeanDB's identity. If a surface disagrees with this doc, the doc wins —
or the doc is wrong and should be updated in the same PR. Tokens live in
[`src/index.css`](../src/index.css); the logo lockup lives in
[`src/components/Wordmark.tsx`](../src/components/Wordmark.tsx).

> Status: **v1, locked** (2026-06-04). The tagline is provisional (see Voice). Raster OG image and
> app-icon polish are open Design hand-offs (see end).

---

## 1. Identity

**DeanDB is "Sleeve."** The album sleeve is the hero: cover-art-first, with editorial *liner-notes*
typography and **rationed neon** — color used sparingly so it lands when it matters (a score, a win,
the active tab). It started as the tracker for one friend's ("Dean's") 250-hour discography marathon
and keeps that soul, while being welcoming to casual listeners and ready to monetize.

- **Made for a friend group, open to everyone.** Reverent about music without being snobby.
- **Cover-art-first.** Real art when we have it; a unique generated gradient "sleeve" when we don't.
- **Editorial, not "app-y."** Type and whitespace carry the design; chrome stays quiet.
- **Rationed neon.** Gold is a seasoning, not a coat of paint.

**Name:** DeanDB · **Domain:** `deandb.app` (referenced on the share card).

---

## 2. Wordmark

The wordmark is **editorial type, no pill**: `DeanDB` set in Fraunces (black weight) with **"Dean" in
the gold accent** and **"DB" in the foreground**.

- **Only correct usage is the [`<Wordmark>`](../src/components/Wordmark.tsx) component.** Never hand-roll it.
  Sizes: `nav` (header), `hero` (auth / boot / brand sheet), `footer`.
- "Dean" uses `text-gold` = `--color-gold`, so when a profile/theme override changes the accent, the
  wordmark tracks it automatically.
- **No pill, no box, no drop shadow.** (The old gold "Dean" pill is retired as of v1.)
- **App icon / favicon:** a compact serif gold **"D"** (Georgia/serif fallback echoing Fraunces) —
  the full wordmark is illegible at 16px. Favicon = gold "D" on near-black; app/maskable icon
  (`public/icon.svg`) = ink "D" on a full-bleed gold field.

---

## 3. Color

Two **skins**, both first-class. **Paper** (warm off-white) is the default; **Midnight** is the dark
skin. Every token is redefined per `[data-skin]` so token-driven utilities reskin for free.

### Signature
| Role | Token | Value | Use |
|---|---|---|---|
| Primary accent ("the neon") | `--color-gold` | `#f5c518` | Active tab underline, CTAs, scores, the "Dean" in the wordmark. **Ration it.** |
| Secondary / alert | `--color-dean` | `#ff5a3c` | Destructive actions, errors, badges, the warm wash in the app background. |

### Surfaces & text (per skin)
| Token | Meaning | Paper | Midnight |
|---|---|---|---|
| `--color-surface` | Page surface | `#f1e8d8` | `#15151a` |
| `--color-panel` | Card surface | `#fcf7ec` | `#15151a` |
| `--color-panel-2` | Raised/inset surface | `#f6efe1` | `#1d1d24` |
| `--color-edge` | Hairline border | `#e2d5bf` | `#2a2a33` |
| `--color-edge-strong` | Form-control border (AA) | `#8f7a54` | `#70707d` |
| `--color-fg` | Primary text | `#241c14` | `#e9e9ee` |
| `--color-fg-muted` | Secondary text | `#6f6353` | `#a1a1aa` |
| `--color-fg-faint` | Tertiary text / kickers | `#736756` | `#82828a` |
| `--color-on-accent` | Text on a gold fill | `#ffffff` | `#000000` |
| `--color-status-done` | Success / completed | `#065f46` | `#6ee7b7` |
| `--color-status-lib` | "In library" / info | `#6d28d9` | `#c4b5fd` |

**The color rules:**
1. **A fill means "button" or "selected segment."** A **gold underline rule means "you are here"**
   (primary nav). Don't mix them — that's what keeps the gold rationed.
2. **Semantic tokens, not raw Tailwind colors.** Success = `text-[var(--color-status-done)]`,
   destructive/alert = `text-dean`. (No `text-emerald-*` / `text-red-*` in app code.)
3. **Exceptions, intentional:** Hall-of-Fame podium uses literal gold/silver/bronze (`gold`/`zinc`/
   `amber`) as *medal* metaphors; the share card (`ShareCard.tsx`) uses a fixed bright palette because
   it's an exported image, not a themed surface.

---

## 4. Type

- **Display & wordmark:** **Fraunces** (`--font-display`) — headlines, the wordmark, big numbers,
  scores, pull-quotes.
- **UI & body:** **Inter** (`--font-ui`) — everything else.
- **Editorial kicker:** small, **uppercase**, letter-spaced, `text-fg-faint` — the label above a
  `SectionTitle` (e.g. `FRESH OFF THE NEEDLE`). This is a signature Sleeve move.
- **Rough scale:** hero `text-4xl`–`text-5xl` (Fraunces black) · section title `text-2xl`–`text-3xl`
  (Fraunces black) · body `text-sm`–`text-base` (Inter) · kicker `text-[10px]`–`text-xs` tracked.

---

## 5. Voice

Plain-spoken, a little playful, album-as-art reverence **without** snobbery. Talk like a friend who
loves records, not a critic performing taste. Welcome the casual listener; never gatekeep.

- **Working tagline (PROVISIONAL — not locked):** *"Listen deeper. Keep spinning."*
- Recurring motif: **"Keep spinning."** Other surfaced lines: "Share the verdict," "The Summit."
- Lock the tagline before any paid launch / large marketing push.

---

## 6. Signature elements

These are the brand's recognizable "characters" — protect them:

- **The Dean Meter** — the circular score dial (0–10). The single most identifiable component.
- **The Verdict** — a rating + note; the downloadable **Verdict card** is the shareable artifact.
- **The Marathon Wheel** — the "spin for your next artist" ritual.
- **The generated sleeve** — the per-album gradient + vinyl cover when no art exists.

---

## 7. Motion

Calm and intentional; **everything is `prefers-reduced-motion` gated.**

- Page transitions: a 0.25s fade (`.animate-fade-in`), scroll resets to top on route change.
- Lists: staggered rise (`.stagger-children`).
- Covers: shimmer-while-loading → fade-in (`.animate-shimmer` + `.rm-no-transition`).
- Loading: content-shaped shimmer **skeletons** (`src/components/skeletons.tsx`); the app boot uses a
  branded pulsing wordmark.
- Game moments only: the Wheel reveal, Summit celebration, count-ups (`useCountUp`), Web-Audio SFX.

---

## 8. Accessibility

WCAG 2.1 **AA** is the bar, in **both** skins. Contrast math (`legible()` / surface-aware
`scoreColor()`) keeps dynamic per-album/per-profile accents legible. Active states never rely on color
alone (the active nav tab is weight **+** underline **+** `aria-current`). See
[`docs/superpowers/a11y-audit-2026-06-03.md`](superpowers/a11y-audit-2026-06-03.md).

- **Open follow-up:** `text-dean` error text is ~3:1 on Paper (below AA for normal text). Candidate:
  a surface-aware error token mirroring `--color-status-done`. Tracked in
  [`docs/superpowers/follow-ups.md`](superpowers/follow-ups.md).

---

## 9. Browser / app identity

- **Favicon:** inline SVG in `index.html` (serif gold "D" on near-black).
- **App / maskable icon:** `public/icon.svg` (ink serif "D" on a gold field).
- **`theme-color`:** per color scheme — Paper `#f1e8d8` (light), Midnight `#15151a` (dark).
- **Manifest:** `public/manifest.webmanifest` — name/short_name "DeanDB", Paper splash.
- **Social/OG:** `og:`/`twitter:` meta in `index.html` (currently point at `icon.svg`).

---

## 10. Design hand-off (refine on top of this)

Foundations are in code so a designer can iterate without breaking the system:

- **Tokens:** `src/index.css` (`@theme` + per-skin `[data-skin]` blocks). Change values here; utilities
  follow.
- **Lockup:** `src/components/Wordmark.tsx`.
- **Live reference:** the **Brand** sheet in `#/__preview` (dev-only) renders the wordmark, palette,
  type scale, and core components in both skins.
- **Most likely to refine in a design tool:** a proper **1200×630 raster OG image** (replace the
  `og:image` SVG), app-icon polish (a real mark vs the serif "D"), and locking the **tagline**.
