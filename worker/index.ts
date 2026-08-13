// Cloudflare Worker: serves the built SPA (assets binding) and reverse-proxies
// /api/* to Cloud Run, attaching the shared secret so the run.app URL can't be
// used to bypass Cloudflare's WAF. Security headers go on every response.
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
    "connect-src 'self' https://ixpxefsjrswujuxmnwkk.supabase.co; " +
    "font-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const upstream = new URL(url.pathname + url.search, env.API_ORIGIN);
      const proxied = new Request(upstream.toString(), request);
      proxied.headers.set("X-Edge-Key", env.EDGE_SHARED_SECRET);
      return withSecurityHeaders(await fetch(proxied));
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;
