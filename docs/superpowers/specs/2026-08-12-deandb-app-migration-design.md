# deandb.app migration — design

**Date:** 2026-08-12 · **Status:** awaiting user review
**Goal:** Move DeanDB from GitHub Pages (`krhamby.github.io/DeanDB/`) to the `deandb.app` domain on hardened, ~$0/month infrastructure, take the repo private, and stand up a proper backend on GCP with one proving feature (the MusicBrainz proxy).

## Context & requirements

DeanDB is a client-only React/Vite SPA backed entirely by Supabase (Postgres + Auth + RLS + RPCs), deployed as static files by GitHub Actions. The user purchased `deandb.app` at Cloudflare (registrar + DNS). Requirements gathered during brainstorming:

- **Hardening:** edge protection (WAF/DDoS/bots), security headers + TLS control, untangle prod serving from the public GitHub origin, observability/access logs.
- **Repo goes private**; GitHub stays as source control + CI.
- **Old URL redirects** to the new domain (bookmarks, shared profile links, in-flight auth emails).
- **"Improved," not just hardened:** a real backend home on GCP for secret-holding integrations (Spotify, eventually Stripe), a MusicBrainz proxy + cache, and OG share images — the proxy ships in this project; the rest are fast-follows.
- **Low cost** is a hard constraint (target: free tiers only).
- Supabase stays exactly where it is (it *is* the backend datastore/auth; moving it would add cost for no benefit).

**Chosen approach (A):** Cloudflare serves and shields the frontend on `deandb.app`; a small GCP Cloud Run service is the backend at `deandb.app/api/*`; Supabase unchanged.
Rejected: **B — all-GCP** (real WAF needs an ~$18/mo load balancer + Cloud Armor; worse hardening per dollar), **C — all-Cloudflare Workers** (cheapest, but not the GCP backend the user wants to build on).

## Architecture

```
                    ┌─ Cloudflare (deandb.app) ─────────────┐
Browser ──────────► │ Worker: static SPA assets (dist/)     │
                    │         + security headers            │
                    │         + /api/* reverse proxy ─────► │ ──► Cloud Run "deandb-api"
                    │ WAF · DDoS · bot filter · rate limit  │      (GCP, scales to zero)
                    └───────────────────────────────────────┘
Browser ──────────────────────────────────────────────────────► Supabase (unchanged)
krhamby.github.io/DeanDB/* ──► public stub repo ──► redirect to deandb.app (hash preserved)
```

Decisions and why:

- **API under `deandb.app/api/*`, not `api.deandb.app`.** Same-origin (no CORS), one host under WAF/rate-limit rules, and it avoids Cloud Run custom-domain mapping entirely — Cloud Run keeps its `*.run.app` URL with Google-managed TLS; only the Worker knows it.
- **Browser keeps talking to Supabase directly.** RLS is the security boundary by design; nothing changes in auth or journey data flow.
- **Separate GCP project `deandb`** under the existing billing account (not shared with Raise the Bahr): clean IAM, clean cost attribution, no cross-project blast radius.

## Components

### 1. Cloudflare Worker (`deandb-web`)

- Workers static assets (current-generation platform; Pages is in maintenance mode). `wrangler.jsonc` at repo root: `assets.directory = "./dist"`, SPA fallback (`not_found_handling: "single-page-application"`), `run_worker_first: ["/api/*"]`.
- Worker script responsibilities, in order: (1) proxy `/api/*` to the Cloud Run URL, attaching the `X-Edge-Key` shared-secret header; (2) serve static assets; (3) attach security headers to every response:
  - `Strict-Transport-Security: max-age=31536000` (preload deferred until stable)
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https://ixpxefsjrswujuxmnwkk.supabase.co; font-src 'self'; frame-ancestors 'none'; base-uri 'self'`
    - `script-src 'self'` works because Vite emits hashed bundles, no inline scripts.
    - `img-src https:` stays broad: Cover Art Archive redirects to arbitrary archive.org hosts and avatars are arbitrary URLs.
    - `connect-src` excludes musicbrainz.org/coverartarchive.org once the client points at `/api` (this is a hardening *win* of the proxy).
    - `style-src 'unsafe-inline'` is required by inline style attributes (React) — acceptable.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Custom domain: `deandb.app` attached to the Worker; `www.deandb.app` → single Cloudflare redirect rule to apex.

