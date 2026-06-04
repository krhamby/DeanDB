import { Medal, Star } from "lucide-react";
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

  // Ranks 1–3 get a colored medal (gold/silver/bronze — the documented brand
  // exception where color is intended); rank ≥4 stays the plain "#n" text.
  const medal = (i: number) => {
    if (i > 2) return `#${i + 1}`;
    const color = i === 0 ? "text-gold" : i === 1 ? "text-zinc-400" : "text-amber-700";
    return <Medal className={`mx-auto h-[1em] w-[1em] ${color}`} aria-label={`Rank ${i + 1}`} />;
  };

  // Gold / silver / bronze accents for the podium; subtle edge for the rest.
  const rankClass = (i: number) =>
    i === 0
      ? "border-gold/60 bg-gradient-to-r from-gold/15 to-transparent"
      : i === 1
        ? "border-zinc-400/50 bg-gradient-to-r from-zinc-400/10 to-transparent"
        : i === 2
          ? "border-amber-700/50 bg-gradient-to-r from-amber-700/10 to-transparent"
          : "border-edge/70 bg-panel/70";

  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  // #1 dominates: it spans both columns on its own row, then #2/#3 flank below.
  // On mobile everything stacks single-column with #1 first.
  const podiumSpan = (i: number) => (i === 0 ? "sm:col-span-2" : "");

  return (
    <div className="space-y-12">
      <div>
        <SectionTitle kicker="The greatest of all time (so far)" title={`${data.listener.meterName}'s Hall of Fame`} />
        {ranked.length === 0 ? (
          <p className="py-8 text-fg-faint">No rated albums yet — the Hall awaits its first inductee.</p>
        ) : (
          <div className="space-y-6">
            {/* The podium — an art-forward medal stand for the top 3. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 stagger-children">
              {podium.map((a, i) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`${basePath}/album/${a.artistId}/${a.id}`)}
                  className={`animate-pop group flex h-full flex-col items-center gap-3 rounded-3xl border p-5 text-center transition-all hover:-translate-y-1 ${rankClass(i)} ${podiumSpan(i)}`}
                >
                  <span className="font-display text-3xl font-black text-gold">{medal(i)}</span>
                  <Cover colors={a.cover} title={a.title} coverUrl={a.coverUrl} size={i === 0 ? "lg" : "md"} />
                  <div className="min-w-0 w-full">
                    <div className={`truncate font-display font-black text-fg ${i === 0 ? "text-2xl" : "text-xl"}`}>
                      {a.title}
                    </div>
                    <div className="truncate text-sm text-fg-muted">
                      {a.artistName} · {a.year}
                    </div>
                  </div>
                  <DeanMeter value={a.rating} size={i === 0 ? 84 : 64} />
                </button>
              ))}
            </div>

            {/* The rest — the existing compact ranked rows, continuing the numbering. */}
            {rest.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 font-display text-sm font-bold uppercase tracking-wide text-fg-faint">
                  The rest of the Hall
                </h3>
                <div className="space-y-2 stagger-children">
                  {rest.map((a, i) => {
                    const rank = i + 3;
                    return (
                      <button
                        key={a.id}
                        onClick={() => navigate(`${basePath}/album/${a.artistId}/${a.id}`)}
                        className={`flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 ${rankClass(rank)}`}
                      >
                        <span className="w-10 text-center font-display text-xl font-black text-gold">{medal(rank)}</span>
                        <Cover colors={a.cover} title={a.title} coverUrl={a.coverUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-display text-lg font-black text-fg">{a.title}</div>
                          <div className="text-sm text-fg-muted">
                            {a.artistName} · {a.year}
                          </div>
                        </div>
                        <DeanMeter value={a.rating} size={56} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {favTracks.length > 0 && (
        <div>
          <SectionTitle kicker="On permanent repeat" title={`${data.listener.meterName}'s Desert-Island Tracks`} />
          <div className="grid gap-2 sm:grid-cols-2">
            {favTracks.map((t, i) => (
              <Panel key={i} className="flex items-center gap-3 p-3">
                <Star className="h-5 w-5 shrink-0 fill-current text-gold" aria-hidden />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-fg">{t.track}</div>
                  <div className="truncate text-xs text-fg-faint">
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
