# deandb.app Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve DeanDB from `deandb.app` via a Cloudflare Worker (static SPA + security headers + `/api/*` proxy) backed by a new GCP Cloud Run service hosting the MusicBrainz proxy, then take the repo private with a redirecting stub at the old GitHub Pages URL.

**Architecture:** Cloudflare Worker `deandb-web` serves `dist/` and reverse-proxies `/api/*` (adding an `X-Edge-Key` shared secret) to Cloud Run service `deandb-api` (Node 22 + Hono, scale-to-zero) in dedicated GCP project `deandb-krhamby`. Supabase is unchanged; the browser still talks to it directly. Deploys run from GitHub Actions via Workload Identity Federation (GCP) and a scoped API token (Cloudflare).

**Tech Stack:** Vite 6 / React 18 / TS 5 (existing) · Hono + @hono/node-server · Vitest · Docker (linux/amd64) · wrangler · gcloud · gh CLI.

**Spec:** `docs/superpowers/specs/2026-08-12-deandb-app-migration-design.md` — read it before starting any task.

## Global Constraints

- TypeScript **strict**; the type checker is the gate: root `npm run typecheck` / `npm run build` must stay green. No ESLint/Prettier exists — do not add them.
- Names are load-bearing and must be used exactly: GCP project **`deandb-krhamby`**, region **`us-central1`**, Artifact Registry repo **`deandb`**, image **`us-central1-docker.pkg.dev/deandb-krhamby/deandb/deandb-api`**, Cloud Run service **`deandb-api`**, runtime SA **`deandb-api-run`**, deploy SA **`deandb-deployer`**, WIF pool **`github`**, WIF provider **`deandb-repo`**, secret **`edge-shared-secret`** (env var **`EDGE_SHARED_SECRET`**), header **`X-Edge-Key`**, Worker **`deandb-web`**.
- Cloud Run: `--min-instances 0 --max-instances 2 --memory 512Mi --allow-unauthenticated`. Cost target is $0/month — never raise max-instances or add paid services.
- The shared secret lives ONLY in `~/.deandb-edge-key` (0600), GCP Secret Manager, and Cloudflare Worker secrets. Never commit it, echo it, or put it in a URL.
- Docker images for Cloud Run MUST be built `--platform linux/amd64` (this Mac is arm64).
- Work on branch `infra/deandb-app-migration`. Do not push or merge to `main` until Task 13 (merge IS the cutover). Do not touch `fix/dashboard-summit-mountain`.
- Steps marked **HUMAN** need Kevin (browser logins, dashboard toggles, billing). Stop and ask; do not work around them.
- Commit messages: conventional prefix (`feat:`/`fix:`/`docs:`/`infra:`) + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer (personal repo — SMSI rules do NOT apply).

---

### Task 1: Tooling prerequisites

**Files:** none (system setup)

**Interfaces:**
- Produces: working `gcloud` (authed), `wrangler` (authed, as devDependency), verified `gh` auth. Later tasks assume all three.

- [ ] **Step 1: Install gcloud**

```bash
brew install --cask google-cloud-sdk
```

Expected: `gcloud --version` prints a version.

- [ ] **Step 2 (HUMAN): Authenticate gcloud**

```bash
gcloud auth login
```

Kevin completes the browser flow with the Google account that owns the Raise the Bahr billing account.

- [ ] **Step 3: Add wrangler as a devDependency**

```bash
cd /Users/kevinhamby/Documents/deandb/DeanDB && npm install --save-dev wrangler
```

Expected: `npx wrangler --version` prints ≥ 4.x.

- [ ] **Step 4 (HUMAN): Authenticate wrangler**

```bash
npx wrangler login
```

Kevin completes the browser OAuth against the Cloudflare account holding `deandb.app`.

- [ ] **Step 5: Verify gh auth + account**

```bash
gh auth status && gh repo view krhamby/DeanDB --json name,visibility
```

Expected: logged in as `krhamby`; repo visible, currently `PUBLIC`.

- [ ] **Step 6: Commit lockfile change**

