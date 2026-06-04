# Sleeve — Loading Skeletons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Replace the bare "Loading…" / "Searching…" text on the data-fetching pages (Feed, Recommendations, Profile, People-search) with content-shaped **shimmer skeletons** so the app feels fast and as polished as the new cover loading. Keep the branded "DeanDB" pulse for app boot / own-journey load (it's intentional).

**Architecture:** One new file `src/components/skeletons.tsx` exporting a base `Skeleton` block (a single element whose gradient sheen sweeps via the existing `.animate-shimmer` rule — already reduced-motion gated) plus composed, page-shaped skeletons (`FeedSkeleton`, `RecommendationsSkeleton`, `PeopleSearchSkeleton`, `JourneySkeleton`). The four pages swap their loading text for the matching skeleton; the dev preview gains a "Loading skeletons" section that renders them directly (they otherwise only appear while `loading` is true, which never fires logged-out). Presentation-only; no hook/handler/API/data-shape changes.

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens · existing `.animate-shimmer` keyframe (`index.css`).

**Verification:** `npm run typecheck` + `npm run build` + `npm run test` green; visual via `#/__preview` "Loading skeletons" section in BOTH skins — blocks shimmer, shapes mirror the real cards, legible/visible on panel in Paper and Midnight.

---

## Task 1: Skeleton primitives + composed skeletons

**Files:** Create `src/components/skeletons.tsx`

- [ ] **Step 1:** Create the file with exactly this content:

```tsx
import { Panel } from "./ui";

/**
 * A single shimmering placeholder block. The sheen sweeps via the shared
 * `.animate-shimmer` rule (`index.css`), which is disabled under
 * `prefers-reduced-motion`, leaving a calm static block. Base tone is
 * `--color-edge` so blocks read on a `bg-panel` card in both skins.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-shimmer rounded-md ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(100deg, var(--color-edge) 25%, color-mix(in srgb, var(--color-fg) 12%, var(--color-edge)) 50%, var(--color-edge) 75%)",
      }}
    />
  );
}

/** Feed activity cards (mirrors the sm Cover + lines + Dean Meter row). */
export function FeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <Panel key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-24 w-24 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
        </Panel>
      ))}
    </div>
  );
}

/** Recommendation inbox cards (two lines). */
export function RecommendationsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <Panel key={i} className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-6 w-1/2" />
        </Panel>
      ))}
    </div>
  );
}

/** People-search results (avatar + name + action). */
export function PeopleSearchSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Panel key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </Panel>
      ))}
    </>
  );
}

/** A journey loading (profile header + a grid of cards). */
export function JourneySkeleton() {
  return (
    <div>
      <Panel className="mb-6 flex items-center gap-4 p-5">
        <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** `npm run typecheck && npm run build` → PASS (new file compiles; nothing imports it yet). Commit `feat(skeletons): shimmer skeleton primitives`.

---

## Task 2: Wire skeletons into the four pages

**Files:** `src/pages/Feed.tsx`, `src/pages/Recommendations.tsx`, `src/pages/Profile.tsx`, `src/pages/People.tsx`

- [ ] **Feed.tsx:** add `import { FeedSkeleton } from "../components/skeletons";`. Replace the loading branch `<p className="py-12 text-center text-fg-faint">Loading…</p>` with `<FeedSkeleton />`.
- [ ] **Recommendations.tsx:** add `import { RecommendationsSkeleton } from "../components/skeletons";`. Replace `<p className="py-12 text-center text-fg-faint">Loading…</p>` with `<RecommendationsSkeleton />`.
- [ ] **Profile.tsx:** add `import { JourneySkeleton } from "../components/skeletons";`. Replace the loading return:
  ```tsx
  if (view.loading) {
    return <div className="py-16 text-center text-fg-faint">Loading…</div>;
  }
  ```
  with
  ```tsx
  if (view.loading) {
    return <JourneySkeleton />;
  }
  ```
- [ ] **People.tsx:** add `import { PeopleSearchSkeleton } from "../components/skeletons";`. Replace `{loading && <p className="text-sm text-fg-faint">Searching…</p>}` with `{loading && <PeopleSearchSkeleton />}`. (It sits inside the existing `space-y-2 stagger-children` container — the skeleton Panels rise in like real rows; correct.)
- [ ] **Verify + commit:** `npm run typecheck && npm run build && npm run test` → PASS. `git commit -am "feat(loading): content-shaped skeletons for Feed/Recs/Profile/People"`.

---

## Task 3: Preview the skeletons

**Files:** `src/pages/Preview.tsx`

- [ ] Import `{ FeedSkeleton, RecommendationsSkeleton, PeopleSearchSkeleton, JourneySkeleton }` from `../components/skeletons`. Add a labeled section (match the harness's existing section/label markup, e.g. the `mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fg-faint` label style) titled "Loading skeletons" that renders `<JourneySkeleton />`, then `<FeedSkeleton count={2} />`, then `<RecommendationsSkeleton count={2} />`, then (inside a `space-y-2`) `<PeopleSearchSkeleton />`, so all four are visible for a screenshot pass.
- [ ] **Verify + commit:** `npm run typecheck && npm run build && npm run test` → PASS. `git commit -am "chore(dev): preview the loading skeletons"`.

---

## Task 4: QA

- [ ] Gate: `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] Code review: presentation-only; no hook/handler/API change; `Skeleton` is one element + the shared shimmer; reduced-motion safe (animation disabled by the global rule → static block); tokens (`--color-edge`/`--color-fg`) throughout; shapes mirror the real cards.
- [ ] Controller visual: screenshot the "Loading skeletons" preview section in Paper AND Midnight — blocks shimmer and are visible on the panels; the feed/rec/person shapes read as their real counterparts.

---

## Self-Review
**Coverage:** Feed/Recs/Profile/People loading states upgraded to content-shaped skeletons; branded boot loader intentionally kept; previewable. ✓
**Placeholder scan:** full code for the new file + exact one-line page swaps. ✓
**Type consistency:** all skeletons are zero-or-`count`-prop components; `Panel` imported from `./ui`; consumers import named exports from `../components/skeletons`. ✓
