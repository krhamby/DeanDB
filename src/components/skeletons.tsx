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