```bash
git add package.json package-lock.json && git commit -m "infra: add wrangler as devDependency

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Vite base path + dev proxy

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Produces: production builds emit root-relative URLs (`/assets/...`); `npm run dev` forwards `/api/*` to `http://localhost:8787` (the API dev server from Task 6).

- [ ] **Step 1: Replace vite.config.ts**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Served from the deandb.app root (Cloudflare Worker static assets), so the
// base is always "/". In dev, /api/* proxies to the local deandb-api server
// (run `npm run dev` inside api/) so the MusicBrainz proxy works offline
// from Cloudflare.
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://localhost:8787" } },
});
```

- [ ] **Step 2: Verify build output is root-relative**

```bash
npm run build && grep -o 'src="/assets/[^"]*"' dist/index.html | head -1
```

Expected: a `src="/assets/index-….js"` match (NOT `/DeanDB/assets/`).

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts && git commit -m "infra: serve from root path; proxy /api to local api server in dev

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: API package scaffold + serial rate-limit queue (TDD)

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/src/queue.ts`
- Test: `api/src/queue.test.ts`

**Interfaces:**
- Produces: `createSerialQueue(opts: { minIntervalMs: number; now?: () => number; sleep?: (ms: number) => Promise<void> }): <T>(task: () => Promise<T>) => Promise<T>` — Task 5 consumes it.

- [ ] **Step 1: Create `api/package.json`**

```json
{
  "name": "deandb-api",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "hono": "^4.6.14"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: Create `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Install**

```bash
cd api && npm install
```

- [ ] **Step 4: Write the failing test `api/src/queue.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { createSerialQueue } from "./queue.js";

function virtualClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: (ms: number) => {
      t += ms;
      return Promise.resolve();
    },
  };
}

describe("createSerialQueue", () => {
  it("runs tasks serially, spaced by minIntervalMs", async () => {
    const clock = virtualClock();
    const schedule = createSerialQueue({ minIntervalMs: 1000, ...clock });
    const started: number[] = [];
    await Promise.all([
      schedule(async () => started.push(clock.now())),
      schedule(async () => started.push(clock.now())),
      schedule(async () => started.push(clock.now())),
    ]);
    expect(started).toEqual([0, 1000, 2000]);
  });

  it("keeps the chain alive after a rejection", async () => {
    const clock = virtualClock();
    const schedule = createSerialQueue({ minIntervalMs: 1000, ...clock });
    await expect(schedule(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(schedule(async () => "ok")).resolves.toBe("ok");
  });

  it("returns each task's own result", async () => {
    const clock = virtualClock();
    const schedule = createSerialQueue({ minIntervalMs: 10, ...clock });
    const [a, b] = await Promise.all([schedule(async () => 1), schedule(async () => 2)]);
    expect([a, b]).toEqual([1, 2]);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd api && npx vitest run src/queue.test.ts`
Expected: FAIL — cannot resolve `./queue.js`.

- [ ] **Step 6: Implement `api/src/queue.ts`**

```ts
// Server-side twin of the client queue in src/lib/musicbrainz.ts: one global
// serial queue so the whole service is a single polite MusicBrainz client.
// now/sleep are injectable so tests run on a virtual clock.
export type QueueOpts = {
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export function createSerialQueue(opts: QueueOpts) {
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastStarted = -Infinity;
  let chain: Promise<unknown> = Promise.resolve();

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = opts.minIntervalMs - (now() - lastStarted);
      if (wait > 0) await sleep(wait);
      lastStarted = now();
      return task();
    });
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd api && npx vitest run src/queue.test.ts`
Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add api/package.json api/package-lock.json api/tsconfig.json api/src/queue.ts api/src/queue.test.ts
git commit -m "feat(api): scaffold deandb-api package with serial rate-limit queue

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: LRU cache with TTL (TDD)

**Files:**
- Create: `api/src/cache.ts`
- Test: `api/src/cache.test.ts`

**Interfaces:**
- Produces: `createLruCache<V>(opts: { maxEntries: number; ttlMs: number; now?: () => number }): { get(key: string): V | undefined; set(key: string, value: V): void; size: number }` — Task 5 consumes it.

- [ ] **Step 1: Write the failing test `api/src/cache.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { createLruCache } from "./cache.js";

describe("createLruCache", () => {
  it("stores and retrieves values", () => {
    const c = createLruCache<string>({ maxEntries: 2, ttlMs: 1000 });
    c.set("a", "1");
    expect(c.get("a")).toBe("1");
    expect(c.get("missing")).toBeUndefined();
  });

  it("evicts the least recently used entry beyond maxEntries", () => {
    const c = createLruCache<string>({ maxEntries: 2, ttlMs: 1000 });
    c.set("a", "1");
    c.set("b", "2");
    c.get("a"); // refresh a's recency
    c.set("c", "3"); // evicts b
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe("1");
    expect(c.get("c")).toBe("3");
    expect(c.size).toBe(2);
  });

  it("expires entries after ttlMs", () => {
    let t = 0;
    const c = createLruCache<string>({ maxEntries: 5, ttlMs: 100, now: () => t });
    c.set("a", "1");
    t = 99;
    expect(c.get("a")).toBe("1");
    t = 100;
    expect(c.get("a")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/cache.test.ts`
Expected: FAIL — cannot resolve `./cache.js`.

- [ ] **Step 3: Implement `api/src/cache.ts`**

```ts
// Small in-process LRU with TTL — second cache layer behind Cloudflare's edge
// cache. Map iteration order gives us recency for free.
type Entry<V> = { value: V; expiresAt: number };

export function createLruCache<V>(opts: {
  maxEntries: number;
  ttlMs: number;
  now?: () => number;
}) {
  const now = opts.now ?? Date.now;
  const map = new Map<string, Entry<V>>();
  return {
    get(key: string): V | undefined {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        map.delete(key);
        return undefined;
      }
      map.delete(key); // re-insert to mark as most recently used
      map.set(key, entry);
      return entry.value;
    },
    set(key: string, value: V): void {
      if (map.has(key)) map.delete(key);
      map.set(key, { value, expiresAt: now() + opts.ttlMs });
      if (map.size > opts.maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
    },
    get size() {
      return map.size;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/cache.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add api/src/cache.ts api/src/cache.test.ts
git commit -m "feat(api): LRU cache with TTL

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Hono app — edge-key middleware, /api/mb proxy, /api/coverart redirect (TDD)

**Files:**
- Create: `api/src/app.ts`
- Test: `api/src/app.test.ts`

**Interfaces:**
- Consumes: `createSerialQueue` (Task 3), `createLruCache` (Task 4).
- Produces: `createApp(opts: { edgeKey: string; fetchImpl?: typeof fetch; minIntervalMs?: number; userAgent?: string }): Hono` — Task 6's server consumes it. Routes: `GET /api/health` (open), `GET /api/mb/*`, `GET /api/coverart/*` (both require `X-Edge-Key` when `edgeKey` is non-empty; empty string disables the check for local dev).

- [ ] **Step 1: Write the failing test `api/src/app.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/app.test.ts`
Expected: FAIL — cannot resolve `./app.js`.

- [ ] **Step 3: Implement `api/src/app.ts`**

```ts
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
    const url = `${MB_UPSTREAM}${suffix}${search}${search ? "&" : "?"}fmt=json`;
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
    const res = await f(`${CAA_UPSTREAM}${suffix}`, {
      redirect: "manual",
      headers: { "User-Agent": ua },
    });
    const location = res.headers.get("Location");
    if (res.status >= 300 && res.status < 400 && location) {
      c.header("Cache-Control", CACHE_CONTROL);
      return c.redirect(location, 302);
    }
    return c.json(
      { error: "cover art not found" },
      res.status === 404 ? 404 : 502,
    );
  });

  return app;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run`
Expected: all queue, cache, and app tests pass.

- [ ] **Step 5: Typecheck and commit**

```bash
cd api && npm run typecheck && cd .. && git add api/src/app.ts api/src/app.test.ts
git commit -m "feat(api): MusicBrainz proxy + cover-art redirect with edge-key middleware

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Server bootstrap + Dockerfile + container smoke test

**Files:**
- Create: `api/src/server.ts`, `api/Dockerfile`, `api/.dockerignore`

**Interfaces:**
- Consumes: `createApp` (Task 5).
- Produces: container listening on `$PORT` (default 8787 locally; Cloud Run injects 8080), configured by env `EDGE_SHARED_SECRET`. Tasks 8, 9, 11 consume the image/dev server.

- [ ] **Step 1: Create `api/src/server.ts`**

```ts
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const app = createApp({ edgeKey: process.env.EDGE_SHARED_SECRET ?? "" });
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`deandb-api listening on :${port}`);
```

- [ ] **Step 2: Create `api/.dockerignore`**

```
node_modules
dist
*.test.ts
```

- [ ] **Step 3: Create `api/Dockerfile`**

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

- [ ] **Step 4: Verify the dev server runs**

```bash
cd api && (npm run dev &) && sleep 3 && curl -s http://localhost:8787/api/health && kill %1
```

Expected: `{"ok":true}` (edge-key check disabled because `EDGE_SHARED_SECRET` is unset).

- [ ] **Step 5: Build and smoke the container (amd64)**

```bash
cd api && docker build --platform linux/amd64 -t deandb-api:smoke .
docker run --rm -d -p 18787:8080 -e PORT=8080 -e EDGE_SHARED_SECRET=smokekey --name deandb-api-smoke deandb-api:smoke
sleep 2
curl -s http://localhost:18787/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:18787/api/mb/artist/abc
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Edge-Key: smokekey' 'http://localhost:18787/api/mb/artist/5b11f4ce-a62d-471e-81fc-a69a8278c7da'
docker stop deandb-api-smoke
```

Expected: `{"ok":true}`, then `403` (no key), then `200` (live MusicBrainz fetch of Nirvana through the container).

- [ ] **Step 6: Commit**

```bash
git add api/src/server.ts api/Dockerfile api/.dockerignore
git commit -m "feat(api): node server bootstrap + production Dockerfile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: GCP project bootstrap (project, APIs, SAs, secret, WIF)

**Files:** none (cloud state). Record outputs in `docs/superpowers/plans/2026-08-12-deandb-app-migration.md` checkboxes as you go.

**Interfaces:**
- Produces: project `deandb-krhamby` with APIs enabled; AR repo `deandb`; SAs `deandb-api-run` / `deandb-deployer`; secret `edge-shared-secret`; WIF provider resource name (needed by Task 12). Consumed by Tasks 8 and 12.

- [x] **Step 1: Create project** — already existed (created 2026-08-12T21:14:29Z by a prior run); confirmed via `gcloud projects describe deandb-krhamby` (project number `935180449709`).

```bash
gcloud projects create deandb-krhamby --name="DeanDB"
```

Expected: success. (If the ID is somehow taken, STOP and ask Kevin for an alternate ID — it must then be substituted in every later command and in `.github/workflows/deploy.yml`.)

- [x] **Step 2 (HUMAN): Link billing** — already linked to `016F50-C744A4-2B46CB` (same account as Raise the Bahr), `billingEnabled: true`, confirmed via `gcloud billing projects describe`.

```bash
gcloud billing accounts list
```

Kevin picks the account (same one as Raise the Bahr), then:

```bash
gcloud billing projects link deandb-krhamby --billing-account=<ACCOUNT_ID_KEVIN_CHOSE>
```

- [x] **Step 3: Enable APIs** — all 5 required APIs were already enabled; re-ran `gcloud services enable` to confirm (idempotent, no-op).

```bash
gcloud config set project deandb-krhamby
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
```

- [x] **Step 4: Artifact Registry repo + service accounts** — created `deandb` repo (us-central1) and both service accounts.

```bash
gcloud artifacts repositories create deandb --repository-format=docker --location=us-central1
gcloud iam service-accounts create deandb-api-run --display-name="deandb-api runtime"
gcloud iam service-accounts create deandb-deployer --display-name="CI deployer"
```

- [x] **Step 5: Create the shared secret (never echo it)** — `~/.deandb-edge-key` did not exist, generated fresh (chmod 600, 64 hex chars), created `edge-shared-secret` v1, bound `deandb-api-run` as accessor.

```bash
touch ~/.deandb-edge-key && chmod 600 ~/.deandb-edge-key
openssl rand -hex 32 > ~/.deandb-edge-key
gcloud secrets create edge-shared-secret --data-file="$HOME/.deandb-edge-key"
gcloud secrets add-iam-policy-binding edge-shared-secret \
  --member="serviceAccount:deandb-api-run@deandb-krhamby.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

- [x] **Step 6: Grant the deployer least privilege** — all three bindings applied.

```bash
gcloud projects add-iam-policy-binding deandb-krhamby \
  --member="serviceAccount:deandb-deployer@deandb-krhamby.iam.gserviceaccount.com" \
  --role="roles/run.developer"
gcloud projects add-iam-policy-binding deandb-krhamby \
  --member="serviceAccount:deandb-deployer@deandb-krhamby.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
gcloud iam service-accounts add-iam-policy-binding \
  deandb-api-run@deandb-krhamby.iam.gserviceaccount.com \
  --member="serviceAccount:deandb-deployer@deandb-krhamby.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

- [x] **Step 7: Workload Identity Federation (covers both repo names, pre- and post-rename)** — pool + provider created; the final SA binding hit a transient `PERMISSION_DENIED` (propagation lag on the just-created SA), succeeded on retry after a 20s wait.

```bash
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc deandb-repo \
  --location=global --workload-identity-pool=github \
  --display-name="DeanDB repo" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner=='krhamby' && assertion.repository in ['krhamby/DeanDB','krhamby/deandb-app']"
PROJECT_NUMBER=$(gcloud projects describe deandb-krhamby --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding \
  deandb-deployer@deandb-krhamby.iam.gserviceaccount.com \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository_owner/krhamby" \
  --role="roles/iam.workloadIdentityUser"
```

- [x] **Step 8: Verify + record the provider resource name (Task 12 needs it)** — `projects/935180449709/locations/global/workloadIdentityPools/github/providers/deandb-repo`

```bash
gcloud iam workload-identity-pools providers describe deandb-repo \
  --location=global --workload-identity-pool=github --format='value(name)'
```

Expected: `projects/<number>/locations/global/workloadIdentityPools/github/providers/deandb-repo`. Save this string.

---

### Task 8: First manual Cloud Run deploy + smoke

**Files:** none (cloud state)

**Interfaces:**
- Consumes: image from Task 6, project plumbing from Task 7.
- Produces: live service URL (`https://deandb-api-….run.app`) — Tasks 9 and 11 need it. Deploy-time flags (SA, instances, memory, secret) persist across CI image-only deploys.

- [ ] **Step 1: Push the image**

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
docker tag deandb-api:smoke us-central1-docker.pkg.dev/deandb-krhamby/deandb/deandb-api:manual-1
docker push us-central1-docker.pkg.dev/deandb-krhamby/deandb/deandb-api:manual-1
```

- [ ] **Step 2: Deploy**

```bash
gcloud run deploy deandb-api \
  --image us-central1-docker.pkg.dev/deandb-krhamby/deandb/deandb-api:manual-1 \
  --region us-central1 \
  --service-account deandb-api-run@deandb-krhamby.iam.gserviceaccount.com \
  --allow-unauthenticated --min-instances 0 --max-instances 2 --memory 512Mi \
  --set-secrets EDGE_SHARED_SECRET=edge-shared-secret:latest
```

- [ ] **Step 3: Smoke test**

```bash
API_URL=$(gcloud run services describe deandb-api --region us-central1 --format='value(status.url)')
echo "$API_URL"   # record this — Task 9 pastes it into wrangler.jsonc
curl -s "$API_URL/api/health"
curl -s -o /dev/null -w '%{http_code}\n' "$API_URL/api/mb/artist/5b11f4ce-a62d-471e-81fc-a69a8278c7da"
curl -s -H "X-Edge-Key: $(cat ~/.deandb-edge-key)" "$API_URL/api/mb/artist/5b11f4ce-a62d-471e-81fc-a69a8278c7da" | head -c 120; echo
```

Expected: `{"ok":true}` · `403` · JSON beginning `{"name":"Nirvana"` (order of fields may vary).

---

### Task 9: Cloudflare Worker + wrangler config + preview deploy

**Files:**
- Create: `worker/index.ts`, `wrangler.jsonc`

**Interfaces:**
- Consumes: `API_URL` recorded in Task 8 Step 3.
- Produces: Worker `deandb-web` on `deandb-web.<account>.workers.dev` serving the SPA + proxying `/api/*`. Task 13 adds the custom domain to this same config.

- [ ] **Step 1: Create `worker/index.ts`**

```ts
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
```

- [ ] **Step 2: Create `wrangler.jsonc`** — replace `API_ORIGIN`'s value with the exact URL echoed in Task 8 Step 3:

```jsonc
{
  "name": "deandb-web",
  "main": "worker/index.ts",
  "compatibility_date": "2026-08-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "vars": {
    // Paste the status.url from Task 8, e.g. https://deandb-api-xxxxx-uc.a.run.app
    "API_ORIGIN": "<PASTE-TASK-8-URL>"
  }
  // Task 13 adds: "routes": [{ "pattern": "deandb.app", "custom_domain": true }]
}
```

- [ ] **Step 3: Add Worker types so `tsc -b` at root ignores worker/** — the worker is type-checked by wrangler, not the root project. Verify root build still passes:

```bash
npm run build
```

Expected: PASS (root tsconfig `include` does not cover `worker/`; if it errors on worker/index.ts, add `"exclude": ["worker"]` to `tsconfig.app.json`).

- [ ] **Step 4: Set the Worker secret and deploy to workers.dev**

```bash
npx wrangler secret put EDGE_SHARED_SECRET < ~/.deandb-edge-key
npx wrangler deploy
```

Expected: deploy succeeds, printing `https://deandb-web.<account>.workers.dev`. Record the URL.

- [ ] **Step 5: Verify headers, SPA fallback, and proxy**

```bash
WORKER_URL=https://deandb-web.<account>.workers.dev   # from Step 4 output
curl -sI "$WORKER_URL/" | grep -iE 'content-security-policy|strict-transport|x-content-type'
curl -s -o /dev/null -w '%{http_code}\n' "$WORKER_URL/anything/deep"       # SPA fallback → 200
curl -s "$WORKER_URL/api/health"                                            # {"ok":true}
curl -s "$WORKER_URL/api/mb/artist/5b11f4ce-a62d-471e-81fc-a69a8278c7da" | head -c 120; echo
```

Expected: all three headers present; `200`; `{"ok":true}`; Nirvana JSON **without** sending any key (the Worker injects it).

- [ ] **Step 6: Commit**

```bash
git add worker/index.ts wrangler.jsonc
git commit -m "feat(edge): Cloudflare Worker — SPA assets, security headers, /api proxy

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Repoint the client at /api

**Files:**
- Modify: `src/lib/musicbrainz.ts:14` (`const MB = …`) and `src/lib/musicbrainz.ts:17-19` (`coverArtUrl`), plus the header comment block at lines 1-12.

**Interfaces:**
- Consumes: dev proxy (Task 2) + API dev server (Task 6) for local verification.
- Produces: all MusicBrainz/Cover-Art traffic flows through `/api/*`. No signature changes — `coverArtUrl(releaseGroupMbid: string): string` and all exported fetchers keep their exact signatures.

- [ ] **Step 1: Edit `src/lib/musicbrainz.ts`**

Replace line 14:

```ts
const MB = "/api/mb";
```

Replace the `coverArtUrl` body:

```ts
/** Cover-art URL for a release-group MBID (250px), via the deandb-api proxy. */
export function coverArtUrl(releaseGroupMbid: string): string {
  return `/api/coverart/release-group/${releaseGroupMbid}/front-250`;
}
```

Update the header comment (lines 1-12) to say both services are now reached through the same-origin `/api` proxy (Cloud Run `deandb-api`), which enforces the 1 req/s etiquette globally and lets Cloudflare edge-cache responses; the client-side queue below remains as a belt-and-braces limiter.

- [ ] **Step 2: Typecheck + existing tests**

```bash
npm run typecheck && npm run test
```

Expected: both PASS (no signature changed).

- [ ] **Step 3: Verify live in dev**

Terminal A: `cd api && npm run dev` · Terminal B: `npm run dev`, then open `http://localhost:5173/#/__preview` and use the Editor's artist search (any artist name). Network tab: requests hit `localhost:5173/api/mb/...` and return 200.

