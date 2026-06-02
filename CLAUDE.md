# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What DeanDB is

DeanDB is an IMDb-style single-page web app that tracks "Dean's" 250-hour
discography marathon — every artist, album, and track, rated and reviewed. It's
a **client-only React app** with no custom backend server: data lives either in
a single Supabase JSONB row (shared, live) or, when no backend is configured, in
a bundled JSON file + browser `localStorage`. It's built to be deployed once to
GitHub Pages and shared with friends.

Read `README.md` for the product/feature tour and Supabase/Pages setup steps.
This file focuses on how the code is organized and how to work in it.

## Tech stack

| Concern   | Choice |
|-----------|--------|
| Framework | React 18 (`StrictMode`, function components + hooks only) |
| Build     | Vite 6 (ESM, `type: module`) |
| Language  | TypeScript 5, **strict** (`noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch`) |
| Styling   | Tailwind CSS v4 via `@tailwindcss/vite` — config-less, theme tokens in `src/index.css` |
| Routing   | Tiny custom **hash** router (`src/lib/router.ts`) — no React Router |
| State      | One React Context store (`src/lib/store.tsx`), no Redux/Zustand |
| Data       | Supabase (`@supabase/supabase-js`) with automatic fallback to bundled JSON + `localStorage` |
| External   | MusicBrainz + Cover Art Archive (free, no API key) for art/discographies |

There is **no test runner, no ESLint, no Prettier config** in this repo. The
type checker is the gate — keep it green.

## Commands

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # tsc -b (type-check) then vite build -> dist/
npm run preview    # serve the production build locally
npm run typecheck  # tsc -b --noEmit  (use this to verify changes compile)
```

Before considering a change done, run `npm run build` (or at least
`npm run typecheck`). Strict TS with `noUnusedLocals`/`noUnusedParameters` means
unused imports/vars are hard errors, not warnings.

## Project layout

```
src/
  main.tsx              App entry: <StrictMode><StoreProvider><App/>
  App.tsx               Top-level <Router/> switch over the hash route
  types.ts              THE data model (DeanDBData / Artist / Album / Track) — start here
  index.css             Tailwind import + @theme design tokens + keyframes
  lib/
    store.tsx           Global state: load/edit/publish, editor auth, auto-publish, drafts
    supabase.ts         Supabase client + load/save/check-passcode/subscribe RPC wrappers
    config.ts           SUPABASE_URL / SUPABASE_ANON_KEY (anon key is public by design)
    router.ts           Hash router: useHashRoute, navigate, parseRoute
    stats.ts            computeStats, artistProgress, flattenAlbums, computeAchievements
    format.ts           fmtHours/fmtMinutes/fmtDate/gradient/slugify/uid helpers
    musicbrainz.ts      MusicBrainz + Cover Art Archive lookups (rate-limited)
  components/
    Layout.tsx          Header/nav, marathon ticker, footer (wraps every page)
    ui.tsx              Reusable bits: DeanMeter, Score10, StatusBadge, ProgressBar, Panel, SectionTitle, scoreColor
    cards.tsx           Cover (art w/ gradient fallback), AlbumCard, ArtistCard
    NextSpinner.tsx     The "Marathon Wheel" next-artist spinner
    EmptyState.tsx      Shown when the marathon has no data yet
  pages/
    Dashboard.tsx       Home: marathon bar, stats, spinner, achievements
    Artists.tsx         Artist index
    ArtistDetail.tsx    One artist + their albums
    AlbumDetail.tsx     Album status/review/runtime + per-track ratings
    HallOfFame.tsx      Ranked leaderboard + desert-island tracks
    Editor.tsx          Dean's in-browser editor (largest file, ~1k lines) — add/rate/import/publish
    Login.tsx           Editor passcode gate
