# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What DeanDB is

DeanDB is an IMDb-style **multi-user social platform** for tracking listening
"journeys" — each account works through artists, albums, and tracks, rating and
reviewing them, and shares the journey socially (public profiles, follow/friends,
an activity feed, recommendations). It started life as a single-person tracker
for "Dean's" 250-hour marathon; that shape survives as the per-user journey.

It's a **client-only React SPA** with **no custom server** — all logic is in the
browser, backed by Supabase (Postgres + Auth + RLS + RPCs). It deploys as static
files to GitHub Pages; Supabase is reached directly with the public anon key.

Read `README.md` for the product tour and Supabase/Pages setup.

## Tech stack

| Concern   | Choice |
|-----------|--------|
| Framework | React 18 (`StrictMode`, function components + hooks only) |
| Build     | Vite 6 (ESM, `type: module`) |
| Language  | TypeScript 5, **strict** (`noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch`) |
| Styling   | Tailwind CSS v4 via `@tailwindcss/vite` — config-less; theme tokens in `src/index.css` |
| Routing   | Tiny custom **hash** router (`src/lib/router.ts`) — no React Router |
| State     | React Context (`src/lib/store.tsx`): `useAuth` + `useMyJourney`, plus per-page hooks |
| Backend   | Supabase: Auth (email magic link), Postgres with **Row Level Security**, RPCs, a feed view |
| External  | MusicBrainz + Cover Art Archive (free, no API key) for art/discographies |

There is **no test runner, no ESLint, no Prettier**. The type checker is the gate
— keep `npm run typecheck` / `npm run build` green.

## Commands

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # tsc -b (type-check) then vite build -> dist/
npm run preview    # serve the production build
npm run typecheck  # tsc -b --noEmit  (verify changes compile)
```

A SessionStart hook (`.claude/hooks/session-start.sh`) runs `npm install` in
Claude Code on the web sessions so the above work immediately.

## Architecture: the keystone

**`DeanDBData` is the in-memory view model.** The display pages and **all of
`src/lib/stats.ts`** consume a single `DeanDBData` object (one user's journey).
The database is normalized, so `src/lib/api.ts`'s `fetchJourney(profile)`
reassembles a user's normalized rows back into `DeanDBData`. This is why the
backend is fully relational yet `stats.ts`, `cards.tsx`, `ui.tsx`, and the
journey pages barely changed. **When touching data flow, preserve the
`DeanDBData` shape** (`src/types.ts`) — drift there breaks stats/achievements.

## Project layout

```
src/
  main.tsx              Entry: <StrictMode><AuthProvider><App/>
  App.tsx               Hash-route switch; RequireAuth gating; #/u/:username → Profile
  types.ts              DeanDBData view model + account/social types (Profile, FeedItem, …)
  index.css             Tailwind import + @theme design tokens + keyframes
  lib/
    supabase.ts         Supabase client (persistSession), authRedirectTo, requireClient
    api.ts              ALL data access: auth, profiles, fetchJourney reassembly,
                        catalog upserts, per-user mutations, follows, feed, recs
    store.tsx           useAuth (session+profile) · useMyJourney (own editable journey)
                        · useJourney(username) · useFeed/useRecommendations/usePeopleSearch
    config.ts           SUPABASE_URL / SUPABASE_ANON_KEY (anon key public by design)
    router.ts           Hash router: useHashRoute, navigate, parseRoute, parseUserRoute
    stats.ts            computeStats/computeAchievements/artistProgress/flattenAlbums (DeanDBData-shaped; unchanged)
    format.ts           fmtHours/fmtMinutes/fmtDate/gradient/slugify/uid
    musicbrainz.ts      Rate-limited MusicBrainz + Cover Art Archive lookups (reused verbatim)
  components/
    Layout.tsx          Header/nav (Feed, People, Recs badge), avatar menu, ticker, footer
    ui.tsx              DeanMeter, Score10, StatusBadge, ProgressBar, Panel, SectionTitle, scoreColor
    cards.tsx           Cover, AlbumCard, ArtistCard (take a `basePath` for journey-scoped links)
    social.tsx          Avatar, PersonRow, FollowButton, RecommendModal
    NextSpinner.tsx     "Marathon Wheel" next-artist spinner (takes basePath)
    EmptyState.tsx      Shown for your own empty journey
  pages/
    Dashboard/Artists/ArtistDetail/AlbumDetail/HallOfFame  read-only, journey-scoped (props: data, basePath, canEdit)
    Editor.tsx          Edit MY journey: add/import artists, rate, per-user row writes
    Profile.tsx         #/u/:username wrapper → resolves journey via useJourney, renders the read-only pages
    Login.tsx           Magic-link sign in
    Settings.tsx        Profile fields + visibility toggle + Share link
    Feed.tsx            Activity from people you follow
    People.tsx          Search + follow + accept requests + following list
    Recommendations.tsx Recommendation inbox
