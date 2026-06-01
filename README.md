# 🎧 DeanDB

> **The official tracker for Dean's legendary 250-hour discography marathon.**
> An IMDb-style shrine to one man's quest through the canon — every artist, every album, every track, rated and reviewed.

DeanDB is a fast, single-page web app (React + Vite + TypeScript + Tailwind). It's built to be **shared** — deploy it once to GitHub Pages and all of Dean's friends can watch the marathon unfold in real time.

## ✨ What's inside

- **The Marathon Bar** — a live progress meter ticking toward the 250-hour goal.
- **The Dean Meter** — Dean's signature 0–10 album score, shown as a glowing gauge.
- **Discography progress** — per-artist completion bars (e.g. *12 / 18 albums*).
- **Album pages** — status, review, runtime, and per-song ⭐ ratings.
- **Hall of Fame** — a ranked leaderboard of Dean's highest-rated records + desert-island tracks.
- **Achievements** — unlockable badges like *Discography Slayer*, *The Perfect Ten*, and *The Summit*.
- **Generative cover art** — every album gets a unique vinyl-on-gradient cover, no image files needed.
- **A built-in Editor** — add artists/albums/tracks and rate everything right in the browser.

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

## 🌐 Deploying to GitHub Pages (so friends can see it)

A workflow is already included at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

1. Push this repo to GitHub (the app's base path assumes the repo is named **`deandb`** — see `vite.config.ts` if yours differs).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`. The action builds and deploys automatically.
4. Your site goes live at **`https://<your-username>.github.io/deandb/`**.

## 🛠 Tech

| | |
|---|---|
| Framework | React 18 + Vite 6 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Routing | Tiny custom hash router (zero-config on GitHub Pages) |
| Data | A single JSON file + browser localStorage for live editing |
| Deps | Just `react` + `react-dom`. That's it. |

Built with love for Dean — the realest music head we know. Keep spinning. 🎵
