# Streaming Integration Research — Spotify & Apple Music

> Research deliverable for the "sync what the user is listening to" discussion item.
> Method: multi-source web research with 3-vote adversarial verification — **25/25
> claims confirmed unanimously (3-0)** across 28 mostly-primary sources (Spotify,
> Apple, Supabase official docs). Compiled 2026-06-03; **re-verify time-sensitive
> items (Spotify quota/migration) before building.**

Scope: DeanDB is a **client-only** React 18 + TS + Vite SPA on **Supabase** (Postgres
+ Auth + RLS), deployed to **GitHub Pages** (`/DeanDB/`), **no custom server** today
(it *can* add Supabase Edge Functions if strictly required). Goal: sync **now-playing**
and **recently-played**, reflect it in DeanDB (auto-advance album status, prefill
runtime, "now spinning" in the feed); optional library import.

---

## TL;DR verdict

| Provider | Feasible with **no server**? | Verdict |
|---|---|---|
| **Spotify** | ✅ **Yes** — fully client-side | **Start here.** PKCE auth + polling, zero backend, zero cost. |
| **Apple Music** | ❌ **No** | Needs a **Supabase Edge Function** (to sign the dev token) **+ $99/yr** Apple Developer Program. Defer. |

The core ask — *sync what they're listening to* — is a **Spotify Phase-1 feature
shippable on the current architecture with no new infrastructure.**

---

## 1. Spotify Web API — client-side, no backend ✅

