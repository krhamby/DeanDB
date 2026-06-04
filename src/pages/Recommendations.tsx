import { useEffect } from "react";
import { Mail } from "lucide-react";
import { useRecommendations } from "../lib/store";
import { navigate, profilePath } from "../lib/router";
import { fmtDate } from "../lib/format";
import { Panel, SectionTitle } from "../components/ui";
import { RecommendationsSkeleton } from "../components/skeletons";

export function Recommendations() {
  const { inbox, loading, markRead } = useRecommendations();

  // Mark everything read on view (so the nav badge clears).
  useEffect(() => {
    for (const r of inbox) if (!r.readAt) markRead(r.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox.length]);

  return (
    <div className="space-y-4">
      <SectionTitle kicker="Sent your way" title="Recommendations" />
      {loading ? (
        <RecommendationsSkeleton />
      ) : inbox.length === 0 ? (
        <Panel className="inline-flex w-full flex-wrap items-center justify-center gap-1.5 px-6 py-16 text-center text-fg-muted">
          No recommendations yet. When a friend recommends an album, it lands here.
          <Mail className="h-4 w-4" aria-hidden />
        </Panel>
      ) : (
        <div className="space-y-4 stagger-children">
        {inbox.map((r) => (
          <Panel key={r.id} className={`p-4 ${r.readAt ? "" : "border-gold/40"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-fg-muted">
                <button onClick={() => navigate(profilePath(r.fromUsername))} className="font-semibold text-gold hover:underline">
                  {r.fromDisplayName}
                </button>{" "}
                recommends
              </span>
              <span className="text-xs text-fg-faint">{fmtDate(r.createdAt.slice(0, 10))}</span>
            </div>
            <div className="mt-1 font-display text-lg font-black text-fg">
              {r.albumTitle ? (
                <button
                  onClick={() => navigate(`${profilePath(r.fromUsername)}/album/${r.artistId}/${r.albumId}`)}
                  className="hover:text-gold"
                >
                  {r.albumTitle}
                </button>
              ) : (
                <button onClick={() => navigate(`${profilePath(r.fromUsername)}/artist/${r.artistId}`)} className="hover:text-gold">
                  {r.artistName}
                </button>
              )}
              <span className="ml-2 text-sm font-normal text-fg-faint">{r.artistName}</span>
            </div>
            {r.note && <p className="mt-1 text-sm text-fg-muted">“{r.note}”</p>}
          </Panel>
        ))}
        </div>
      )}
    </div>
  );
}
