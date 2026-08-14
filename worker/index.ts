// Cloudflare Worker: serves the built SPA (assets binding) and reverse-proxies
// /api/* to Cloud Run, attaching the shared secret so the run.app URL can't be
// used to bypass Cloudflare's WAF. Every response — assets and API — passes
// through withSecurityHeaders (run_worker_first: true routes all requests
// here). Cacheable API responses are pinned in the edge cache so repeat
// lookups never reach Cloud Run.
export interface Env {
  ASSETS: Fetcher;
  API_ORIGIN: string;
  EDGE_SHARED_SECRET: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' https: data:; " +
    // wss:// is required alongside https:// — Messages/DMs subscribes to
    // Supabase Realtime over a WebSocket, and https: host-sources are not
    // reliably treated as matching wss: connections across browsers.
    "connect-src 'self' https://ixpxefsjrswujuxmnwkk.supabase.co wss://ixpxefsjrswujuxmnwkk.supabase.co; " +
    "font-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function withSecurityHeaders(
  res: Response,
  edgeCache?: "HIT" | "MISS",
  skipCsp = false,
): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (skipCsp && k === "Content-Security-Policy") continue;
    out.headers.set(k, v);
  }
  if (edgeCache) out.headers.set("X-Edge-Cache", edgeCache);
  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const cacheable = request.method === "GET" && url.pathname !== "/api/health";
      const cache = caches.default;
      const cacheKey = new Request(url.toString(), { method: "GET" });
      if (cacheable) {
        const hit = await cache.match(cacheKey);
        if (hit) return withSecurityHeaders(hit, "HIT");
      }
      const upstream = new URL(url.pathname + url.search, env.API_ORIGIN);
      const proxied = new Request(upstream.toString(), request);
      proxied.headers.set("X-Edge-Key", env.EDGE_SHARED_SECRET);
      const res = await fetch(proxied);
      if (
        cacheable &&
        res.status === 200 &&
        (res.headers.get("Cache-Control") ?? "").includes("s-maxage")
      ) {
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
      }
      return withSecurityHeaders(res, cacheable ? "MISS" : undefined);
    }
    // /sw.js is exempt from CSP: a service worker's own script CSP governs the
    // worker's fetch() calls, and the SW's cover cache must fetch Cover Art
    // Archive/archive.org (cross-origin) — hosts the document CSP deliberately
    // omits from connect-src. Documents keep the full policy.
    const skipCsp = url.pathname === "/sw.js";
    return withSecurityHeaders(await env.ASSETS.fetch(request), undefined, skipCsp);
  },
} satisfies ExportedHandler<Env>;
