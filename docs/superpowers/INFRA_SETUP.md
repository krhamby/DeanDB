# Sleeve — Infrastructure Setup Guide (Phases 4–5)

> Everything below is **infra-gated**: it touches your live Supabase / Stripe / Spotify, so the
> manual provisioning steps are **yours to run**. For each feature: **(A) what you provision**
> (explicit steps), **(B) what I build** once it's live, **(C) how to verify**.
>
> Context that applies throughout:
> - **Migrations auto-apply on merge to `main`** via the Supabase GitHub integration (also runnable
>   in the SQL Editor or `supabase db push`). So a migration committed here goes live the moment its
>   branch merges to `main` — apply on a non-prod project first if you want to dry-run.
> - The app is a **client-only SPA** on GitHub Pages (`/DeanDB/`); the anon key is public, **RLS is the
>   guard** (keyed on `auth.uid()`). Secrets (Stripe, Spotify refresh) must live in **Supabase Edge
>   Function secrets**, never in the client.
> - Project ref appears in `src/lib/config.ts` (`SUPABASE_URL`). Replace `<project-ref>` below with it.

---

## 4b · `profiles.skin` — cross-device skin sync  *(minimal: one migration)*

Today the Paper/Midnight choice is saved in `localStorage` (per-device). This syncs it to the account.

**(A) You provision**
1. Add a migration `supabase/migrations/<timestamp>_add_profiles_skin.sql`:
   ```sql
   alter table public.profiles
     add column if not exists skin text not null default 'paper'
     check (skin in ('paper','midnight'));
   ```
2. Confirm the existing `profiles` UPDATE policy lets a user update **their own** row (it already does
   for display name/visibility/theme — `skin` rides the same policy). No new policy needed.
3. Apply it: merge to `main` (auto), or paste into **SQL Editor → Run**, or `supabase db push`.

**(B) I build** — add `skin` to the `Profile` type + the `updateProfile` patch allowlist; `ThemeProvider`
seeds skin from `profile.skin` (falling back to `localStorage`), and `setSkin` persists via `updateProfile`.

**(C) Verify** — toggle skin in Settings on device A → sign in on device B → skin matches.

---

## 4c · Real cover-color extraction + Supabase Storage re-host  *(Storage bucket + migration + 1 Edge Function)*

Upgrades per-album accents from the stored gradient to the **true dominant color of the cover art**, and
re-hosts covers so they load fast and are CORS-clean (which is what makes pixel-extraction + real-art
share cards possible).

**(A) You provision**
1. **Storage bucket:** Supabase Dashboard → **Storage → New bucket** → name `covers`, **Public** ✓.
   (Optional) restrict to `image/*` and a size cap (e.g. 2 MB).
2. **Migration** `supabase/migrations/<timestamp>_catalog_album_art.sql`:
   ```sql
   alter table public.catalog_albums
     add column if not exists dominant_color text,
     add column if not exists cover_storage_url text;

   -- Only the importer's own session calls this; SECURITY DEFINER writes the shared catalog row.
   create or replace function public.set_catalog_album_art(p_album_id uuid, p_color text, p_url text)
   returns void language sql security definer set search_path = public as $$
     update public.catalog_albums
        set dominant_color = p_color, cover_storage_url = coalesce(p_url, cover_storage_url)
      where id = p_album_id;
   $$;
   revoke all on function public.set_catalog_album_art(uuid,text,text) from anon;
   grant execute on function public.set_catalog_album_art(uuid,text,text) to authenticated;
   ```
3. **Storage write policy** — choose ONE:
   - *Simplest:* a Storage RLS policy allowing `authenticated` to `insert` into bucket `covers` (client
     uploads at import); or
   - *Most reliable (recommended):* deploy an Edge Function `extract-cover` (I provide it) that fetches
     the Cover Art Archive image **server-side** (no browser CORS), extracts the dominant color, uploads
     to `covers/`, and calls `set_catalog_album_art`. Deploy with `supabase functions deploy extract-cover`.
     No secrets required.
4. Apply the migration (merge to `main` / SQL Editor / `db push`).

**(B) I build** — at import (Editor + onboarding), call the path you chose; store `dominant_color` +
`cover_storage_url`; `AlbumDetail`/`ArtistDetail` accents prefer `dominant_color` (fallback: gradient);
extend `public/sw.js` to runtime-cache cover images (stale-while-revalidate). Existing albums backfill
lazily on next view/import.

**(C) Verify** — import an artist → its `catalog_albums` rows get `dominant_color` + a `covers/…` URL →
the detail page accent matches the real artwork → repeat loads are instant (SW cache).

> **Note:** if you skip the Edge Function and let the browser extract, it needs a CORS proxy for CAA
> images (e.g. `images.weserv.nl`) — works but is less reliable at scale. The Edge Function avoids that.

---

> ## ⏸️ PHASE 5 — PARKED for later (user decision, 2026-06-03)
> All of Phase 5 below (**5a Stripe Pro**, **5b OG link-unfurl previews**, **5c Spotify sync**) is
> intentionally deferred. Stripe and Spotify "will come later"; 5b (unfurls) only pays off once
> link-sharing is a real growth lever (the **downloadable** share card already covers manual sharing,
> and a future move to Cloudflare/Vercel could inject per-route OG tags more cleanly). The steps are
> kept here, ready to pick up. Near-term infra work is **4b** and **4c** above.

