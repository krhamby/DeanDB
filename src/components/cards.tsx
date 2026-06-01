import { gradient } from "../lib/format";
import { navigate } from "../lib/router";
import type { Album, Artist } from "../types";
import { artistProgress } from "../lib/stats";
import { DeanMeter, ProgressBar, StatusBadge } from "./ui";

// Generated "cover art" — a vinyl-on-poster look built from each album's
// signature gradient. No external images needed; every cover is unique.
export function Cover({
  colors,
  title,
  coverUrl,
  size = "md",
}: {
  colors: [string, string];
  title: string;
  coverUrl?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? 220 : size === "sm" ? 96 : 150;

  // Real cover art (e.g. Cover Art Archive) when we have it — no CORS needed
  // for <img> display. The gradient stays as the backdrop while it loads.
  if (coverUrl) {
    return (
      <div
        className="relative overflow-hidden rounded-xl shadow-lg"
        style={{ background: gradient(colors), width: dim, height: dim }}
      >
        <img
          src={coverUrl}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            // If the art 404s, hide the <img> and let the gradient show through.
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="relative grid place-items-center overflow-hidden rounded-xl shadow-lg"
      style={{ background: gradient(colors), width: dim, height: dim }}
    >
      {/* vinyl disc */}
      <div
        className="absolute right-[-22%] grid place-items-center rounded-full opacity-90"
        style={{
          width: dim * 0.78,
          height: dim * 0.78,
          background: "radial-gradient(circle, #1a1a1a 38%, #0c0c0c 39%, #1a1a1a 40%, #0c0c0c 60%)",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06)",
        }}
      >
        <div className="rounded-full" style={{ width: dim * 0.2, height: dim * 0.2, background: gradient(colors, 90) }} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-white/10" />
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <div className="font-display text-sm font-black uppercase leading-tight tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          {title}
        </div>
      </div>
    </div>
  );
}

export function AlbumCard({
  album,
  artistId,
}: {
  album: Album;
  artistId: string;
}) {
  return (
    <button
      onClick={() => navigate(`/album/${artistId}/${album.id}`)}
      className={`group flex flex-col gap-2 text-left transition-transform hover:-translate-y-1 ${
        album.excluded ? "opacity-45" : ""
      }`}
    >
      <div className="relative">
        <Cover colors={album.cover} title={album.title} coverUrl={album.coverUrl} />
        {album.excluded && (
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-black/70 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-dean">
            🚫 Excluded
          </span>
        )}
        {album.favorite && (
          <span className="absolute left-2 top-2 text-lg drop-shadow" title="Dean's favorite">
            ⭐
          </span>
        )}
        {album.rating != null && (
          <div className="absolute right-2 top-2 rounded-lg bg-black/70 p-0.5 backdrop-blur">
            <DeanMeter value={album.rating} size={40} />
          </div>
        )}
      </div>
      <div className="px-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-white">{album.title}</span>
          <span className="shrink-0 text-xs text-zinc-500">{album.year ?? ""}</span>
        </div>
        <div className="mt-1">
          <StatusBadge status={album.status} />
        </div>
      </div>
    </button>
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  const pct = artistProgress(artist) * 100;
  const completed = artist.albums.filter((a) => a.status === "completed").length;
  return (
    <button
      onClick={() => navigate(`/artist/${artist.id}`)}
      className="group flex w-full items-center gap-4 rounded-2xl border border-edge/70 bg-panel/70 p-4 text-left transition-all hover:border-gold/40 hover:bg-panel-2"
    >
      <div
        className="grid h-16 w-16 shrink-0 place-items-center rounded-full font-display text-2xl font-black text-white shadow-inner"
        style={{ background: gradient(artist.color) }}
      >
        {artist.name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-display text-lg font-black text-white">{artist.name}</span>
          <span className="shrink-0 text-xs font-semibold text-gold">{Math.round(pct)}%</span>
        </div>
        <div className="mb-2 text-xs text-zinc-500">
          {artist.genre} · {completed}/{artist.catalogSize} albums
        </div>
        <ProgressBar pct={pct} />
      </div>
    </button>
  );
}
