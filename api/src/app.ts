import { Hono } from "hono";
import { createLruCache } from "./cache.js";
import { createSerialQueue } from "./queue.js";

const MB_UPSTREAM = "https://musicbrainz.org/ws/2";
const CAA_UPSTREAM = "https://coverartarchive.org";
const CACHE_CONTROL = "public, s-maxage=86400"; // Cloudflare edge absorbs repeats

export type AppOpts = {
  /** Shared secret required in X-Edge-Key; empty string disables (local dev). */
  edgeKey: string;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  userAgent?: string;
};

async function fetchWithRetry(
  f: typeof fetch,
  url: string,
  userAgent: string,
): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await f(url, {
      headers: { Accept: "application/json", "User-Agent": userAgent },
    });
    if (res.status !== 503 && res.status !== 429) return res;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error("musicbrainz rate limited");
}

export function createApp(opts: AppOpts) {
  const f = opts.fetchImpl ?? fetch;
  const ua = opts.userAgent ?? "DeanDB/1.0 (https://deandb.app)";
  const schedule = createSerialQueue({ minIntervalMs: opts.minIntervalMs ?? 1100 });
  const cache = createLruCache<{ status: number; body: string }>({
    maxEntries: 500,
    ttlMs: 24 * 60 * 60 * 1000,
  });
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (c.req.path === "/api/health") return next();
    if (opts.edgeKey && c.req.header("X-Edge-Key") !== opts.edgeKey) {
      return c.json({ error: "forbidden" }, 403);
    }
    return next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/mb/*", async (c) => {
    const suffix = c.req.path.replace(/^\/api\/mb/, "");
    const search = new URL(c.req.url).search;
    const hasFmt = /[?&]fmt=/.test(search);
    const url = `${MB_UPSTREAM}${suffix}${search}${hasFmt ? "" : `${search ? "&" : "?"}fmt=json`}`;
    const hit = cache.get(url);
    if (hit) {
      return c.body(hit.body, 200, {
        "Content-Type": "application/json",
        "Cache-Control": CACHE_CONTROL,
      });
    }
    try {
      const res = await schedule(() => fetchWithRetry(f, url, ua));
      const body = await res.text();
      if (res.ok) {
        cache.set(url, { status: res.status, body });
        return c.body(body, 200, {
          "Content-Type": "application/json",
          "Cache-Control": CACHE_CONTROL,
        });
      }
      return c.body(body, res.status as 404, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
    } catch {
      return c.json({ error: "musicbrainz upstream failed" }, 502);
    }
  });

  app.get("/api/coverart/*", async (c) => {
    const suffix = c.req.path.replace(/^\/api\/coverart/, "");
    // CAA answers with a redirect to archive.org; forward that redirect to the
    // browser (img-src https: allows it) instead of streaming bytes through
    // Cloud Run — the edge caches the redirect itself.
    try {
      const res = await f(`${CAA_UPSTREAM}${suffix}`, {
        redirect: "manual",
        headers: { "User-Agent": ua },
      });
      const location = res.headers.get("Location");
      if (res.status >= 300 && res.status < 400 && location) {
        // Use manual redirect response to ensure Cache-Control is set
        return new Response(null, {
          status: 302,
          headers: { Location: location, "Cache-Control": CACHE_CONTROL },
        });
      }
      return c.json(
        { error: "cover art not found" },
        res.status === 404 ? 404 : 502,
      );
    } catch {
      return c.json({ error: "cover art upstream failed" }, 502);
    }
  });

  return app;
}