- [ ] **Step 4: Commit**

```bash
git add src/lib/musicbrainz.ts
git commit -m "feat: route MusicBrainz + cover art through the deandb-api proxy

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Full preview smoke test against workers.dev

**Files:** none (verification gate — do not skip)

**Interfaces:**
- Consumes: Worker preview URL (Task 9).

- [ ] **Step 1: Rebuild + redeploy preview with the repointed client**

```bash
npm run build && npx wrangler deploy
```

- [ ] **Step 2 (HUMAN): Temporarily allow the preview origin in Supabase**

Kevin adds `https://deandb-web.<account>.workers.dev/` to Supabase Dashboard → Authentication → URL Configuration → Redirect URLs. (Removed in Task 14.)

- [ ] **Step 3 (HUMAN + agent): Smoke checklist on the workers.dev URL**

- [ ] Sign in with password (Kevin's account) — succeeds, dashboard renders
- [ ] TOTP MFA challenge appears and accepts a code (Kevin)
- [ ] Password-reset email arrives and its link lands back on the preview origin (Kevin)
- [ ] Feed page renders followed-users' activity
- [ ] Editor → search artist → import an album: requests hit `/api/mb/*`, tracklists load, cover art renders (from `/api/coverart/*` redirects)
- [ ] Second visit to the same artist page loads art/data noticeably faster (edge cache hit; confirm with `curl -sI` seeing `cf-cache-status: HIT` on a repeated `/api/mb` GET)

Expected: every box checked before Task 12 begins.

---

### Task 12: CI/CD workflow (replaces the Pages workflow on merge)

**Files:**
- Modify: `.github/workflows/deploy.yml` (full replacement — the old Pages workflow keeps running from `main` until the merge in Task 13)

**Interfaces:**
- Consumes: WIF provider resource name (Task 7 Step 8), Cloudflare account id + API token (Step 2, HUMAN).
- Produces: on push to `main`: path-filtered deploys — web → wrangler, api → Cloud Run.

- [ ] **Step 1: Replace `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

concurrency:
  group: deploy
  cancel-in-progress: false

jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      web: ${{ steps.filter.outputs.web }}
      api: ${{ steps.filter.outputs.api }}
    steps:
      - uses: actions/checkout@v6
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            web:
              - 'src/**'
              - 'public/**'
              - 'index.html'
              - 'worker/**'
              - 'wrangler.jsonc'
              - 'vite.config.ts'
              - 'package.json'
              - 'package-lock.json'
            api:
              - 'api/**'

  deploy-web:
    needs: changes
    if: needs.changes.outputs.web == 'true' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

  deploy-api:
    needs: changes
    if: needs.changes.outputs.api == 'true' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    env:
      IMAGE: us-central1-docker.pkg.dev/deandb-krhamby/deandb/deandb-api
    steps:
      - uses: actions/checkout@v6
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
          service_account: deandb-deployer@deandb-krhamby.iam.gserviceaccount.com
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
      - run: docker build --platform linux/amd64 -t "$IMAGE:${{ github.sha }}" api
      - run: docker push "$IMAGE:${{ github.sha }}"
      - run: >
          gcloud run deploy deandb-api
          --image "$IMAGE:${{ github.sha }}"
          --region us-central1 --project deandb-krhamby
```

(The image-only deploy inherits the SA/instances/memory/secret flags set in Task 8.)

- [ ] **Step 2 (HUMAN): Create the scoped Cloudflare token**

Kevin: Cloudflare dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template, scoped to the account holding deandb.app. Also copy the Account ID (dashboard right sidebar). Provide both via:

```bash
gh secret set CLOUDFLARE_API_TOKEN -R krhamby/DeanDB   # paste token at prompt
gh secret set CLOUDFLARE_ACCOUNT_ID -R krhamby/DeanDB  # paste account id at prompt
```

- [ ] **Step 3: Set the WIF variable**

```bash
gh variable set GCP_WIF_PROVIDER -R krhamby/DeanDB --body "<provider resource name recorded in Task 7 Step 8>"
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "infra: replace Pages workflow with Cloudflare + Cloud Run deploys (WIF)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(CI can't be exercised until this lands on `main` — that's deliberate; merge is the cutover.)

---

### Task 13: Cutover — custom domain, hardening, merge

**Files:**
- Modify: `wrangler.jsonc` (add routes)

- [ ] **Step 1: Add the custom domain to `wrangler.jsonc`** (after the `"vars"` block):

```jsonc
  "routes": [{ "pattern": "deandb.app", "custom_domain": true }]
```

- [ ] **Step 2: Deploy — this attaches deandb.app to the Worker**

```bash
npm run build && npx wrangler deploy
```

Expected: output lists `deandb.app (custom domain)`.

- [ ] **Step 3: Verify prod domain**

```bash
curl -sI https://deandb.app/ | grep -iE 'HTTP|content-security-policy'
curl -s https://deandb.app/api/health
```

Expected: `HTTP/2 200`, CSP header present, `{"ok":true}`.

- [ ] **Step 4 (HUMAN): Cloudflare zone hardening checklist** (dashboard, zone `deandb.app`):

- [ ] Security → WAF → Managed rules: **Cloudflare Free Managed Ruleset ON**
- [ ] Security → Bots: **Bot Fight Mode ON**
- [ ] Security → WAF → Rate limiting rules: path starts with `/api/`, 60 requests / 1 minute per IP → Block for 1 minute
- [ ] Rules → Redirect Rules: `www.deandb.app/*` → `https://deandb.app/$1` (301)
- [ ] SSL/TLS → Edge Certificates: **Always Use HTTPS ON**, **Minimum TLS 1.2**
- [ ] (HSTS stays header-only from the Worker for now; revisit preload later)

- [ ] **Step 5 (HUMAN): Supabase production URLs**

Dashboard → Authentication → URL Configuration: **Site URL** → `https://deandb.app`; **Redirect URLs** add `https://deandb.app/` (keep `http://localhost:5173/` and the github.io entry for the transition window).

- [ ] **Step 6: Merge to main (this activates the new CI and retires Pages deploys)**

```bash
git checkout main && git pull && git merge --no-ff infra/deandb-app-migration -m "infra: migrate to deandb.app (Cloudflare Worker + Cloud Run)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" && git push origin main
```

Expected: Deploy workflow runs; both jobs green (dispatch path makes both run on first merge).

- [ ] **Step 7: Re-run the Task 11 smoke checklist against `https://deandb.app`** (all boxes, including Kevin's auth flows).

---

### Task 14: Post-cutover — private repo, redirect stub, guards, docs

**Files:**
- Create (in a NEW repo, not this one): `index.html`, `404.html`
- Modify: `CLAUDE.md` (deploy sections), `README.md` (Pages references)

- [ ] **Step 1 (HUMAN gate): Confirm with Kevin that prod has been stable long enough to proceed** — this step removes the old public site.

- [ ] **Step 2: Rename + privatize the app repo**

```bash
gh repo rename deandb-app -R krhamby/DeanDB --yes
gh repo edit krhamby/deandb-app --visibility private --accept-visibility-change-consequences
gh api -X DELETE repos/krhamby/deandb-app/pages
git remote set-url origin https://github.com/krhamby/deandb-app.git
```

- [ ] **Step 3: Create the public redirect stub repo `krhamby/DeanDB`**

```bash
mkdir -p /tmp/deandb-stub && cd /tmp/deandb-stub && git init -b main
cat > index.html <<'EOF'
<!doctype html>
<meta charset="utf-8">
<title>DeanDB has moved</title>
<script>location.replace("https://deandb.app/" + location.hash);</script>
<meta http-equiv="refresh" content="0; url=https://deandb.app/">
<p>DeanDB has moved to <a href="https://deandb.app/">deandb.app</a>.</p>
EOF
cp index.html 404.html
git add . && git commit -m "Redirect krhamby.github.io/DeanDB to deandb.app"
gh repo create krhamby/DeanDB --public --source=. --push
gh api -X POST repos/krhamby/DeanDB/pages -f 'source[branch]=main' -f 'source[path]=/'
```

- [ ] **Step 4: Verify the redirect (Pages can take a few minutes)**

```bash
curl -s https://krhamby.github.io/DeanDB/ | grep -o 'deandb.app'
```

Expected: `deandb.app` appears; loading `https://krhamby.github.io/DeanDB/#/u/somebody` in a browser lands on `https://deandb.app/#/u/somebody`.

- [ ] **Step 5: Budget alert + Artifact Registry cleanup**

```bash
BILLING=$(gcloud billing projects describe deandb-krhamby --format='value(billingAccountName)')
gcloud billing budgets create --billing-account="${BILLING##*/}" \
  --display-name="deandb tripwire" --budget-amount=5USD \
  --threshold-rule=percent=1.0 --projects="projects/$(gcloud projects describe deandb-krhamby --format='value(projectNumber)')"
