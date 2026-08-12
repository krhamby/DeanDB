import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const KEY = "test-key";

function jsonUpstream(body: unknown, status = 200) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calls.push(String(input instanceof Request ? input.url : input));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("createApp", () => {
  it("serves /api/health without a key", async () => {
    const app = createApp({ edgeKey: KEY });
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects /api/mb without the edge key", async () => {
    const app = createApp({ edgeKey: KEY });
    const res = await app.request("/api/mb/artist/abc");
    expect(res.status).toBe(403);
  });

  it("proxies /api/mb, appending fmt=json and caching the result", async () => {
    const upstream = jsonUpstream({ name: "Nirvana" });
    const app = createApp({ edgeKey: KEY, fetchImpl: upstream.fetchImpl, minIntervalMs: 0 });
    const headers = { "X-Edge-Key": KEY };

    const res1 = await app.request("/api/mb/artist/abc?inc=release-groups", { headers });
    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({ name: "Nirvana" });
    expect(res1.headers.get("Cache-Control")).toBe("public, s-maxage=86400");
    expect(upstream.calls[0]).toBe(
      "https://musicbrainz.org/ws/2/artist/abc?inc=release-groups&fmt=json",
    );

    const res2 = await app.request("/api/mb/artist/abc?inc=release-groups", { headers });
    expect(res2.status).toBe(200);
    expect(upstream.calls.length).toBe(1); // served from cache
  });

  it("returns 502 when MusicBrainz fails", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const app = createApp({ edgeKey: KEY, fetchImpl, minIntervalMs: 0 });
    const res = await app.request("/api/mb/artist/abc", { headers: { "X-Edge-Key": KEY } });
    expect(res.status).toBe(502);
  });

  it("passes cover art redirects through to the browser", async () => {
    const fetchImpl = (async () =>
      new Response(null, {
        status: 307,
        headers: { Location: "https://archive.org/some/image.jpg" },
      })) as typeof fetch;
    const app = createApp({ edgeKey: KEY, fetchImpl });
    const res = await app.request("/api/coverart/release-group/xyz/front-250", {
      headers: { "X-Edge-Key": KEY },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://archive.org/some/image.jpg");
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=86400");
  });

  it("maps cover art 404s to 404", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    const app = createApp({ edgeKey: KEY, fetchImpl });
    const res = await app.request("/api/coverart/release-group/xyz/front-250", {
      headers: { "X-Edge-Key": KEY },
    });
    expect(res.status).toBe(404);
  });
});