## 5a · DeanDB Pro (Stripe)  *(Stripe account + 1 Edge Function + migration)*

Core stays free; Pro sells skins/cosmetics, advanced stats, etc. (pricing: explore one-time **and**
subscription — both use the same plumbing).

**(A) You provision**
1. **Stripe account** (start in **test mode**). Create a **Product**, then a **Price** — make one
   one-time price and/or one recurring price.
2. **Payment Link(s):** Stripe → Payment Links → New. Enable **"collect customer email"**; under
   *advanced*, allow passing a **`client_reference_id`** (you'll append the user's id to the link URL).
3. **Supabase secrets:** `supabase secrets set STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_…`
   (the webhook secret comes from step 5).
4. **Deploy the webhook** Edge Function (I provide the code): `supabase functions deploy stripe-webhook`.
   Its URL is `https://<project-ref>.functions.supabase.co/stripe-webhook`.
5. **Stripe → Developers → Webhooks → Add endpoint:** that URL, event `checkout.session.completed`.
   Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET` (step 3).
6. **Migration** `…_profiles_is_pro.sql`:
   ```sql
   alter table public.profiles
     add column if not exists is_pro boolean not null default false,
     add column if not exists pro_since timestamptz;
   ```
   (RLS: user reads own `is_pro`; **only** the SECURITY DEFINER webhook flips it — do not grant
   `authenticated` update on `is_pro`.)

**(B) I build** — a "Go Pro" CTA that opens your Payment Link with `?client_reference_id=<uid>`; the
`stripe-webhook` function validates the signature and flips `profiles.is_pro` for that uid; the UI gates
Pro cosmetics/stats on `profile.is_pro`.

**(C) Verify** — test-mode purchase → Stripe sends the event → function sets `is_pro=true` → Pro unlocks
in-app. (Use Stripe's "Send test webhook" + a 4242-4242 card.)

---

## 5b · OG link-unfurl previews  *(1 Edge Function)*

Today shared links show a generic preview (a hash-routed static SPA can't serve per-URL `<meta>` tags).
This makes shared album/profile links unfurl with a real per-item image in Slack/iMessage/X.

**(A) You provision**
1. **Deploy** the Edge Function `og-image` (I provide it; renders an SVG/PNG via Satori/resvg):
   `supabase functions deploy og-image`. No secrets.
2. **Share-URL strategy** — pick one:
   - *Minimal:* share links point at `…/functions/v1/og-image?albumId=…`, which returns a tiny HTML page
     with per-item OG tags + an instant redirect into the app. (Crawlers read the tags; humans get
     redirected.)
   - *Cleaner long-term:* move hosting to a platform with rewrites (Cloudflare/Vercel) so real app URLs
     can carry per-route OG tags. (Bigger change — defer.)

**(B) I build** — the `og-image` function + wire the share buttons (and the existing Verdict card
download) to the share URL.

**(C) Verify** — paste a share link into Slack/X → a per-album card unfurls.

> Downloadable share cards (already shipped) work **without** this — unfurls are the extra mile.

---

## 5c · Spotify now-playing sync  *(Spotify app; optional Edge Function + table)*

Auto-reflect what you're spinning. Client-side PKCE — see `docs/streaming-integration-research.md` for the
verified details. **Apple Music is deliberately deferred** (needs a paid dev account + server-signed token).

**(A) You provision**
1. **Spotify app:** developer.spotify.com/dashboard → Create app. Note the **Client ID** (public — PKCE
   needs no secret).
2. **Redirect URIs (exact match, incl. trailing slash):** `https://<you>.github.io/DeanDB/` for prod and
   `http://127.0.0.1:5173/` for dev (**`localhost` is disallowed — use the `127.0.0.1` loopback**).
3. **Scopes** the app will request: `user-read-currently-playing`, `user-read-playback-state`,
   `user-read-recently-played`, `user-library-read`.
4. **Dev-mode cap (~25 users):** in the dashboard, **allowlist each tester's Spotify account email** until
   you qualify for extended quota (now ~250k MAU + a registered business — the real adoption ceiling).
5. Put the **Client ID** in `src/lib/config.ts` (public-safe).
6. **(Optional, recommended) keep the refresh token off the client:** add a migration for an
   RLS-protected `user_streaming_tokens` table (scoped to `auth.uid()`) and deploy a `spotify-refresh`
   Edge Function. Skippable for v1 (token rotates in `localStorage` — acceptable, but it's the reason to
   add the function later).

**(B) I build** — the PKCE connect flow, visible-tab polling of now-playing/recently-played, ISRC →
catalog matching, "now spinning" in the feed + optional auto-advance of album status.

**(C) Verify** — connect Spotify, play a track → it appears as "now spinning" within ~10–30s.

---

## Suggested order

1. **4b `profiles.skin`** (5 min — one migration; immediate cross-device polish).
2. **4c cover extraction + Storage** (the headline depth feature; one bucket + migration + optional fn).
3. **5a Pro/Stripe** (first revenue; one fn + migration).
4. **5b OG unfurls** / **5c Spotify** (growth + the "it just knows" magic; do when you want them).

When you've provisioned a feature's **(A)** steps, point me at it and I'll execute **(B)** as a normal
plan → subagent → review cycle (with the same verification rigor as Phases 1–4a).
