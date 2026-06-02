import { useFeed } from "../lib/store";
import { navigate } from "../lib/router";
import { fmtDate } from "../lib/format";
import { Cover } from "../components/cards";
import { DeanMeter, LoggedBadge, Panel, SectionTitle, StatusBadge } from "../components/ui";
import type { FeedItem } from "../types";

/** How to phrase the activity, e.g. "logged an old favorite" vs "rated". */
function feedVerb(it: FeedItem): string {
  if (it.logged) return "logged an old favorite";
  if (it.status === "listening") return "is now spinning";
  if (it.rating != null) return "rated";
  return "added";
}

export function Feed() {
  const { items, loading } = useFeed();

  return (
    <div className="space-y-4">
      <SectionTitle kicker="From people you follow" title="Activity Feed" />
      {loading ? (
        <p className="py-12 text-center text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <Panel className="px-6 py-16 text-center text-zinc-400">
          Your feed is quiet. Find friends on{" "}
          <button onClick={() => navigate("/people")} className="text-gold hover:underline">
            People
          </button>{" "}
          and follow them to see their listening here.
        </Panel>
      ) : (
        items.map((it) => (
          <Panel key={it.userAlbumId} className="flex items-center gap-4 p-3">
            <Cover colors={it.cover} title={it.albumTitle} coverUrl={it.coverUrl ?? undefined} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-zinc-500">
                <button
                  onClick={() => navigate(`/u/${it.username}`)}
                  className="font-semibold text-gold hover:underline"
                >
                  {it.displayName}
                </button>{" "}
                {feedVerb(it)}
              </div>
              <div className="flex items-center gap-2">
                {it.logged ? <LoggedBadge /> : <StatusBadge status={it.status} />}
                <button
                  onClick={() => navigate(`/u/${it.username}/album/${it.artistId}/${it.albumId}`)}
                  className="truncate font-display text-lg font-black text-white hover:text-gold"
                >
                  {it.albumTitle}
                </button>
                {it.favorite && <span title="Favorite">⭐</span>}
              </div>
              <div className="truncate text-sm text-zinc-400">
                {it.artistName} · {fmtDate(it.updatedAt.slice(0, 10))}
              </div>
              {it.review && <p className="mt-1 line-clamp-2 text-sm text-zinc-500">“{it.review}”</p>}
            </div>
            {it.rating != null && <DeanMeter value={it.rating} size={52} />}
          </Panel>
        ))
      )}
    </div>
  );
}
