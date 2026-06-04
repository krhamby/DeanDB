import { useFeed, useMyJourney } from "../lib/store";
import { navigate, profilePath } from "../lib/router";
import { fmtDate } from "../lib/format";
import { ACHIEVEMENT_CATALOG, shouldMaskSecret } from "../lib/achievements";
import { Cover } from "../components/cards";
import { DeanMeter, LoggedBadge, Panel, SectionTitle, StatusBadge } from "../components/ui";
import { FeedSkeleton } from "../components/skeletons";
import type { AlbumFeedItem } from "../types";

/** How to phrase the activity, e.g. "logged an old favorite" vs "rated". */
function feedVerb(it: AlbumFeedItem): string {
  if (it.logged) return "logged an old favorite";
  if (it.status === "listening") return "is now spinning";
  if (it.rating != null) return "rated";
  return "added";
}

export function Feed() {
  const { items, loading } = useFeed();
  // Secret-achievement masking is keyed on the VIEWER's own unlocks, so a secret
  // someone you follow earned stays masked until you've unlocked it too.
  const { myUnlockedAchievementIds } = useMyJourney();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <SectionTitle kicker="From people you follow" title="Activity Feed" />
      {loading ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
        <Panel className="px-6 py-16 text-center text-fg-muted">
          Your feed is quiet. Find friends on{" "}
          <button onClick={() => navigate("/people")} className="text-gold hover:underline">
            People
          </button>{" "}
          and follow them to see their listening here.
        </Panel>
      ) : (
        <div className="space-y-4 stagger-children">
        {items.map((it) => {
          if (it.kind === "achievement") {
            const meta = ACHIEVEMENT_CATALOG[it.achievementId];
            if (!meta) return null; // unknown/retired id — skip
            // Masked unless the VIEWER has unlocked this secret themselves (global
            // rule). Reveals everywhere once you've earned it; teases until then.
            const masked = shouldMaskSecret(meta, myUnlockedAchievementIds.has(it.achievementId));
            return (
              <Panel key={it.achievementRowId} className="flex items-center gap-3 p-3 sm:gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-panel-2 text-3xl sm:h-16 sm:w-16">
                  {masked ? "❓" : meta.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-fg-faint">
                    <button
                      onClick={() => navigate(profilePath(it.username))}
                      className="font-semibold text-gold hover:underline"
                    >
                      {it.displayName}
                    </button>{" "}
                    unlocked an achievement
                  </div>
                  <div className="mt-0.5 font-display text-base font-black leading-tight text-fg sm:text-lg">
                    {masked ? "Secret Achievement" : meta.title}
                    {meta.hidden && !masked && (
                      <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide text-gold">
                        ★ secret
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-fg-muted">
                    {masked ? "Keep listening to reveal this one…" : meta.desc}
                    {" · "}
                    {fmtDate(it.unlockedAt.slice(0, 10))}
                  </div>
                </div>
              </Panel>
            );
          }
          return (
            <Panel key={it.userAlbumId} className="flex items-center gap-3 p-3 transition hover:border-gold/30">
              <div className="shrink-0">
                <Cover colors={it.cover} title={it.albumTitle} coverUrl={it.coverUrl ?? undefined} size="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-fg-faint">
                  <button
                    onClick={() => navigate(profilePath(it.username))}
                    className="font-semibold text-gold hover:underline"
                  >
                    {it.displayName}
                  </button>{" "}
                  {feedVerb(it)}
                </div>
                <button
                  onClick={() => navigate(`${profilePath(it.username)}/album/${it.artistId}/${it.albumId}`)}
                  className="block text-left font-display text-base font-black leading-tight text-fg line-clamp-2 hover:text-gold sm:text-lg"
                >
                  {it.albumTitle}
                  {it.favorite && <span title="Favorite" className="ml-1">⭐</span>}
                </button>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
                  {it.logged ? <LoggedBadge /> : <StatusBadge status={it.status} />}
                  <span className="min-w-0 truncate">
                    {it.artistName} · {fmtDate(it.updatedAt.slice(0, 10))}
                  </span>
                </div>
                {it.review && <p className="mt-1 line-clamp-2 text-sm text-fg-faint">“{it.review}”</p>}
              </div>
              {/* Rating sits at the card's right edge, vertically centered — the
                  narrow max-w-2xl column keeps it close to the content (no big gap). */}
              {it.rating != null && <DeanMeter value={it.rating} size={48} name={it.displayName} />}
            </Panel>
          );
        })}
        </div>
      )}
    </div>
  );
}