cat > /tmp/ar-cleanup.json <<'EOF'
[{"name": "keep-recent", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 5}},
 {"name": "delete-old", "action": {"type": "Delete"}, "condition": {"olderThan": "2592000s"}}]
EOF
gcloud artifacts repositories set-cleanup-policies deandb --location=us-central1 --policy=/tmp/ar-cleanup.json --no-dry-run
```

- [ ] **Step 5b: Branch protection on main** (spec hardening table; no required reviews — solo repo — but block force-pushes and deletion)

```bash
cat > /tmp/branch-protection.json <<'EOF'
{"required_status_checks": null, "enforce_admins": false,
 "required_pull_request_reviews": null, "restrictions": null,
 "allow_force_pushes": false, "allow_deletions": false}
EOF
gh api -X PUT repos/krhamby/deandb-app/branches/main/protection --input /tmp/branch-protection.json
```

Expected: JSON response echoing the protection settings.

- [ ] **Step 6 (HUMAN): Remove transition entries from Supabase** — Redirect URLs: delete the workers.dev preview entry and (after ~2 weeks of stable redirects) the github.io entry.

- [ ] **Step 7: Update docs**

In `CLAUDE.md`: rewrite the "Build & deploy" section (base is `/`, Cloudflare Worker + `wrangler.jsonc`, `api/` service on Cloud Run, deploys via `.github/workflows/deploy.yml`, redirect URLs now deandb.app) and the header line mentioning GitHub Pages. In `README.md`: replace Pages setup references with deandb.app. Also add an `api/` row to the "Project layout" table and note the dev workflow (`cd api && npm run dev` alongside `npm run dev`).

- [ ] **Step 8: Draft the user announcement** (Kevin posts it wherever users are): "DeanDB has moved to https://deandb.app — bookmarks redirect automatically, but you'll need to sign in again once. Same accounts, same data, faster imports."

- [ ] **Step 9: Commit + push docs**

```bash
git add CLAUDE.md README.md && git commit -m "docs: update deploy/runbook for deandb.app infrastructure

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" && git push origin main
```

---

## Rollback reference

- Before Task 13 Step 6 (merge): nothing user-facing changed — old Pages site untouched.
- After merge, before Task 14: detach the custom domain (remove `routes` from wrangler.jsonc, `npx wrangler deploy`) — github.io site still exists and Supabase still allows it.
- After Task 14: re-point by making `krhamby/deandb-app` public temporarily and re-enabling Pages, or fix forward — the stub repo means old links never 404 either way.

## Deferred (not in this plan)

Trello bug workstream (shelved 2026-08-12) · custom SMTP (first follow-on) · OG images · Spotify · Stripe · `aal2` RLS · HSTS preload — see the spec's Deferred section.
