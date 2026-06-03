import { useEffect } from "react";
import { useRecommendations } from "../lib/store";
import { navigate, profilePath } from "../lib/router";
import { fmtDate } from "../lib/format";
import { Panel, SectionTitle } from "../components/ui";

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
        <p className="py-12 text-center text-zinc-500">Loading…</p>
      ) : inbox.length === 0 ? (
        <Panel className="px-6 py-16 text-center text-zinc-400">
          No recommendations yet. When a friend recommends an album, it lands here. ✉
        </Panel>
      ) : (
        inbox.map((r) => (
          <Panel key={r.id} className={`p-4 ${r.readAt ? "" : "border-gold/40"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-zinc-400">
                <button onClick={() => navigate(profilePath(r.fromUsername))} className="font-semibold text-gold hover:underline">
                  {r.fromDisplayName}
                </button>{" "}
                recommends
              </span>
              <span className="text-xs text-zinc-600">{fmtDate(r.createdAt.slice(0, 10))}</span>
            </div>
            <div className="mt-1 font-display text-lg font-black text-white">
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
              <span className="ml-2 text-sm font-normal text-zinc-500">{r.artistName}</span>
            </div>
            {r.note && <p className="mt-1 text-sm text-zinc-300">“{r.note}”</p>}
          </Panel>
        ))
      )}
    </div>
  );
}