supabase/migrations/    DB schema as Supabase migrations (baseline *_init.sql): catalog, profiles,
                        user_* tables, follows, recommendations, RLS, helper fns, catalog RPCs,
                        feed view, legacy-row migration. config.toml links the CLI/integration.
.github/workflows/deploy.yml  Build + deploy to GitHub Pages on push to main
.claude/                SessionStart hook (npm install on web) + settings.json
vite.config.ts          base = "/DeanDB/" in build (Pages subpath), "/" in dev
```

## Data model

**View model (`src/types.ts`):** `DeanDBData { listener, goalHours, season, artists[] }`
→ `Artist` → `Album` (status `want|listening|completed`, `rating` 0–10 nullable,
`review`, `minutes`, `excluded`, `tracks[]`) → `Track` (`rating` 0–10 nullable,
`favorite`). Plus account/social types: `Profile`, `PersonResult`, `FeedItem`,
`Recommendation`, `AlbumAggregate`, `Visibility`, `FollowStatus`.

**Database (`supabase/migrations/` — applied via the Supabase GitHub integration / `supabase db push`, or pasted into the SQL editor):**
- **Shared catalog** (`catalog_artists/albums/tracks`) — deduped by MusicBrainz `mbid`; world-readable; written only via SECURITY DEFINER `upsert_catalog_*` RPCs so cross-user rating aggregates and recommendations point at canonical rows.
- **`profiles`** — one per `auth.users` (username, display_name, visibility, season, goal_hours). Auto-created by a trigger on signup.
- **Per-user journey** (`user_artists/user_albums/user_tracks`) — the rateable layer, owned by `auth.uid()`.
- **Social** — `follows` (pending/accepted), `recommendations`, and `feed_items` (a `security_invoker` view).

Conventions baked in: `rating: null` means **unrated**; `excluded` albums are out
of all stats/marathon math; the marathon goal is *derived* (`stats.goalHours` =
total tracked runtime, not the literal field). View-model ids (`artist.id` etc.)
are the catalog row uuids, used directly in routes.

## State & data flow (`src/lib/store.tsx`)

- `useAuth()` — `{ session, user, profile, signIn(email), signOut, updateProfile, ... }`. Owns the Supabase `onAuthStateChange` subscription. `AuthProvider` wraps the app and nests `MyJourneyProvider`.
- `useMyJourney()` — the signed-in user's own journey as `DeanDBData` plus mutators. `setAlbum`/`setTrack` are optimistic-local + fire-and-forget DB write (hot path). `patchLocal` mutates the local view after a structural API call; `reload()` refetches after bulk ops (imports). There is **no publish/draft step** — every edit persists immediately under the user's session.
- `useJourney(username)` — read-only view of **any** user, RLS-gated. Returns `{ data, owner, canEdit, denied, notFound, relationship }`. Special-cases your own username to reuse the live `useMyJourney` copy.
- `useFeed` / `useRecommendations` / `usePeopleSearch` — page-level hooks.

**Never** read Supabase or build SQL from components — go through `src/lib/api.ts`.

## Security model (read before touching auth/RLS)

- Auth is **email magic link**. The anon key is public by design; safety comes from RLS keyed on `auth.uid()`, evaluated server-side.
- Journeys default to **private**. Visibility is decided in one place: the `can_view_journey(owner)` SQL helper = `owner = auth.uid() OR profile public OR accepted-follow edge`. Every per-user table's SELECT policy and the `profiles` read policy use it.
- **Critical invariant:** an `accepted` follow edge grants read access to a private journey. So follows can only be self-inserted as `accepted` toward a **public** target (INSERT policy + a BEFORE-INSERT trigger force `pending` for private targets); only the followee can flip `pending → accepted`. Don't weaken this.
- Discovery uses SECURITY DEFINER RPCs (`search_profiles`, `profile_header`) that expose only public identity (username/display name/avatar) for any user, so private users are still followable without leaking journey content.

## Routing (`src/lib/router.ts`, `src/App.tsx`)

Hash routes only (zero Pages rewrite config). `#/` (feed when signed in, else
landing), `#/login`, `#/me[/...]` (own journey, editable), `#/editor`,
`#/settings`, `#/feed`, `#/people`, `#/recommendations`, and `#/u/:username/...`
(others' journeys, read-only). `parseUserRoute` splits the `u/:username` prefix;
`Profile.tsx` renders the read-only pages with `basePath="/u/:username"`. Bare
`#/artist|/album|/artists|/hall-of-fame` resolve to your own journey. Auth-gated
routes go through `RequireAuth`.

## Conventions

- **Styling:** Tailwind utilities inline; use theme tokens from `index.css` (`ink`, `panel`, `panel-2`, `edge`, `gold`, `gold-soft`, `dean`, `display` font) and reuse `Panel`/`SectionTitle`/`DeanMeter`/`Score10`/`StatusBadge`/`ProgressBar` and the `cards.tsx`/`social.tsx` components rather than re-rolling.
- **Links:** journey pages and cards take a `basePath` prop so the same component links correctly for `#/me` vs `#/u/:username`. Always thread it through.
- **MusicBrainz:** all requests funnel through the serial rate limiter in `musicbrainz.ts` (~1 req/s) — never bypass it. The Editor feeds its results into catalog upserts.
- **Imports:** `import type { … }` for type-only imports (`isolatedModules`). Relative paths only.
- **Components:** named-export function components with inline-typed props (`App.tsx` is the only default export). Small, dependency-light, comments explain *why*.

## Build & deploy

- `vite.config.ts`: `base "/DeanDB/"` in production (case-sensitive Pages subpath), `"/"` in dev. Use `import.meta.env.BASE_URL` for asset/redirect URLs.
- `.github/workflows/deploy.yml` builds on push to `main` and deploys `dist/` to Pages.
- Supabase setup: apply the migration in `supabase/migrations/` (Supabase GitHub integration on merge, `supabase db push`, or paste into the SQL editor), set URL/key in `config.ts` (or `VITE_SUPABASE_ANON_KEY`), and **add the site URL to Supabase Auth → URL Configuration → Redirect URLs** (magic links return to `…/DeanDB/#/me`). Production email needs Supabase SMTP configured.

## Working agreements

- This session develops on branch `claude/claude-md-docs-8B97s`. Commit/push there; do **not** open a PR or push elsewhere unless asked.
- After code changes, verify with `npm run build` / `npm run typecheck`. There are no automated tests.
- The legacy single-row marathon migrates into a real account via `migrate_deandb_state('<user-uuid>')` (see the bottom of the init migration in `supabase/migrations/`). It's operator-only (execute revoked from anon/authenticated) and won't migrate an account other than the caller's own.
