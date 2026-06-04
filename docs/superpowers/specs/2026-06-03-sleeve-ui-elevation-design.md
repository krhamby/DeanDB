# DeanDB → "Sleeve": UI/UX Elevation — Design Spec

> **Status:** Approved — moving to implementation planning · **Date:** 2026-06-03 · **Owner:** Kevin Hamby
> **Type:** Design/UX spec (precedes an implementation plan)
> **Origin:** Collaborative brainstorming consultation (idea expert + engineering feasibility review).

---

## 1. Vision & North Star

**A music-magazine you play.**

DeanDB began as a tracker for one friend's legendary 250-hour discography marathon. That
origin — *made by a friend group, for our friend Dean* — is the product's soul and its moat:
Spotify and Last.fm can't manufacture that warmth. The elevation keeps that handmade reverence
while lowering every barrier so a **casual listener feels welcome on day one** and a **music head
feels at home**, and quietly lays the rails to **monetize** without going soulless.

The aesthetic answer is **"Sleeve"**: the album art is the hero, the UI recolors itself to the
music, verdicts read like printed record reviews, and the *game* moments (the Wheel, badges, the
Summit) get arcade-grade payoff. Captivating, welcoming, ownable.

---

## 2. The brief (decisions locked during the consultation)

| Question | Decision |
|---|---|
| **Ambition** | **Elevate** — bold new identity + signature moments on the existing structure. "Reinvent later" stays an option; we plant seeds for it. |
| **Audience / horizon** | **Soulful + monetizable.** Built for the friend group's origin, designed so strangers (even non-music-heads) enjoy it, and engineered so community + revenue layers snap on later. |
| **Devices** | **Mobile-first, desktop a first-class citizen** (real wide-screen layouts, not a stretched phone). |
| **Priority surfaces** | 🎡 The Wheel · 🎨 Theming · 🎚️ Rating & the Dean Meter · 🚪 First impression · 🏆 Hall of Fame & badges. *(Social / share / Spotify sync intentionally deprioritized to the monetization-bridge and 2.0.)* |
| **Aesthetic direction** | **Sleeve** = Cover-Art-First foundation + editorial (Liner-Notes) typography + rationed Neon for game moments. |
| **Skins** | **Paper** (warm off-white editorial) is the **default**, authored from day one. **Midnight** (cinematic dark) follows as a second skin. |
| **Display typeface** | **Fraunces** (serif), with **Inter** for UI. |
| **Onboarding** | **Gentle** — start with *one* artist from a curated **starter set drawn from Dean's canon** (plus free search); reveal depth progressively. No day-one discography dump. |
| **Spotify now-playing sync** | **Parked in 2.0.** |
| **Effort constraint** | None — "no effort is too large." Optimize for the best possible experience. |

---

## 3. Design principles

1. **The art leads.** Cover art is the primary color and the primary content. The chrome serves it.
2. **A voice, not just a skin.** Verdicts read like a record review (Fraunces, pull-quotes, printed scores). DeanDB has taste, and says so.
3. **Neon is a reward, not a wallpaper.** Glow/gradient energy is reserved for the Wheel spin, badge unlocks, and the Summit. Everyday UI stays classy so the dopamine stays special.
4. **Welcoming by default, deep on demand.** A casual listener can rate an album in two taps; a head can score every track and write a column. Progressive disclosure throughout.
5. **Perceived speed is a feature.** Nothing ever shows a blank box. Color and motion communicate "something's cooking" instantly (see §5.6).
6. **Soul is non-negotiable.** Monetization sells *expression and convenience*, never the core ritual. The heart of DeanDB is always free.
7. **No-server-first.** Prefer paths that add zero new infrastructure; add at most small, well-scoped Supabase Edge Functions / Storage when they unlock disproportionate value.
8. **Respect the keystone.** All work preserves the `DeanDBData` view model (`src/types.ts`) and routes through `src/lib/api.ts`; never read Supabase from components or break `stats.ts`.

---

## 4. The "Sleeve" Design System

### 4.1 Two skins, one system — semantic tokens

Today, color is hardcoded for dark: `index.css` `@theme` fixes `--color-ink/panel/panel-2/edge`, the
`body` background is a fixed dark gradient, text is a fixed `#e9e9ee`, and `themes.ts` only recolors two
**accents** (gold/dean), clamping them for contrast against a **hardcoded** dark `SURFACE = "#15151a"`.
Components hardcode dark assumptions (`text-white`, `text-zinc-400/500/600`, `bg-panel`, `bg-black/40`, …).

