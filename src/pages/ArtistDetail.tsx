import { artistProgress, songStats } from "../lib/stats";
import { fmtScore, gradient } from "../lib/format";
import { navigate, profilePath } from "../lib/router";
import { useThemeControl } from "../lib/store";
import { legible, pickOnAccent } from "../lib/themes";
import { AlbumCard } from "../components/cards";
import { Avatar } from "../components/social";
import { DeanMeter, LoggedBadge, Panel, ProgressBar, scoreColor } from "../components/ui";
import type { DeanDBData } from "../types";

export function ArtistDetail({
  data,
  artistId,
  basePath = "",
}: {
  data: DeanDBData;
  artistId: string;
  basePath?: string;
}) {
  const { surface } = useThemeControl();
  const artist = data.artists.find((a) => a.id === artistId);

  if (!artist) {
    return (
      <div className="py-16 text-center">
        <p className="text-fg-muted">Artist not found.</p>
        <button onClick={() => navigate(`${basePath}/artists`)} className="mt-4 text-gold hover:underline">
          ← Back to artists
        </button>
      </div>
    );
  }

  const artistAccent = legible(artist.color[0], surface);
  const tracked = artist.albums.filter((a) => !a.excluded);
  const completed = tracked.filter((a) => a.status === "completed").length;
  const pct = artistProgress(artist) * 100;
  const order = { listening: 0, want: 1, completed: 2 } as const;
  const albums = [...artist.albums].sort((a, b) => order[a.status] - order[b.status]);
  // Artist-scope song average — same exclusion rule as all stats (excluded
  // albums out), and secondary to the artist verdict.
  const songs = songStats(tracked.flatMap((a) => a.tracks));

  return (
    <div
      style={{
        ["--color-gold" as string]: artistAccent,
        ["--color-gold-soft" as string]: artistAccent,
        ["--color-on-accent" as string]: pickOnAccent(artistAccent),
      }}
    >
      <button onClick={() => navigate(`${basePath}/artists`)} className="mb-4 text-sm text-fg-faint hover:text-gold">
        ← All artists
      </button>

      <div
        className="relative overflow-hidden rounded-3xl p-8"
        style={{ background: gradient(artist.color) }}
      >
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/80">
            <span>{artist.genre} · {artist.country}</span>
            {artist.logged && <LoggedBadge onMedia />}
          </div>
          <h1 className="font-display text-5xl font-black tracking-tight text-white drop-shadow">
            {artist.name}
          </h1>
          <p className="mt-2 max-w-2xl text-white/85">{artist.bio}</p>
          {artist.recommendedBy && (
            <div className="mt-3 flex items-center gap-2 text-sm text-white/85">
              <span className="text-white/60">Recommended by</span>
              {artist.recommendedBy.username ? (
                <button
                  onClick={() => navigate(profilePath(artist.recommendedBy!.username!))}
                  className="inline-flex items-center gap-1.5 font-semibold text-white hover:underline"
                >
                  <Avatar
                    profile={{
                      username: artist.recommendedBy.username,
                      displayName: artist.recommendedBy.displayName ?? artist.recommendedBy.username,
                      avatarUrl: artist.recommendedBy.avatarUrl,
                    }}
                    size={20}
                  />
                  @{artist.recommendedBy.username}
                </button>
              ) : (
                <span className="font-semibold text-white">{artist.recommendedBy.text}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <Panel className="-mt-6 mx-2 flex items-center gap-6 p-5">
        <div>
          <div className="font-display text-3xl font-black text-gold">{Math.round(pct)}%</div>
          <div className="text-xs text-fg-faint">discography</div>
        </div>
        <div className="flex-1">
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-fg-muted">
              {completed} of {tracked.length} albums completed
            </span>
            <span className="text-fg-faint">{tracked.length} tracked</span>
          </div>
          <ProgressBar pct={pct} className="h-2.5" />
        </div>
        {songs.rated > 0 && (
          <div className="hidden flex-col items-center gap-1 border-l border-edge/60 pl-6 sm:flex">
            <div
              className="font-display text-3xl font-black tabular-nums"
              style={{ color: scoreColor(songs.avg, surface) }}
            >
              {fmtScore(songs.avg as number)}
            </div>
            <div className="text-xs text-fg-faint">song avg · {songs.rated} rated</div>
          </div>
        )}
        {artist.verdict != null && (
          <div className="flex flex-col items-center gap-1 border-l border-edge/60 pl-6">
            <DeanMeter value={artist.verdict} size={52} />
            <div className="text-xs text-fg-faint">verdict</div>
          </div>
        )}
      </Panel>

      {artist.verdict != null && artist.verdictNote && (
        <p className="mx-2 mt-3 text-sm italic text-fg-muted">“{artist.verdictNote}”</p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 stagger-children">
        {albums.map((al) => (
          <AlbumCard key={al.id} album={al} artistId={artist.id} basePath={basePath} />
        ))}
      </div>
    </div>
  );
}
