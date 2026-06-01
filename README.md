# 🎧 DeanDB

> **The official tracker for Dean's legendary 250-hour discography marathon.**
> An IMDb-style shrine to one man's quest through the canon — every artist, every album, every track, rated and reviewed.

DeanDB is a fast, single-page web app (React + Vite + TypeScript + Tailwind). It's built to be **shared** — deploy it once to GitHub Pages and all of Dean's friends can watch the marathon unfold in real time.

## ✨ What's inside

- **The Marathon Bar** — a live progress meter ticking toward the 250-hour goal.
- **The Dean Meter** — Dean's signature 0–10 album score, shown as a glowing gauge.
- **The Marathon Wheel** — a spinner that reveals the next artist in Dean's sequential queue.
- **Discography progress** — per-artist completion bars (e.g. *12 / 18 albums*).
- **Album pages** — status, review, runtime, and per-song ⭐ ratings.
- **Hall of Fame** — a ranked leaderboard of Dean's highest-rated records + desert-island tracks.
- **Achievements** — unlockable badges like *Discography Slayer*, *The Perfect Ten*, and *The Summit*.
- **Real album art + discographies** — one-click import from [MusicBrainz](https://musicbrainz.org)
  & the [Cover Art Archive](https://coverartarchive.org) (free, open data, no API key); falls back
  to generative vinyl-on-gradient covers when art is missing.
- **A built-in Editor** — add artists/albums/tracks and rate everything right in the browser.

> **Data lives in the database only.** With Supabase configured, every viewer loads exactly what's
> published — no bundled seed data is ever shown. The marathon starts empty until Dean adds his first
> artist. (Without a backend, the app falls back to the bundled JSON for local dev.)

## 🚀 Running locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
```

## 📝 How Dean updates the data

The source of truth everyone sees is **[`public/data/deandb.json`](public/data/deandb.json)**.

You can edit that file by hand, **or** use the in-app **Editor** tab (the friendly way):

1. Open the **Editor** and add/rate artists, albums, and tracks. Edits autosave to *your browser* (localStorage) so you can't lose work.
2. Click **⬇ Export deandb.json**.
3. Replace `public/data/deandb.json` in the repo with the downloaded file and push.
4. GitHub Pages redeploys automatically — friends see the update. 🎉

> Edits made in the Editor are local to your browser until you export + commit them. That's the trick that keeps the app server-free while still being shareable: the committed JSON is what the world sees.

## 🔌 Live data with Supabase (optional, recommended)

Wire up a free [Supabase](https://supabase.com) project and the Editor's **Publish**
button pushes changes to the cloud — every viewer sees them **instantly**, no commit
needed. The whole DeanDB document lives in one JSONB row; everyone can read it, and
writes are protected by an **editor passcode** checked server-side (the public anon
key alone can't change anything).

**Setup (~5 minutes):**

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste in [`supabase/schema.sql`](supabase/schema.sql), and **Run**.
   Change `'change-me-now'` in that file to a secret editor passcode first.
3. In Supabase, go to **Project Settings → API** and copy:
   - the **Project URL** → `SUPABASE_URL` in [`src/lib/config.ts`](src/lib/config.ts)
   - the **anon / publishable key** → `SUPABASE_ANON_KEY` in the same file
     (it's public-safe by design — RLS does the protecting).
4. Commit & push. Done — open the **Editor**, type your passcode, and hit **Publish**.

If `SUPABASE_ANON_KEY` is left blank, DeanDB automatically falls back to the bundled
JSON + localStorage, so it always works even without a backend.

## 🌐 Deploying to GitHub Pages (so friends can see it)

A workflow is already included at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

1. Push this repo to GitHub (the app's base path assumes the repo is named **`DeanDB`** — see `vite.config.ts` if yours differs).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`. The action builds and deploys automatically.
4. Your site goes live at **`https://<your-username>.github.io/DeanDB/`**.

## 🛠 Tech

| | |
|---|---|
| Framework | React 18 + Vite 6 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Routing | Tiny custom hash router (zero-config on GitHub Pages) |
| Data | Supabase (shared, live) with automatic fallback to bundled JSON + localStorage |
| Deps | `react`, `react-dom`, `@supabase/supabase-js` |

Built with love for Dean — the realest music head we know. Keep spinning. 🎵
