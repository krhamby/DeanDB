# 🎧 DeanDB

> **Track your discography marathon. Share the journey.**
> An IMDb-style platform for listening through entire catalogs — every artist,
> album, and track, rated and reviewed — and sharing it with friends.

DeanDB started as a tracker for one man's legendary 250-hour marathon. It's now a
**multi-user social platform**: make an account, build your own journey, and
share ratings, reviews, and recommendations with the people you follow. It's a
fast single-page web app (React + Vite + TypeScript + Tailwind) that runs entirely
in the browser against a [Supabase](https://supabase.com) backend — so it deploys
as static files to GitHub Pages.

## ✨ What's inside

- **Your journey** — add artists/albums/tracks and rate everything: a 0–10 **Dean Meter** album score, per-song scores, reviews, and statuses (*want · listening · done*).
- **The Marathon Bar & Wheel** — a live progress meter toward your total-runtime goal, and a spinner that reveals your next artist.
- **Hall of Fame & Achievements** — a ranked leaderboard of your highest-rated records, desert-island tracks, and unlockable badges (*Discography Slayer*, *The Perfect Ten*, *The Summit*…).
- **Social** — public/private profiles at `#/u/yourname`, follow/friends, an activity feed of what people you follow are spinning, and album/artist **recommendations**.
- **Real album art + discographies** — one-click import from [MusicBrainz](https://musicbrainz.org) & the [Cover Art Archive](https://coverartarchive.org) (free, open data, no API key); falls back to generative vinyl-on-gradient covers.

## 🚀 Running locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
npm run typecheck
```

You need a Supabase project configured (below) — DeanDB requires the backend.

## 🔐 Accounts & privacy

- Sign in with a **magic link** (email, no password) — powered by Supabase Auth.
- Your journey is **private by default**. Flip it to **public** in **Settings**, or share it with specific people: they follow you, you accept, and they can see it.
- A journey is visible to **you**, to **anyone** if it's public, or to **accepted followers**. This is enforced server-side by Postgres Row Level Security — the public anon key alone can't read a private journey.

## 🔌 Supabase setup (~5 minutes)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste in [`supabase/schema.sql`](supabase/schema.sql), and **Run**. This creates the catalog, profiles, per-user journey tables, the social graph, all RLS policies, and helper RPCs. It's safe to re-run.
3. In Supabase, go to **Project Settings → API** and copy:
   - the **Project URL** → `SUPABASE_URL` in [`src/lib/config.ts`](src/lib/config.ts)
   - the **anon / publishable key** → `SUPABASE_ANON_KEY` (public-safe by design — RLS does the protecting).
4. Go to **Authentication → URL Configuration** and add your site URL to **Redirect URLs** (e.g. `https://<your-username>.github.io/DeanDB/`) so magic links return to the app. For production email, configure an SMTP provider under **Authentication → Emails**.
5. Commit & push. Open the app, sign in, and start your journey.

> **Migrating the original marathon?** The old single-document data lives in a
> legacy `deandb_state` row. Sign in once as Dean to create his account, grab his
> user id from **Authentication → Users**, then run
> `select migrate_deandb_state('<dean-uuid>');` in the SQL Editor (instructions
> are at the bottom of `schema.sql`).

## 🌐 Deploying to GitHub Pages

A workflow is included at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

1. Push to GitHub (the base path assumes the repo is named **`DeanDB`** — see `vite.config.ts`; Pages URLs are case-sensitive).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`. The action builds and deploys automatically.
4. Your site goes live at **`https://<your-username>.github.io/DeanDB/`**. Remember to add that URL to Supabase's redirect list (step 4 above).

## 🛠 Tech

| | |
|---|---|
| Framework | React 18 + Vite 6 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Routing | Tiny custom hash router (zero-config on GitHub Pages) |
| Backend | Supabase — Auth (magic link), Postgres + Row Level Security, RPCs, realtime |
| Catalog | Shared, deduped by MusicBrainz id, with per-user journey tables on top |
| Deps | `react`, `react-dom`, `@supabase/supabase-js` |

For architecture and conventions, see [`CLAUDE.md`](CLAUDE.md).

Built with love for Dean — the realest music head we know. Keep spinning. 🎵
