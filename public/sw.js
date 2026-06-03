// DeanDB — minimal service worker for offline support + installability (PWA).
// Hand-rolled (no build plugin) so it stays base-path agnostic: it works under
// /DeanDB/ on GitHub Pages today and a custom domain later without a rebuild.
//
// Strategy:
//   • navigations  → network-first, fall back to the cached app shell offline
//   • same-origin GET assets → cache-first (hashed Vite filenames are immutable)
//   • cross-origin (Supabase, MusicBrainz, Cover Art) → never intercepted: those
//     must always hit the network so data/auth stay fresh.
const CACHE = "deandb-v1";

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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave Supabase/MusicBrainz/CAA alone

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
