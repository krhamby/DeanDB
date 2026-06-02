import { flattenAlbums } from "../lib/stats";
import { navigate } from "../lib/router";
import { Cover } from "../components/cards";
import { DeanMeter, Panel, SectionTitle } from "../components/ui";
import type { DeanDBData } from "../types";

export function HallOfFame({ data, basePath = "" }: { data: DeanDBData; basePath?: string }) {
  const ranked = flattenAlbums(data)
    .filter((a) => a.rating != null)
    .sort((a, b) => (b.rating as number) - (a.rating as number));

  const favTracks = data.artists.flatMap((ar) =>
    ar.albums.flatMap((al) =>
      al.tracks
        .filter((t) => t.favorite)
        .map((t) => ({ track: t.title, album: al.title, artist: ar.name })),
    ),
  );

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`);

  return (
    <div className="space-y-12">
      <div>
        <SectionTitle kicker="The greatest of all time (so far)" title={`${data.listener.name}'s Hall of Fame`} />
        {ranked.length === 0 ? (
          <p className="py-8 text-zinc-500">No rated albums yet — the Hall awaits its first inductee.</p>
        ) : (
          <div className="space-y-2">
            {ranked.map((a, i) => (
              <button
                key={a.id}
                onClick={() => navigate(`${basePath}/album/${a.artistId}/${a.id}`)}
                className={`flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 ${
                  i < 3 ? "border-gold/40 bg-gradient-to-r from-gold/10 to-transparent" : "border-edge/70 bg-panel/70"
                }`}
              >
                <span className="w-10 text-center font-display text-xl font-black text-gold">{medal(i)}</span>
                <Cover colors={a.cover} title={a.title} coverUrl={a.coverUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-lg font-black text-white">{a.title}</div>
                  <div className="text-sm text-zinc-400">
                    {a.artistName} · {a.year}
                  </div>
                </div>
                <DeanMeter value={a.rating} size={56} />
              </button>
            ))}
          </div>
        )}
      </div>

      {favTracks.length > 0 && (
        <div>
          <SectionTitle kicker="On permanent repeat" title={`${data.listener.name}'s Desert-Island Tracks`} />
          <div className="grid gap-2 sm:grid-cols-2">
            {favTracks.map((t, i) => (
              <Panel key={i} className="flex items-center gap-3 p-3">
                <span className="text-xl">⭐</span>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{t.track}</div>
                  <div className="truncate text-xs text-zinc-500">
                    {t.artist} — {t.album}
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