- **Auth:** OAuth 2.0 **Authorization Code + PKCE**, no client secret — Spotify's
  *recommended* flow for SPAs. Explicitly compliant after the **27-Nov-2025 OAuth
  migration** because GitHub Pages is HTTPS.
  ([PKCE flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow),
  [migration FAQ](https://developer.spotify.com/blog/2025-10-14-reminder-oauth-migration-27-nov-2025))
- **Redirect URI:** must be an **exact** registered match (case + trailing slash) and
  HTTPS — `https://<you>.github.io/DeanDB/` works. `localhost` is now disallowed;
  `127.0.0.1` loopback retained for dev. ⚠️ Register the custom domain too when you
  move off Pages. ([redirect_uri concepts](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri))
- **Scopes:** `user-read-currently-playing`, `user-read-playback-state`,
  `user-read-recently-played`, `user-library-read`.
- **Endpoints:**
  - Now playing → `GET /me/player/currently-playing`
  - History → `GET /me/player/recently-played` → `PlayHistoryObject[]` with `track`,
    `played_at`, and **`track.external_ids.isrc`**
    ([ref](https://developer.spotify.com/documentation/web-api/reference/get-recently-played))
- **Catalog matching:** **ISRC** is the strong key → map to `catalog_tracks`/albums.
  Fall back to **artist+title fuzzy match** for library-added/uploaded tracks lacking ISRC.
- **Rate limits:** rolling **30-second window**; a single user polling every ~10–30s
  (1–6 calls/window) is far below the limit. 429s carry `Retry-After`. Spotify
  publishes **no exact number** and no official cadence.
  ([rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits))
- **⚠️ Dev-mode user cap:** new apps default to **development mode (~25 users)**.
  Extended quota now reportedly requires **~250k MAU + a registered business**
  (tightened Apr/May 2025). For a small friends roster you stay in dev mode and
  **manually allowlist each user's Spotify email** — this is the real adoption ceiling.
- **2024–25 deprecations (do they bite us?):** new apps permanently lose
  `audio-features`, `recommendations`, `related-artists`, Featured/Category playlists,
  and **30s preview URLs**. **None are needed** — now-playing / recently-played /
  library are unaffected. ([2024-11-27 changes](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api))
- **Refresh tokens (open Q):** access tokens ~1h. PKCE issues a refresh token; rotating
  it purely in-browser exposes it in `localStorage`. Acceptable for v1; it's the main
  reason to add the optional Edge Function later.

## 2. Apple Music / MusicKit JS v3 — requires a backend ❌

- The **developer token is a JWT signed ES256** with an account-bound **`.p8` private
  key** (+ 10-char Key ID + Team ID). Apple **rejects** unsigned/other-algorithm tokens
  with 401. ES256 is asymmetric → the `.p8` can't ship to the browser → **server-side
  signing is mandatory.**
  ([generating dev tokens](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens))
- Hard prerequisite: **paid Apple Developer Program ($99/yr)** — the `.p8` Media key
  can't be created on a free account.
- **Once the token exists:** **MusicKit on the Web handles the Music User Token
  client-side** (explicit `music.authorize()` consent popup) — so the *only* server
  piece is signing the developer token.
  ([user auth for MusicKit](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit))
- Endpoints: recently-played → `GET /v1/me/recent/played/tracks` (has ISRC). Note
  `heavy-rotation` returns **albums/playlists/stations, not tracks**.

## 3. Architecture for DeanDB

- **Token storage:** an **RLS-protected table** (e.g. `user_streaming_tokens`) scoped to
  `auth.uid()` — never `localStorage` for refresh tokens or the `.p8`. Supabase Edge
  Functions run `verify_jwt=true` by default and provide an **RLS-scoped client** (only
  the caller's rows). ([functions/auth](https://supabase.com/docs/guides/functions/auth))
- **Edge Functions needed:**
  - Spotify → **optional** (token refresh / keep the refresh token off the client).
  - Apple → **required** (sign the ES256 dev token; `.p8` lives in a Supabase secret).
- **Polling in the SPA:** `setInterval` only while the tab is **visible**
  (`document.visibilityState`) — no service-worker push exists; background polling
  drains battery/quota. Now-playing ~15–30s when active; recently-played on focus.

## 4. Sync model & UX (design recommendation, not externally cited)

- **Confirmation-first, not silent automation.** "We saw you finished *Section.80* on
  Spotify — mark it Completed?" Auto-advance without confirmation misfires on
  shuffles/skips.
- **Match confidence:** ISRC = auto-suggest; fuzzy name match = "is this it?" picker.
- **"Now spinning" in the feed:** currently-playing → a transient badge.
- **Privacy:** minimal scopes, explicit connect, one-click **disconnect** (revoke +
  delete stored tokens).

## 5. ⚠️ Legal / platform terms — NOT verified; close before building

This is the one section the harness could not confirm (terms pages are JS-rendered; no
claim survived verification). Best read, **to confirm against the actual agreements**:
- **Spotify** generally **requires attribution** (logo + linking back) and **prohibits
  storing/deriving certain data or building competing services**; showing *your own*
  now-playing is common, but **showing one user's listening to *other* users (the social
  feed)** needs a careful read of the [Developer Terms](https://developer.spotify.com/terms)
  + [design guidelines](https://developer.spotify.com/documentation/design). **Don't ship
  "now spinning to followers" until this is checked.**
- **Apple Music** has mandatory **identity/branding guidelines** ("Listen on Apple Music").

## 6. Phased recommendation

1. **Phase 1 — Spotify, client-side (no server, no cost):** PKCE connect in Settings →
   poll now-playing + recently-played → ISRC match → **confirmation-based** status
   auto-advance + runtime prefill. Ceiling: dev-mode ~25 allowlisted users.
2. **Phase 2 — Spotify hardening (optional Edge Function):** move refresh-token handling
   server-side; add saved-library import (`user-library-read`).
3. **Phase 3 — Apple Music:** only once it's worth **$99/yr + one Edge Function** for
   `.p8` signing.

**Feasibility verdict under "no server by default":** Spotify = **feasible with zero
backend**; Apple Music = **infeasible without at least one Edge Function + paid membership.**

## Open questions to close before building
1. Spotify terms: is storing listening history + showing "now playing" to *followers*
   permitted, and what attribution is mandatory? (the unverified §5 gap)
2. Are we OK with the dev-mode ~25-user allowlist, or do we need extended quota (likely
   unattainable at our scale)?
3. Refresh tokens in `localStorage` for v1, or stand up the Edge Function from day one?
4. Now-playing cadence + visible-tab-only polling — acceptable battery/quota trade-off?

---

*Sources (primary unless noted): Spotify Developer docs & blog (PKCE, redirect_uri,
recently-played, rate-limits, quota-modes, 2024-11-27 changes, 2025 OAuth migration);
Apple Developer docs (generating-developer-tokens, user-authentication-for-musickit,
recent/played/tracks, heavy-rotation); Supabase docs (functions/auth, api-keys,
token-security). Verification: 28 sources → 128 claims → 25 verified → 25 confirmed,
0 refuted.*