**Architecture: a `data-skin` attribute on `<html>` driving semantic CSS variables.**

Introduce semantic tokens that describe *role*, not value, and remap them per skin:

```
:root, [data-skin="paper"] {        /* default */
  --color-surface:      #f3ebdd;    /* page */
  --color-surface-2:    #fcf7ec;    /* cards / panels */
  --color-line:         #e2d5bf;    /* borders */
  --color-text:         #241c14;    /* primary text */
  --color-muted:        #8a7c68;    /* secondary text (AA on surface) */
  --color-accent:       <user/gold>;/* primary accent */
  --color-on-accent:    #000;       /* text on accent fills */
}
[data-skin="midnight"] {
  --color-surface:      #0a0a0b;
  --color-surface-2:    #15151a;
  --color-line:         #2a2a33;
  --color-text:         #e9e9ee;
  --color-muted:        #8a8a95;
  --color-accent:       <user/gold>;
  --color-on-accent:    #000;
}
```

- Components migrate from literal classes to semantic ones (`text-white` → `text-[var(--color-text)]`,
  `bg-panel` → `bg-[var(--color-surface-2)]`, `text-zinc-500` → `text-[var(--color-muted)]`, etc.).
- The **`body` background** and the **scrollbar** in `index.css` become skin-conditional.
- JS-side hardcoded colors must become tokens too: `scoreColor()` and the `DeanMeter` SVG ring (`#26262e`) and the unrated gray (`#3a3a45`) in `ui.tsx`.
- **`legible()` / `contrastRatio()` rework:** they currently assume a dark surface and only *lighten* an accent. Generalize to accept the **current surface** and move the accent toward whichever direction restores ≥4.5:1 (lighten on dark, darken on light). `applyTheme()` / `ThemeProvider` pass the active surface.
- **Skin state:** add `skin: "paper" | "midnight"` to `Profile` (`types.ts`) + a `profiles.skin` column; `ThemeProvider` sets `document.documentElement.dataset.skin`. First run honors `prefers-color-scheme`.

**Blast radius:** ~15–25 component/page files, 60–80 literal color references, plus `themes.ts` and
`index.css`. This is the single largest piece of work. **Mitigation:** because we are redesigning these
surfaces anyway, we **bake semantic tokens in as we redesign each surface** — authored to Paper from the
start — so we never refactor twice. Midnight then becomes a cheap second token map + a toggle + a focused
**contrast/legibility audit** (§4.8).

### 4.2 Color from the cover (per-album accent)

Each album/artist surface derives an **accent from its cover** and applies it *scoped to that surface*,
not globally.

- **Scoping (no global mutation, no nav flash):** set `--color-album-accent` as an inline CSS var on the
  detail page's outermost wrapper (`AlbumDetail`, `ArtistDetail`). Children read `var(--color-album-accent)`;
  outside the wrapper it falls back to `--color-accent`. This avoids `document.documentElement` churn and
  the back-navigation teardown problem of the current global `applyTheme`/`setThemeOverride`.
- **Source, phased:**
  - **Now (zero infra):** use the gradient already stored on every `Album` (`cover: [string,string]`, via
    `pickGradient()` in `format.ts`). `gradient[0]` is a free, already-legible per-album accent.
  - **Later (minimal infra):** real **dominant color extracted from the artwork** at import time, stored as
    `dominant_color` (see §4.7). Upgrades the accent from "gradient" to "true cover color," falling back to
    the gradient when null.
- **Legibility:** every derived accent passes through the generalized `legible()` clamp for the active skin
  before it touches a CSS sink.
- **Layering / precedence:** user manual accent (global) → profile theme override (viewing others) →
  per-album accent (scoped). Distinct variable names prevent collisions.

### 4.3 Typography

- **Fraunces** (variable serif) — display: hero titles, album/artist names, verdict headlines, scores. Its
  optical-size + `WONK`/`SOFT` axes give us an expressive "game moment" voice and a refined editorial voice
  from one family.
