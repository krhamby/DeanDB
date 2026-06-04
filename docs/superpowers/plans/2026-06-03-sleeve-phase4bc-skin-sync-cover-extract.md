# Sleeve — Phase 4b + 4c: Skin Sync + Cover Color (storage-free) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** **4b** — sync the Paper/Midnight skin to the account (`profiles.skin`). **4c** — per-album accents come from the **real cover color** (extracted server-side, stored as a tiny `dominant_color` text), and covers load fast via a **browser service-worker cache** (Cover Art Archive keeps hosting the images — **no Supabase Storage, no re-host, no egress cost**).

**Architecture:** The slim `extract-cover` Edge Function returns only a color (no upload). The app reads `dominant_color` and, the first time a signed-in user views an album that has art but no color yet, **lazily** calls the function (best-effort; falls back to the gradient). Cover *image* speed is handled entirely client-side: extend `public/sw.js` to runtime-cache cover images (stale-while-revalidate, size-capped). `cover_storage_url` exists in the DB but is intentionally **unused** (we're not re-hosting).

**Tech Stack:** React 18 + TS strict · Supabase JS (`functions.invoke`) · Service Worker (Cache API) · Tailwind tokens.

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green; visual via `npm run dev` against the real Supabase — skin persists across reload; album accent shifts to the real cover hue after a view; repeat cover loads served from the SW cache.

**Prereq (user, done / to redo):** the **slim** color-only `extract-cover` is deployed (no Storage upload). The `covers` bucket is now unused (leave or delete).

---

## File Structure

| File | Change |
|---|---|
| `src/types.ts` | `Album.dominantColor`; `Profile.skin`. |
| `src/lib/api.ts` | `ProfileRow.skin` + `mapProfile` + `PROFILE_COLS` + `updateProfile` (skin); `UserAlbumRow.album.dominant_color` + `fetchJourney` select + album mapping; new `extractCover()`. |
| `src/lib/store.tsx` | `AuthValue.updateProfile` patch +`skin`; `ThemeProvider` syncs skin from profile + persists. |
| `src/pages/AlbumDetail.tsx` | accent from `dominantColor`; lazy extraction. |
| `public/sw.js` | runtime-cache cover images (stale-while-revalidate, capped). |

---

## Task 1: Data layer (types + api)

**Files:** `src/types.ts`, `src/lib/api.ts`

- [ ] **Step 1: types.ts** — in `interface Album`, after `coverUrl?: string;`:
```ts
  /** Dominant color extracted from the cover art (per-album accent source). null = not yet extracted. */
  dominantColor?: string | null;
```
In `interface Profile`, after `lockOwnTheme?: boolean;`:
```ts
  /** Active skin, synced across the account. Defaults to "paper". */
  skin?: "paper" | "midnight";
```

- [ ] **Step 2: api.ts profiles** —
  - `interface ProfileRow`: add `skin: string | null;` after `lock_own_theme: boolean;`
  - `mapProfile` return: add `skin: r.skin === "midnight" ? "midnight" : "paper",`
  - `PROFILE_COLS`: append `, skin`
  - `updateProfile` patch Pick: add `| "skin"`; and add `if (patch.skin !== undefined) row.skin = patch.skin;`

- [ ] **Step 3: api.ts albums** —
  - `interface UserAlbumRow`'s `album`: add `dominant_color: string | null;` after `cover_url: string | null;`
  - `fetchJourney` select: change `"album:catalog_albums!inner ( id, artist_id, title, year, cover, cover_url, mbid, runtime_min, "` → add `dominant_color` → `"album:catalog_albums!inner ( id, artist_id, title, year, cover, cover_url, dominant_color, mbid, runtime_min, "`
  - album literal: after `coverUrl: cat.cover_url ?? undefined,` add `dominantColor: cat.dominant_color ?? null,`

- [ ] **Step 4: api.ts `extractCover()`** (near the catalog functions):
```ts
/** Best-effort: ask the slim `extract-cover` Edge Function for an album's dominant
 *  cover color. Returns the hex, or null on any failure (caller keeps the gradient).
 *  No image is uploaded — Cover Art Archive keeps hosting the artwork. */
export async function extractCover(albumId: string, coverUrl: string): Promise<string | null> {
  try {
    const { data, error } = await requireClient().functions.invoke("extract-cover", {
      body: { albumId, coverUrl },
    });
    if (error || !data || typeof data.dominant_color !== "string") return null;
    return data.dominant_color;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5:** `npm run typecheck && npm run build && npm run test` → PASS. Commit `feat(api): map profiles.skin + album dominant_color + extractCover()`.

---

## Task 2: Skin sync (4b)

**Files:** `src/lib/store.tsx`

- [ ] **Step 1:** `AuthValue.updateProfile` patch `Pick<Profile, …>` — add `| "skin"`.
- [ ] **Step 2:** `ThemeProvider`: `const { profile, updateProfile } = useAuth();`
- [ ] **Step 3:** adopt account skin once the profile loads:
```tsx
  useEffect(() => {
    if (profile?.skin === "paper" || profile?.skin === "midnight") setSkinState(profile.skin);
  }, [profile?.skin]);
```
- [ ] **Step 4:** persist on change:
```tsx
  const setSkin = useCallback(
    (s: SkinId) => {
      setSkinState(s);
      try { localStorage.setItem("deandb.skin", s); } catch { /* ignore */ }
      if (profile) void updateProfile({ skin: s });
    },
    [profile, updateProfile],
  );
```
- [ ] **Step 5:** `npm run typecheck && npm run build && npm run test` → PASS. Commit `feat(skin): persist Paper/Midnight to the account (cross-device)`.

---

## Task 3: Real cover-color accent (4c, app side)

**Files:** `src/pages/AlbumDetail.tsx`

- [ ] **Step 1:** local state for a freshly-extracted color, reset per album:
```tsx
  const [extractedColor, setExtractedColor] = useState<string | null>(null);
  useEffect(() => { setExtractedColor(null); }, [album?.id]);
```
- [ ] **Step 2:** accent prefers extracted → stored → gradient:
```tsx
  const albumAccent = legible(extractedColor ?? album.dominantColor ?? album.cover[0], surface);
```
- [ ] **Step 3:** lazy extraction (signed-in viewers, art present, no color yet). Place after `album` is defined, before the return:
```tsx
  useEffect(() => {
    if (!user || !album.coverUrl || album.dominantColor) return;
    let active = true;
    void api.extractCover(album.id, album.coverUrl).then((c) => {
      if (active && c) setExtractedColor(c);
    });
    return () => { active = false; };
  }, [user, album.id, album.coverUrl, album.dominantColor]);
```
(`api` is already imported in AlbumDetail.)
- [ ] **Step 4:** `npm run typecheck && npm run build && npm run test` → PASS. Commit `feat(cover): per-album accent from the real cover color (lazy, best-effort)`.

---

## Task 4: Service-worker cover cache (storage-free speed)

**Files:** `public/sw.js`

- [ ] **Step 1:** add a covers cache name + keep it on activate. Near `const CACHE = "deandb-v1";` add:
```js
const COVERS = "deandb-covers-v1";
const COVERS_MAX = 300; // cap so the browser cache can't grow unbounded
```
In the `activate` handler, the cleanup currently deletes every cache `!== CACHE`. Change the filter to keep BOTH:
```js
keys.filter((k) => k !== CACHE && k !== COVERS).map((k) => caches.delete(k))
```

- [ ] **Step 2:** in the `fetch` handler, BEFORE the existing `if (url.origin !== self.location.origin) return;` early return, intercept cross-origin image (cover) requests:
```js
  // Cover art (cross-origin images, e.g. Cover Art Archive): cache for instant
  // repeat loads. CAA keeps hosting the bytes — nothing is stored on our backend.
  if (req.destination === "image" && url.origin !== self.location.origin) {
    event.respondWith(coverCache(req));
    return;
  }
```

- [ ] **Step 3:** add the helpers (after the `fetch` listener):
```js
async function coverCache(req) {
  const cache = await caches.open(COVERS);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      // opaque (no-CORS) responses are fine to display + cache for <img>
      if (res && (res.ok || res.type === "opaque")) {
        cache.put(req, res.clone()).then(() => trimCache(cache, COVERS_MAX));
      }
      return res;
    })
    .catch(() => cached);
  return cached || network; // stale-while-revalidate
}
async function trimCache(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
```

- [ ] **Step 4:** `npm run build` → PASS. Commit `feat(sw): runtime-cache cover art in the browser (stale-while-revalidate, capped)`.

---

## Task 5: QA (real backend)

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 2: Code review** — extraction best-effort/null-safe; only signed-in viewers with art + no color; `extractedColor` resets per album (no stale flash); skin persists to localStorage AND account; SW keeps both caches on activate, caps covers, handles opaque responses; no Supabase Storage referenced anywhere.
- [ ] **Step 3 (controller, visual — real Supabase):** `npm run dev`, sign in → (a) toggle skin in Settings, reload → sticks; (b) open an album with art → accent shifts to the real cover hue within a moment, and `catalog_albums.dominant_color` is set; (c) re-open it / revisit → cover served from the `deandb-covers-v1` SW cache (DevTools → Application → Cache Storage).

---

## Self-Review
**Coverage:** §4.2 real cover-color accent (server-side extraction, no CORS issue), storage-free cover speed via SW (the user's call), §Phase-4 skin persistence. Gradient fallback preserved. **No Supabase Storage / egress cost.** ✓
**Placeholder scan:** exact edits; Task 5 Step 3 is an explicit live-backend check. ✓
**Type consistency:** `Album.dominantColor`, `Profile.skin`, `extractCover(): string|null`, `updateProfile({skin})` allowlisted in api + store. `cover_storage_url` intentionally unused. ✓