### 2. Cloud Run service (`deandb-api`)

- Node 22 + **Hono**, TypeScript, in a new top-level **`api/`** package (own `package.json`, `Dockerfile`); `min-instances: 0`, `max-instances: 2` (cost guard), 512 MB, region `us-central1`.
- Endpoints:
  - `GET /api/health` — plain 200 for smoke tests.
  - `GET /api/mb/*` — forwards to `https://musicbrainz.org/ws/2/*` through a **global 1 req/s serial queue** with retry/backoff (worst case at max-instances 2: ~2 req/s against MusicBrainz — still polite; single-instance queueing covers the realistic case), proper `User-Agent` identifying DeanDB.
  - `GET /api/coverart/*` — forwards to `https://coverartarchive.org/*` (no rate limit needed).
- Middleware: reject any request missing the correct `X-Edge-Key` header with 403 (prevents WAF bypass via the `run.app` URL). The secret lives in GCP Secret Manager (mounted as env var) and as a Worker secret.
- **Caching:** responses carry `Cache-Control: public, s-maxage=86400` (MB metadata; discographies are stable) so **Cloudflare's edge cache absorbs repeat lookups** — most hits never reach Cloud Run. Plus a small in-memory LRU per instance. No Redis, no database (YAGNI).
- Error handling: upstream MB failure → 502 with a JSON error body; the client's existing error surfaces show it. The client keeps its serial request queue, so degradation matches today's behavior.

### 3. Frontend changes

- `vite.config.ts`: `base: "/"` unconditionally — the `/DeanDB/` subpath logic is deleted. `authRedirectTo()` is `BASE_URL`-relative (per CLAUDE.md) and follows automatically.
- `src/lib/musicbrainz.ts`: base URLs become `/api/mb` and `/api/coverart`. The client-side 1 req/s limiter **stays** initially (harmless; can be relaxed later once the proxy is proven).
- No other data-flow changes; `DeanDBData`, `api.ts`, RLS untouched.

### 4. Redirect stub

The old URL is path-locked to the repo name, so:

1. Rename the private repo `DeanDB` → **`deandb-app`** (GitHub auto-redirects git remotes and PR links).
2. Create a new tiny **public** repo named **`DeanDB`** serving GitHub Pages at `krhamby.github.io/DeanDB/`: `index.html` + `404.html`, both containing `<script>location.replace("https://deandb.app/" + location.hash)</script>` + a meta-refresh + a visible link as fallback.
3. Hash routing means deep links (`#/u/kevin`) and **in-flight password-recovery links (tokens ride in the hash)** survive the redirect.

## Hardening configuration

| Surface | Config |
|---|---|
| Cloudflare (free plan) | Proxied DNS only (origins never exposed); free managed WAF ruleset ON; Bot Fight Mode ON; 1 rate-limiting rule on `/api/*` (60 req/min/IP); Always Use HTTPS; TLS ≥ 1.2; HSTS after cutover confidence; 5 custom-rule slots held in reserve |
| GitHub | Repo private; branch protection on `main`; **Workload Identity Federation** for GCP deploys (OIDC → short-lived creds; zero stored GCP keys); Cloudflare API token scoped to Workers-deploy only |
| GCP | Dedicated project; deploy SA limited to `run.developer` + `artifactregistry.writer` + `iam.serviceAccountUser` on the runtime SA; runtime SA has no roles beyond Secret Manager access to its one secret |
| Cloud Run | `X-Edge-Key` check; max-instances 2; no unauthenticated admin surface (only `/api/*` routes exist) |
| Supabase | Redirect-URL allow-list: add `https://deandb.app/`, keep `http://localhost:5173/`, keep github.io entry during transition then remove; Site URL → `https://deandb.app` |

Out of scope, recorded for later decision: `aal2` RLS predicate enforcement for MFA (flagged in CLAUDE.md), custom SMTP sender on @deandb.app, HSTS preload.

## Deploy pipeline & observability