public/data/deandb.json Bundled fallback data (used only when Supabase is unconfigured)
supabase/schema.sql     Run-once SQL for the Supabase backend (tables, RLS, RPCs, realtime)
.github/workflows/deploy.yml  Build + deploy to GitHub Pages on push to main
vite.config.ts          base = "/DeanDB/" in build (Pages subpath), "/" in dev
```

## Data model (`src/types.ts`)

The whole app is a function of one `DeanDBData` document:

- `DeanDBData` → `listener` (branding), `goalHours`, `season`, `artists[]`
- `Artist` → metadata (`genre`, `country`, `color` gradient, `catalogSize`, `mbid`) + `albums[]`
- `Album` → `status` (`"want" | "listening" | "completed"`), `rating` (0–10 "Dean Meter", nullable), `review`, `minutes` (runtime, fuels the marathon bar), `cover` gradient / `coverUrl`, `excluded` flag, `tracks[]`
- `Track` → `title`, `rating` (1–5 stars, nullable), `favorite`

Conventions baked into the model and stats:
- `rating: null` always means **unrated** — distinguish it from 0.
- `excluded: true` albums are kept for reference but **excluded from all stats/marathon math** (see `stats.ts`).
- The marathon goal is *derived*: `goalHours` in stats is the total runtime of all tracked albums, not the literal `goalHours` field.
- `mbid` fields link entities back to MusicBrainz for re-fetching art/metadata.

When changing the data shape, update `src/types.ts`, the readers in
`src/lib/stats.ts`, the Editor in `src/pages/Editor.tsx`, and (if shape changes)
`public/data/deandb.json`.

## State & data flow (`src/lib/store.tsx`)

- A single `StoreProvider`/`useStore()` context is the only global state. Access data via `useStore()`; never read `localStorage`/Supabase directly from components.
- **Source of truth:** when Supabase is configured, the published DB row is authoritative — viewers always load exactly what's published, never the bundled seed. With no backend, it falls back to `public/data/deandb.json`, then to an empty marathon.
- **Editing:** `update(mutator)` takes an immutable mutator over a `structuredClone` of the data, persists a working copy to `localStorage` (`deandb:working-copy:v1`), and marks state `dirty`. `replace(next)` swaps the whole dataset (used by import).
- **Drafts:** local edits are saved but never auto-applied on load — they're *offered* for recovery (`hasLocalDraft` / `restoreLocalDraft`). `resetToPublished()` discards them.
- **Auth:** editing is gated behind an editor passcode checked server-side. `isEditor` unlocks the Editor; with no backend, editing is open. Flags live under `deandb:*` localStorage keys.
- **Publishing:** `publish(passcode)` calls the `save_deandb` RPC. `autoPublish` debounces a publish ~3s after edits settle; `pauseAutoPublish(true)` wraps batch ops (bulk imports) so it pushes once at the end.
- **Realtime:** `subscribe()` applies remote changes live, but only when there are no unpublished local edits (so Dean isn't clobbered mid-edit).

## Backend (`supabase/`, `src/lib/supabase.ts`)

- The entire document is **one JSONB row** (`deandb_state`, `id = 1`).
- The anon key in `src/lib/config.ts` is **public by design** — it ships in the browser bundle. Security is Row Level Security, not key secrecy: anon can read the state row, and writes go only through `SECURITY DEFINER` RPCs (`save_deandb`, `check_passcode`) that verify the editor passcode stored in `deandb_config` (which anon can't read).
- To stand up a backend, run `supabase/schema.sql` in the Supabase SQL Editor (change the passcode first) and set the URL/key in `config.ts` (or `VITE_SUPABASE_ANON_KEY`).
- Set `SUPABASE_ANON_KEY` empty to disable Supabase entirely (offline JSON + localStorage mode).

## MusicBrainz / Cover Art Archive (`src/lib/musicbrainz.ts`)

- Free, no-API-key, browser-callable. **All requests funnel through a serial rate limiter** (`schedule`, ~1.1s spacing) because MusicBrainz asks for ~1 req/s and 503s otherwise; 503/429 are retried with backoff. Don't bypass the limiter or fire raw `fetch`es to MusicBrainz.
- Used by the Editor to import an artist's studio discography, covers, tracklists, genre/country, and catalog size. Cover art URLs (`coverArtUrl`) drop straight into `<img>` and fall back to generative gradients when art is missing.

## Conventions

- **Routing:** hash routes only (`#/`, `#/artists`, `#/artist/:id`, `#/album/:artist/:id`, `#/hall-of-fame`, `#/editor`, `#/login`). Navigate with `navigate("/path")` from `lib/router.ts`; add new routes to the `switch` in `App.tsx`. Hash routing is deliberate — it needs zero rewrite config on GitHub Pages.
- **Styling:** Tailwind utility classes inline. Use the theme tokens from `index.css` — `ink`, `panel`, `panel-2`, `edge`, `gold`, `gold-soft`, `dean` colors and the `display` font — rather than hardcoded hex. Reuse `Panel`, `SectionTitle`, `DeanMeter`, `Score10`, `StatusBadge`, `ProgressBar` from `components/ui.tsx` and the `Cover`/cards from `components/cards.tsx` instead of re-rolling them.
- **Components:** function components with hooks; props are inline-typed. Files export named functions (`export function Foo`), except `App.tsx` (default export).
- **Helpers:** format/display via `lib/format.ts` (`fmtHours`, `fmtMinutes`, `fmtDate`, `gradient`); derived numbers via `lib/stats.ts`. New IDs/slugs use `uid()` / `slugify()` from `format.ts`.
- **Imports:** use `import type { ... }` for type-only imports (`isolatedModules` is on). Relative paths only — no path aliases configured.
- **Style of the codebase:** small, dependency-light, heavily commented with intent ("why", not "what"). Match the surrounding density and tone when editing.

## Build & deploy

- `vite.config.ts` sets `base: "/DeanDB/"` for production builds (the GitHub Pages subpath — note the **case-sensitive** repo name) and `"/"` for dev/preview. If the repo is renamed, update this.
- `.github/workflows/deploy.yml` builds on push to `main` (Node 22, `npm ci && npm run build`) and deploys `dist/` to GitHub Pages. The deploy requires repo Settings → Pages → Source = "GitHub Actions".
- Use `import.meta.env.BASE_URL` when constructing asset URLs (see how `store.tsx` fetches the bundled JSON) so paths work under the subpath.

## Working agreements for this repo

- This session develops on branch `claude/claude-md-docs-8B97s`. Commit and push there; do **not** open a PR or push elsewhere unless explicitly asked.
- Updating the marathon data is a data-only change: edit `public/data/deandb.json` (offline mode) or publish via the Editor (Supabase mode). It does not require code changes.
- After code changes, verify with `npm run build` / `npm run typecheck`. There are no automated tests to run.
