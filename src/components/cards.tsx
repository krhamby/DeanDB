import { useCallback, useEffect, useState } from "react";
import { gradient } from "../lib/format";
import { navigate } from "../lib/router";
import { useMeterName } from "../lib/store";
import type { Album, Artist } from "../types";
import { artistProgress } from "../lib/stats";
import { DeanMeter, LoggedBadge, ProgressBar, Score10, StatusBadge } from "./ui";

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
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? 220 : size === "sm" ? 96 : size === "xs" ? 44 : 150;
  const [imgState, setImgState] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => setImgState("loading"), [coverUrl]);
  // Cached images (the common case once the cover service-worker cache is warm)
  // can finish loading before React attaches onLoad, which would otherwise strand
  // them at opacity-0. A callback ref catches the already-complete case on mount.
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setImgState(node.naturalWidth > 0 ? "loaded" : "error");
  }, []);

  // Real art fades in over the album's own gradient. While it loads, a shimmer
  // sweep plays over the gradient as a tasteful placeholder; on error the gradient
  // simply shows through. (.animate-shimmer + .rm-no-transition are reduced-motion gated.)
  const imgClass =
    `rm-no-transition h-full w-full object-cover transition-opacity duration-500 ${
      imgState === "loaded" ? "opacity-100" : "opacity-0"
    }`;
  const shimmer =
    coverUrl && imgState === "loading" ? (
      <div
        aria-hidden
        className="animate-shimmer pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.22) 50%, transparent 60%)",
        }}
      />
    ) : null;

  // Compact thumbnail (e.g. an editor row): real art when present, else a clean
  // gradient swatch. The vinyl + title overlay would be illegible this small.
  if (size === "xs") {
    return (
      <div
        className="relative shrink-0 overflow-hidden rounded-md shadow"
        style={{ background: gradient(colors), width: dim, height: dim }}
      >
        {coverUrl && (
          <img
            ref={imgRef}
            src={coverUrl}
            alt={title}
            loading="lazy"
            onLoad={() => setImgState("loaded")}
            onError={() => setImgState("error")}
            className={imgClass}
          />
        )}
        {shimmer}
      </div>
    );
  }

  // Real cover art (e.g. Cover Art Archive) when we have it — no CORS needed
  // for <img> display. The gradient stays as the backdrop while it loads.
  if (coverUrl) {
    return (
      <div
        className="relative overflow-hidden rounded-xl shadow-lg"
        style={{ background: gradient(colors), width: dim, height: dim }}
      >
        <img
          ref={imgRef}
          src={coverUrl}
          alt={title}
          loading="lazy"
          onLoad={() => setImgState("loaded")}
          onError={() => setImgState("error")}
          className={imgClass}
        />
        {shimmer}
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
  basePath = "",
}: {
  album: Album;
  artistId: string;
  /** Route prefix for links, e.g. "/u/dean" when viewing someone's journey. */
  basePath?: string;
}) {
  const meterName = useMeterName();
  return (
    <button
      onClick={() => navigate(`${basePath}/album/${artistId}/${album.id}`)}
      className={`group flex flex-col gap-2 text-left transition-transform hover:-translate-y-1 active:scale-[0.98] ${
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
          <span className="absolute left-2 top-2 text-lg drop-shadow" title={`${meterName}'s favorite`}>
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
          <span className="truncate text-sm font-semibold text-fg">{album.title}</span>
          <span className="shrink-0 text-xs text-fg-faint">{album.year ?? ""}</span>
        </div>
        <div className="mt-1">
          <StatusBadge status={album.status} />
        </div>
      </div>
    </button>
  );
}

export function ArtistCard({ artist, basePath = "" }: { artist: Artist; basePath?: string }) {
  const pct = artistProgress(artist) * 100;
  const tracked = artist.albums.filter((a) => !a.excluded);
  const completed = tracked.filter((a) => a.status === "completed").length;
  return (
    <button
      onClick={() => navigate(`${basePath}/artist/${artist.id}`)}
      className="group flex w-full items-center gap-4 rounded-2xl border border-edge/70 bg-panel/70 p-4 text-left transition-all hover:border-gold/40 hover:bg-panel-2 active:scale-[0.99]"
    >
      <div
        className="grid h-16 w-16 shrink-0 place-items-center rounded-full font-display text-2xl font-black text-white shadow-inner"
        style={{ background: gradient(artist.color) }}
      >
        {artist.name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-lg font-black text-fg">{artist.name}</span>
            {artist.logged && <LoggedBadge />}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {artist.verdict != null && (
              <span title="Overall artist verdict">
                <Score10 value={artist.verdict} />
              </span>
            )}
            <span className="text-xs font-semibold text-gold">{Math.round(pct)}%</span>
          </span>
        </div>
        <div className="mb-2 text-xs text-fg-faint">
          {artist.genre} · {completed}/{tracked.length} albums
        </div>
        <ProgressBar pct={pct} />
      </div>
    </button>
  );
}
