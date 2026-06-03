import { useEffect, useRef, useState } from "react";
import { fmtDate, fmtMinutes, gradient } from "../lib/format";
import { navigate } from "../lib/router";
import { useAuth, useThemeControl } from "../lib/store";
import { legible, pickOnAccent } from "../lib/themes";
import * as api from "../lib/api";
import { fetchTracklist, findAlbumCover } from "../lib/musicbrainz";
import { Cover } from "../components/cards";
import { DeanMeter, Panel, StatusBadge, Score10 } from "../components/ui";
import { RecommendModal } from "../components/social";
import { VerdictCard } from "../components/ShareCard";
import { toPng } from "html-to-image";
import type { AlbumAggregate, AlbumStatus, DeanDBData } from "../types";

export function AlbumDetail({
  data,
  artistId,
  albumId,
  canEdit = false,
  basePath = "",
  setAlbum,
  setTrack,
}: {
  data: DeanDBData;
  artistId: string;
  albumId: string;
  canEdit?: boolean;
  basePath?: string;
  setAlbum?: (albumId: string, patch: api.UserAlbumPatch) => void;
  setTrack?: (albumId: string, trackId: string, patch: { rating?: number | null; favorite?: boolean }) => void;
}) {
  const { user } = useAuth();
  const { surface } = useThemeControl();
  const [editing, setEditing] = useState(false);
  const [agg, setAgg] = useState<AlbumAggregate | null>(null);
  const [recommending, setRecommending] = useState(false);
  // Locally reflect a runtime just fetched via the "Load runtime" affordance. The
  // write goes to the SHARED catalog (api.setCatalogAlbumRuntime), so it's durable
  // for every viewer; this state only makes it appear instantly on this page,
  // which doesn't own the journey data.
  const [runtimeOverride, setRuntimeOverride] = useState<number | null>(null);
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  // Must be declared before any early return to satisfy Rules of Hooks.
  const cardRef = useRef<HTMLDivElement>(null);

  const artist = data.artists.find((a) => a.id === artistId);
  const album = artist?.albums.find((a) => a.id === albumId);

  useEffect(() => {
    if (album) api.albumAggregate(album.id).then(setAgg).catch(() => setAgg(null));
  }, [album?.id]);

  // Reset any local override when navigating between albums.
  useEffect(() => {
    setRuntimeOverride(null);
  }, [album?.id]);

  // Fetch a real runtime from MusicBrainz and persist it to the shared catalog so
  // it shows for the owner and every viewer (and stops blocking the 90-min award).
  const loadRuntime = async () => {
    if (!artist || !album) return;
    setLoadingRuntime(true);
    try {
      const mbid = album.mbid ?? (await findAlbumCover(artist.name, album.title))?.mbid ?? null;
      if (!mbid) return;
      const tl = await fetchTracklist(mbid);
      if (tl.runtimeMin > 0) {
        await api.setCatalogAlbumRuntime(album.id, tl.runtimeMin);
        setRuntimeOverride(tl.runtimeMin);
      }
    } catch {
      /* leave as "runtime not loaded" */
    } finally {
      setLoadingRuntime(false);
    }
  };

  if (!artist || !album) {
    return (
      <div className="py-16 text-center">
        <p className="text-fg-muted">Album not found.</p>
        <button onClick={() => navigate(basePath || "/")} className="mt-4 text-gold hover:underline">
          ← Back
        </button>
      </div>
    );
  }

  const downloadCard = async () => {
    if (!cardRef.current) return;
    const url = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
    const a = document.createElement("a");
    a.href = url;
    const safe = (s: string) => s.replace(/[/\\]+/g, "-");
    a.download = `${safe(artist?.name ?? "album")} - ${safe(album?.title ?? "verdict")} — DeanDB.png`;
    a.click();
  };

  const albumAccent = legible(album.cover[0], surface);

  const patchAlbum = (patch: api.UserAlbumPatch) => setAlbum?.(album.id, patch);
  const patchTrack = (trackId: string, patch: { rating?: number | null; favorite?: boolean }) =>
    setTrack?.(album.id, trackId, patch);

  return (
    <div
      style={{
        ["--color-gold" as string]: albumAccent,
        ["--color-gold-soft" as string]: albumAccent,
        ["--color-on-accent" as string]: pickOnAccent(albumAccent),
      }}
    >
      {recommending && (
        <RecommendModal
          subject={{ albumId: album.id }}
          label={`${album.title} — ${artist.name}`}
          onClose={() => setRecommending(false)}
        />
      )}

      <button onClick={() => navigate(`${basePath}/artist/${artistId}`)} className="mb-4 text-sm text-fg-faint hover:text-gold">
        ← {artist.name}
      </button>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl">
        <div className="absolute inset-0" style={{ background: gradient(album.cover) }} />
        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-end">
          <Cover colors={album.cover} title={album.title} coverUrl={album.coverUrl} size="lg" />
          <div className="flex-1">
            <button
              onClick={() => navigate(`${basePath}/artist/${artistId}`)}
              className="text-sm font-semibold text-white/70 hover:text-white"
            >
              {artist.name}
            </button>
            <h1 className="font-display text-4xl font-black tracking-tight text-white drop-shadow sm:text-5xl">
              {album.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/80">
              <StatusBadge status={album.status} />
              {album.year && <span>{album.year}</span>}
              {(() => {
                const shownMinutes = runtimeOverride ?? album.minutes;
                if (shownMinutes > 0) return <span>· {fmtMinutes(shownMinutes)}</span>;
                if (loadingRuntime) return <span>· loading runtime…</span>;
                // Any signed-in user can backfill the shared catalog runtime.
                return user ? (
                  <button
                    onClick={loadRuntime}
                    className="underline decoration-dotted underline-offset-2 hover:text-gold"
                    title="Fetch this album's runtime from MusicBrainz"
                  >
                    · load runtime
                  </button>
                ) : (
                  <span>· runtime not loaded</span>
                );
              })()}
              {album.dateListened && <span>· Finished {fmtDate(album.dateListened)}</span>}
              {album.favorite && <span title="Favorite">⭐</span>}
              {agg && agg.listenerCount > 0 && (
                <span title="Community average across all listeners">
                  · 🌍 {agg.avgRating?.toFixed(1)} avg ({agg.listenerCount})
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <DeanMeter value={album.rating} size={88} />
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
              {data.listener.meterName} Meter
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-black text-fg">
          {album.review ? `${data.listener.meterName}'s Review` : "The Verdict"}
        </h2>
        <div className="flex items-center gap-2">
          {user && (
            <button
              onClick={() => setRecommending(true)}
              className="rounded-lg border border-edge px-3 py-1.5 text-sm font-semibold text-fg-muted hover:text-gold"
              title="Recommend this to a friend"
            >
              ✉️ Recommend
            </button>
          )}
          {user && (
            <button
              onClick={downloadCard}
              className="rounded-lg border border-edge px-3 py-1.5 text-sm font-semibold text-fg-muted hover:text-gold"
              title="Download a shareable Verdict card"
            >
              ⬇️ Share card
            </button>
          )}
          {canEdit && setAlbum && (
            <button
              onClick={() => setEditing((e) => !e)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                editing ? "bg-gold text-on-accent" : "border border-edge text-fg-muted hover:text-fg"
              }`}
            >
              {editing ? "Done" : "✎ Edit"}
            </button>
          )}
        </div>
      </div>

      {/* Review */}
      <Panel className="mt-3 p-5">
        {editing ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["want", "listening", "completed"] as AlbumStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() =>
                    patchAlbum({
                      status: s,
                      dateListened:
                        s === "completed" && !album.dateListened
                          ? new Date().toISOString().slice(0, 10)
                          : album.dateListened,
                    })
                  }
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${
                    album.status === s ? "bg-gold text-on-accent" : "border border-edge text-fg-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={() => patchAlbum({ favorite: !album.favorite })}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  album.favorite ? "bg-gold text-on-accent" : "border border-edge text-fg-muted"
                }`}
              >
                ⭐ Favorite
              </button>
            </div>

            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-fg-faint">
                  {data.listener.meterName} Meter
                </label>
                <span className="font-display text-3xl font-black leading-none text-gold">
                  {album.rating?.toFixed(1) ?? "—"}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={album.rating ?? 0}
                onChange={(e) => patchAlbum({ rating: Number(e.target.value) })}
                className="h-6 w-full cursor-pointer accent-gold"
                aria-label="Album score out of 10"
              />
              <div className="mt-0.5 flex justify-between text-[10px] font-semibold text-fg-faint">
                <span>0</span>
                <span>10</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="text-sm text-fg-muted">
                Minutes
                <input
                  type="number"
                  min={0}
                  value={album.minutes}
                  onChange={(e) => patchAlbum({ minutes: Number(e.target.value) })}
                  className="ml-2 w-20 rounded-md border border-edge bg-panel-2 px-2 py-1 text-fg"
                />
              </label>
            </div>

            <textarea
              value={album.review}
              onChange={(e) => patchAlbum({ review: e.target.value })}
              placeholder="What's the verdict?"
              rows={4}
              className="w-full rounded-xl border border-edge bg-panel-2 p-3 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-gold/50"
            />
          </div>
        ) : album.review ? (
          <blockquote className="relative pl-6">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-3 left-0 select-none font-display text-6xl leading-none text-gold/40"
            >
              {"\u201c"}
            </span>
            <p className="whitespace-pre-wrap font-display text-lg italic leading-relaxed text-fg sm:text-xl">
              {album.review}
            </p>
          </blockquote>
        ) : (
          <p className="italic text-fg-faint">No review yet.</p>
        )}
      </Panel>

      {/* Tracklist */}
      {(album.tracks.length > 0 || editing) && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-xl font-black text-fg">Track Ratings</h2>
          <Panel className="divide-y divide-edge/60">
            {album.tracks.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 p-3">
                <span className="w-6 text-right font-display text-sm text-fg-faint">{i + 1}</span>
                <span className="flex-1 truncate text-sm text-fg">{t.title}</span>
                {editing ? (
                  <button
                    onClick={() => patchTrack(t.id, { favorite: !t.favorite })}
                    className="px-1 text-xl leading-none transition-transform hover:scale-125 sm:text-base"
                    title="Favorite track"
                  >
                    {t.favorite ? "⭐" : "☆"}
                  </button>
                ) : (
                  t.favorite && <span className="text-xl sm:text-base">⭐</span>
                )}
                <Score10 value={t.rating} onChange={editing ? (v) => patchTrack(t.id, { rating: v }) : undefined} />
              </div>
            ))}
            {album.tracks.length === 0 && (
              <p className="p-4 text-sm italic text-fg-faint">No tracks added yet.</p>
            )}
          </Panel>
        </div>
      )}

      {/* Offscreen VerdictCard — captured by html-to-image on download */}
      <div style={{ position: "fixed", left: -9999, top: 0, pointerEvents: "none" }} aria-hidden>
        <VerdictCard
          ref={cardRef}
          title={album.title}
          artist={artist.name}
          rating={album.rating}
          review={album.review}
          cover={album.cover}
          meterName={data.listener.meterName}
        />
      </div>
    </div>
  );
}