- One workflow on push to `main`, path-filtered:
  - Frontend paths → `npm ci && npm run build` → `wrangler deploy` (cloudflare/wrangler-action, scoped token in GitHub secrets).
  - `api/**` → docker build → push to Artifact Registry → `gcloud run deploy` (auth via `google-github-actions/auth` WIF).
- The old `deploy.yml` (Pages) is deleted at cutover, not before.
- Supabase migrations keep flowing through the existing GitHub integration (works on private repos).
- Observability: Cloudflare analytics (traffic/threats/cache hit rate); Cloud Run logs + metrics; **GCP budget alert at $5/month** as a misconfiguration tripwire; Artifact Registry cleanup policy (keep last ~5 images).

## Testing

- Existing gates: `npm run typecheck` / `npm run build` stay the primary gate; existing Vitest suite unaffected.
- New: Vitest unit tests for the API's queue/cache/backoff logic (pure functions); a `#/__preview`-independent smoke checklist for cutover (below).
- Worker headers verified with `curl -I` against the preview URL before DNS attach.

## Cutover sequence (each step reversible)

1. Land all code on `infra/deandb-app-migration` (this branch): vite base, Worker, `api/`, workflow. Old Pages deploy keeps serving throughout.
2. Create GCP project `deandb`, WIF plumbing, Artifact Registry; deploy the API once manually; smoke-test `/api/health` + one MB lookup on the `run.app` URL.
3. Deploy the Worker to its `workers.dev` preview; **temporarily add the preview URL to Supabase's redirect allow-list** (removed after cutover), then full smoke test (sign-in, password reset, MFA, feed, Editor import through the proxy).
4. Attach `deandb.app` to the Worker; add the Supabase redirect URL; merge to `main`.
5. Re-verify the same smoke list on `https://deandb.app`.
6. Only then: rename repo → private; create the public `DeanDB` redirect stub; delete the Pages workflow; announce re-login to users (sessions are origin-bound localStorage — everyone signs in once on the new origin).
7. **Rollback:** before step 6 the old site still exists and DNS detach is instant; after step 6, the stub can be flipped back to a full Pages deploy if disaster strikes. Supabase keeps both origins in its allow-list until the transition window closes.

## Costs

Steady state **$0/month + ~$14/yr domain renewal**: Cloudflare free plan; Workers free tier (static assets unmetered, `/api` invocations ≪ 100k/day); Cloud Run / Artifact Registry / Secret Manager free tiers; GitHub free private repo (2,000 Actions min/mo). Budget alert at $5 as backstop.

## Portability posture

Decided 2026-08-12 after weighing alternatives (Firestore, MySQL, self-run Postgres): **stay on Supabase**; it wins on cost, relational fit, exit cost (plain Postgres), and ops burden. To keep the exit cheap:

- Migrations stay **plain SQL** in-repo (already true) — no dashboard-only schema changes.
- **New server logic goes to Cloud Run**, not Supabase edge functions; the existing `suggest-artists` function migrates to the API service when convenient. The API layer is the strangler-fig seam if we ever leave.
- No Supabase-only features (Realtime, Storage) without an explicit decision recorded here.
- **Monthly `pg_dump` + restore test** — this doubles as the backup strategy, since the free tier has no automated backups.
- Known free-tier fine print: projects auto-pause after ~1 week of inactivity; active users prevent this, but a dormant app needs a manual dashboard restore.

## Deferred / follow-on work (separate specs)

1. **Bug-fix workstream** — shelved by user 2026-08-12 pending Trello board access (board `6a2066d3db37ef390e8a0f51` is joined via a personal Trello account the connected plugin can't see). Structure: each card an isolated fix in a parallel worktree, converging before cutover. Pre-req to fold in: unmerged branch `fix/dashboard-summit-mountain`.
2. **Custom SMTP for auth email** — *first follow-on to schedule*: Supabase's built-in mailer is rate-limited to a handful of messages/hour (test-grade only); wire an external provider (e.g. Resend free tier) sending from `@deandb.app`.
3. **OG share images** on the API service.
4. **Spotify integration** (secrets now have a home in Secret Manager).
5. Stripe, `aal2` RLS enforcement, HSTS preload — each its own decision.