- **Inter** (variable) — UI/body: labels, controls, metadata, paragraphs.
- **Delivery: self-host via Vite.** Place subsetted (Latin, woff2) variable fonts in `src/assets/fonts/`;
  Vite rewrites URLs through the `/DeanDB/` base path automatically (no `import.meta.env.BASE_URL` needed in
  CSS). `font-display: optional` for Fraunces (display only — one-render fallback is fine), `swap` for Inter.
  Preload the Fraunces subset in `index.html`. Update `--font-display` and add `--font-ui` in `@theme`.
- **Type scale:** define a fluid scale (clamp-based) so the editorial headlines breathe on desktop and stay
  legible on mobile. Numerals: tabular for stats/scores.

### 4.4 Motion language

A small, tasteful, reusable set (extends the existing `animate-pop`/`animate-shimmer`/`animate-marquee`):

- **Needle-drop transitions:** route changes animate via `key={hash}` on the page wrapper + an enter
  animation (reuse/extend `animate-pop`). Single-mount (old unmounts immediately) to avoid double-fetch and
  mobile layout thrash. Add `scrollTo(0,0)` on navigation.
- **Count-ups:** hours logged, scores, percentages animate to value on first reveal.
- **Cover physicality:** covers lift/tilt on hover (desktop) and press (mobile); "drop the needle" micro-motion when a verdict is cast.
- **Reduced motion:** all of the above gated behind `prefers-reduced-motion`.

### 4.5 Neon, rationed

A dedicated "game-moment" treatment layer (conic/linear glow gradients, soft outer glow, gold→dean→magenta)
used **only** in: the Wheel spin + reveal, badge-unlock toasts, the Summit celebration, and streak fire.
Everywhere else stays in the calm Sleeve palette.

### 4.6 Perceived performance & the loading language ("something's cooking")

Nothing renders as a blank rectangle. The loading system reuses ingredients we already have (per-album
gradient + the `animate-shimmer` keyframe):

- **Gradient-first covers (blur-up):** the `Cover` component (`cards.tsx`) renders the album's **gradient
  immediately** with a **shimmer sweep**; the real artwork fetches in the background and **fades/blur-ups**
  in over the gradient when ready. If the fetch fails, the gradient simply stays — never a broken image.
- **Skeleton screens:** lists/pages (Dashboard, Hall of Fame, Feed, Editor) render skeletons built from the
  surface tokens + shimmer while data resolves — laid out to match final content (no layout shift).
- **The spinning record spinner:** a small branded vinyl-record spinner for longer waits (imports,
  tracklist loads), instead of a generic throbber. On-brand "cooking" signal.
- **Optimistic UI (already present, lean in):** `useMyJourney`'s `setAlbum`/`setTrack` are already
  optimistic-local + fire-and-forget. Extend this confidence to ratings, status changes, favorites — the UI
  responds instantly; the network reconciles behind the scenes with subtle success/rollback affordances.
- **Progressive numbers:** stats appear immediately from cached `DeanDBData` and refine when fresh data lands.

### 4.7 Cover delivery & caching (architecture)

**Problem:** Cover Art Archive fetches are slow and redirect-heavy (visible lag), AND the same images are
CORS-opaque — so the browser cannot pixel-read them for color extraction or render them into downloadable
share cards. Today `sw.js` explicitly **skips all cross-origin requests** (line 37), so covers are never
cached and re-fetch every visit.

Two complementary moves:

1. **Service-Worker runtime cache for covers (zero infra — immediate win).** Extend `sw.js` to intercept
   cover-image GETs (Cover Art Archive + Supabase Storage origins) with a **stale-while-revalidate** policy
   in a separate, size-capped cache (e.g. `deandb-covers-v1`, LRU-trimmed). Repeat loads become instant and
   work offline. (Opaque cross-origin responses are still fine to *display*; they just can't be pixel-read —
   which is why we also want #2.)

2. **Re-host covers in Supabase Storage at import time (recommended — minimal infra, unlocks the vision).**
   At import (Editor flow), proxy-fetch the CAA artwork once, **extract the dominant color**, and **upload
   the image to a public Supabase Storage bucket** (`covers/`); store the **Storage URL** + `dominant_color`
   on the catalog row (via a SECURITY DEFINER RPC, consistent with the existing `upsert_catalog_*` pattern).

   This single move solves **three** problems at once:
   - **Speed/reliability:** covers served from Supabase's CDN, not a flaky archive redirect; SW-cacheable.
   - **CORS-clean:** Supabase Storage sends proper CORS headers → enables client-side **color extraction**
     and **real cover art on downloadable share cards** (html-to-image).
   - **Permanence:** covers don't break if upstream art moves.

   Cost: one Storage bucket + one RPC; backfill existing albums lazily from the Editor. The generative
   gradient remains the universal fallback for anything unresolved.

> Because "no effort is too large," the target end-state is **#2 (Supabase Storage re-host)** with **#1
> (SW cover cache)** layered on top. #1 ships first as a standalone Phase-1 win; #2 lands with the
> color-extraction work in Phase 4.

### 4.8 Accessibility & legibility

- **Contrast across both skins** is a gate, not an afterthought: the generalized `legible()` must hold ≥4.5:1
  for text/accents on whichever surface is active. `--color-muted` must clear AA on Paper (a `zinc-400` on
  cream fails — this is a known trap).
- Honor `prefers-reduced-motion` and `prefers-color-scheme`.
- Maintain keyboard focus states, hit-target sizes (≥44px), and screen-reader labels through the redesign
  (the existing menu a11y work is a baseline to preserve).
- A **focused contrast/legibility audit** is a required step when Midnight lands.

---

## 5. Surface-by-surface design

### 5.1 First impression 🚪 *(today's biggest gap: there is no landing page — `#/` is feed-or-login — and auth is the most off-brand screen)*

- **Landing page (logged-out `#/`):** a living hero — covers drifting, a sample marathon meter filling, the
  Dean origin story, one unmistakable **"Start your journey"** CTA. Communicates "artful music ritual" in 5
  seconds; works for non-music-heads.
- **Gentle onboarding:** choose **one** artist to start — from a **curated "starter set" drawn from Dean's
  canon** (the realest music head we know; this also seeds the brand story), with free search as an escape
  hatch → we import that discography → land on a **populated** dashboard with an obvious first action
  ("Rate your first album"). Depth (more artists, seasons, goals) reveals progressively. The "aha" precedes
  any chore.
- **Auth reskin:** rebuild Login/sign-up/forgot/MFA/set-password screens (`pages/Login.tsx`) in the Sleeve
  editorial look — warm, branded, calm. (Preserve the existing email+password+TOTP state machine and
  security model.)
- **Empty & blank states** (`EmptyState.tsx` and per-page): teach by showing a tasteful "what this becomes"
  preview rather than an apology.

### 5.2 The marathon hero & Dean Meter 📊

- The dashboard hero (`Dashboard.tsx`) becomes the **"look how far I've come" centerpiece**: a balanced
  layout (title + meter ⟷ featured record), color drawn from the featured album, count-up hours, a
  progress meter with weight, and a clear path to the Summit.
- **Desktop:** full-width hero, then a full-width verdicts gallery, then an **even three-across** row
  (Wheel / Achievements / Hall of Fame) — the rebalanced layout validated in the studio (fixes the
  right-weighting of a stacked rail).

### 5.3 The Verdict — rating & the Dean Meter 🎚️ *(the core act)*

- **The Verdict composer:** rating an album feels like writing a column. The **Dean Meter** becomes a
  signature, tactile **dial** (the hero control); per-song scoring uses satisfying sliders with favorite
  stars; the review field is styled as editorial prose (Fraunces, pull-quote treatment).
- **Two-tap path for casuals, full path for heads:** cast an album score in two taps; optionally go deep on
  tracks + review. Progressive disclosure.
- **Verdict confirmation:** a weighty "needle-drop" cast moment (sound + motion), not confetti spam.
- Produces a shareable **Verdict card** (§6).

### 5.4 The Wheel ritual 🎡 *(your most ownable interaction)*

- Upgrade `NextSpinner.tsx` into a **ritual**: tuned momentum/deceleration, **synthesized Web-Audio**
  tick-tick-tick during the spin + a landing chime (no audio files, no CDN; `AudioContext` created on the
  Spin gesture), suspense slow-down, and a **cover-flip reveal**.
- A **"why this one"** beat after the reveal (last played, runtime, a tease) so it feels intentional.
- **Haptics:** `navigator.vibrate()` on Android as a bonus; **iOS Safari has no Vibration API** — feature-detect and rely on sound for everyone. (Do **not** fake it with CSS shake on iOS.)
- A **shareable spin result** ("The Wheel chose ___").

### 5.5 Hall of Fame, the Summit & badges 🏆 *(reasons to return)*

- **Hall of Fame** → a poster-like, art-forward leaderboard of top records + desert-island tracks.
- **The Summit** (hitting the runtime goal) → a **full-screen celebratory moment** (the rationed neon, big
  type, screenshot-ready).
- **Badges/achievements** (`stats.ts` already computes 10 public + 5 hidden): redesigned tiles + **neon
  unlock toasts**; surface **streaks** and **seasons** as living status.

### 5.6 Theming & make-it-yours 🎨

- **Automatic** per-album theming (§4.2) + **manual accent** picker (retain `themes.ts` presets/custom) +
  the **Paper/Midnight toggle** + **profile cosmetics** (cover frames, meter styles). Several cosmetics
  become premium (§7). Theming becomes self-expression, not a settings chore.

### 5.7 Supporting surfaces (light touch — the monetization bridge)

Social (feed, profiles, follows) and recommendations get Sleeve restyling for consistency but are **not**
the focus of this elevation. They matter as the **spread mechanism** for the share artifacts (§6) and the
home of the friend-group magic; deeper social investment is a later phase.

---

## 6. Shareable artifacts (the free growth engine)

Designed to **escape the app**:

- **Verdict cards** (cover/gradient + score + pull quote), **"Season Wrapped"** recaps (**calendar-year**
  cadence — a yearly review of the listener's marathon, primed to drop each December/January), and
  **Hall-of-Fame posters**.
- **Generation:** client-side **`html-to-image`** download. v1 templates are **gradient/SVG-based** (no
  external `<img>`) to sidestep cover-art CORS; once covers live in Supabase Storage (§4.7), templates can
  embed **real artwork**.
- **Link-unfurl previews** (per-album OG images on shared links) are a **known limitation** of a
  hash-routed static SPA — its `index.html` serves the same static OG tags to every crawler (confirmed: see
  `index.html`). Downloads work without solving this; true unfurls require one small **OG-image Edge
  Function** (Phase 5, optional).

---

## 7. Monetization — "DeanDB Pro"

**Rule:** the core ritual (tracking, rating, the Wheel, the marathon, basic sharing) is **always free**.
Pro sells **expression and convenience**:

- Extra **skins & cosmetics** (premium themes, cover frames, meter styles, Season Wrapped templates).
- **Advanced stats** & history, **custom seasons/goals**, **data export**.
- **Spotify auto-sync** (when 2.0 ships).

**Pricing:** we will **explore both models** — a **one-time "lifetime unlock"** and a **recurring
subscription** — likely A/B-ing them (Stripe supports both via Payment Links; the entitlement plumbing is
identical, so this is a config/experiment decision, not an architecture fork). The one-time unlock suits the
friend-group/soulful framing; the subscription suits sustained revenue — testing tells us which (or both,
e.g. lifetime + an optional supporter tier).

**Mechanics (minimal infra):** a Stripe **Payment Link** (no Stripe SDK in the client) + **one** Supabase
**Edge Function** webhook that validates the Stripe signature and flips `profiles.is_pro` (RLS-gated).
This is the only genuinely new infrastructure the revenue path requires. Deferred to Phase 5.

---

## 8. Engineering & feasibility summary

From the engineering review (grounded in the codebase). All 8 elements are buildable on the static +
Supabase architecture.

| Element | Verdict | Effort | Notes |
|---|---|---|---|
| Fraunces + Inter (self-host) | ✅ no infra | S | Vite handles `/DeanDB/` base path. |
| Per-album accent (scoped CSS var) | ✅ no infra | S | Gradient now; real color later. |
| Page transitions | ✅ no infra | S | `key={hash}` + `animate-pop`; single-mount. |
| Wheel sound/animation | ✅ no infra | S | Web Audio synth; Android haptics; **no iOS vibration**. |
| Gradient-first loading + skeletons | ✅ no infra | S–M | Reuses `animate-shimmer`. |
| SW cover runtime cache | ✅ no infra | S–M | Extend `sw.js` (today skips cross-origin). |
| Semantic tokens + **Paper** skin | ⚠️ caveats | **L** | 60–80 literal colors across ~15–25 files; `legible()` rework. Bake in during redesign. |
| Midnight skin (2nd token map) | ⚠️ caveats | M | Cheap once tokens are semantic + contrast audit. |
| Real cover-color extraction | ⚠️ minimal | M | CORS → proxy/extract at import; store `dominant_color`. |
| Cover re-host (Supabase Storage) | ⚠️ minimal | M | Bucket + RPC; unlocks extraction + real-art share cards + speed. |
| Share-image downloads | ✅ no infra | S | `html-to-image`; gradient templates avoid CORS. |
| OG unfurl previews | 🧩 needs infra | M | One OG-image Edge Function (optional). |
| DeanDB Pro payments | 🧩 needs infra | M | Stripe Payment Link + 1 webhook Edge Function. |
| Spotify sync | 🧩 (2.0) | M | Client-side PKCE; ~25-user dev-mode cap. |

**Biggest risks:** (1) the Paper/semantic-token refactor's blast radius and contrast edge-cases; (2) cover
color/CORS reliance on a proxy until Storage re-host lands; (3) `html-to-image` chokes on
`backdrop-blur` — share templates must avoid it.

---

## 9. Phased roadmap

Honors **"Elevate now, Reinvent later."** Phases 1–3 are pure front-end craft with **zero new
infrastructure**; Phases 4–5 add depth and revenue with at most a couple of small Edge Functions.

**Phase 1 — Sleeve foundation** *(zero infra)*
Fraunces + Inter · semantic token system authored as **Paper** · per-album accent (gradient) · motion
language · **SW cover cache** · gradient-first loading + skeletons + record spinner.

**Phase 2 — Signature moments** *(zero infra)*
Marathon hero + Dean Meter dial · the **Verdict composer** · the **Wheel ritual** (sound/animation/reveal)
· Hall of Fame + **Summit** + badge toasts (rationed neon).

**Phase 3 — Welcome & spread** *(zero infra)*
Landing page · gentle one-artist onboarding · auth reskin · empty states · **shareable image downloads**.

**Phase 4 — Depth** *(minimal: Storage + 1 RPC)*
**Cover re-host to Supabase Storage** + **real dominant-color extraction** (upgrades the accent) ·
**Midnight skin** + toggle + contrast audit · advanced stats.

**Phase 5 — Money & 2.0** *(Edge Functions)*
**DeanDB Pro** (Stripe + webhook) · OG link-unfurl previews · **Spotify now-playing sync**.

---

## 10. Risks & mitigations

- **Token refactor regressions (invisible text, weak contrast).** → Bake tokens in during redesign (not a
  separate big-bang); enforce a contrast gate; dedicated legibility audit when Midnight lands.
- **Cover proxy reliability** before Storage re-host. → Treat extraction as best-effort with gradient
  fallback; move to Storage re-host as the durable end-state.
- **Font weight / FOUT.** → Subset aggressively (Latin woff2), `font-display: optional` for display,
  preload the display subset.
- **Share rendering quirks.** → Gradient/SVG-only templates v1; test exact templates before shipping.
- **Scope creep into 2.0/social.** → Hold the line: social & Spotify stay out of Phases 1–3.

---

## 11. Resolved decisions (from review)

1. **Onboarding artist source** → **Curated "starter set" drawn from Dean's canon**, with free search as an
   escape hatch. (Reinforces the brand story.)
2. **Season Wrapped cadence** → **Calendar year** (a yearly recap, primed to drop each December/January).
3. **Pro pricing shape** → **Explore both** one-time "lifetime unlock" and a recurring subscription (A/B;
   identical entitlement plumbing).
4. **Midnight timing** → **Phase 4** (confirmed).

**Execution scope:** **all five phases are greenlit** for execution now (no effort cap). The implementation
plan will sequence them so each phase is independently shippable and the no-infra work (Phases 1–3) lands
before the minimal-infra work (Phases 4–5).

---

## 12. Success criteria

- A new visitor reaches a **populated, rated** dashboard within ~60 seconds of landing.
- Covers feel **instant** on repeat views; no blank boxes anywhere (gradient-first everywhere).
- The Wheel and the Summit are **screenshot-worthy** moments people share unprompted.
- The app is **unmistakably DeanDB** — not a generic dark streaming clone — in both skins.
- Both skins pass **WCAG AA** contrast across primary surfaces.
- A clean, documented path to **first revenue** (Pro) that never paywalls the core ritual.

---

## 13. Out of scope (for this elevation)

Deep social/feed features; Apple Music (server-signed tokens, $99/yr — see streaming research doc);
Spotify sync (2.0); native apps; the full "Reinvent" rethink of navigation paradigm (kept as a future
option, seeded but not built).
