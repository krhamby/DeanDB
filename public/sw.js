// DeanDB — minimal service worker for offline support + installability (PWA).
// v3 — script must be byte-distinct from v2 so browsers reinstall it and pick
// up its new CSP-free response headers (worker-script CSP governs SW fetches).
// Hand-rolled (no build plugin) so it stays base-path agnostic: it works under
// /DeanDB/ on GitHub Pages today and a custom domain later without a rebuild.
//
// Strategy:
//   • navigations  → network-first, fall back to the cached app shell offline
//   • same-origin GET assets → cache-first (hashed Vite filenames are immutable)
//   • cross-origin (Supabase, MusicBrainz, Cover Art) → never intercepted: those
//     must always hit the network so data/auth stay fresh.
const CACHE = "deandb-v2";
const COVERS = "deandb-covers-v1";
const COVERS_MAX = 300; // cap so the browser cache can't grow unbounded

self.addEventListener("install", (event) => {
  // Precache the app shell (the scope root serves index.html) so navigations
  // work offline even if the user never visited the bare scope URL.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(self.registration.scope))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== COVERS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Cover art (cross-origin images, e.g. Cover Art Archive): cache for instant
  // repeat loads. CAA keeps hosting the bytes — nothing is stored on our backend.
  if (req.destination === "image" && url.origin !== self.location.origin) {
    event.respondWith(coverCache(req));
    return;
  }
  if (url.origin !== self.location.origin) return; // leave Supabase/MusicBrainz/CAA alone
  if (url.pathname.startsWith("/api/")) return; // API JSON must always hit the network

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match(self.registration.scope)),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

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
