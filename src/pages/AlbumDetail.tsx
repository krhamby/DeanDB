import { useState } from "react";
import { useStore } from "../lib/store";
import { fmtDate, fmtMinutes, gradient } from "../lib/format";
import { navigate } from "../lib/router";
import { Cover } from "../components/cards";
import { DeanMeter, Panel, StatusBadge, Score10 } from "../components/ui";
import type { Album, AlbumStatus, DeanDBData } from "../types";

export function AlbumDetail({ artistId, albumId }: { artistId: string; albumId: string }) {
  const { data, update, isEditor } = useStore();
  const [editing, setEditing] = useState(false);

  const artist = data?.artists.find((a) => a.id === artistId);
  const album = artist?.albums.find((a) => a.id === albumId);

  if (!artist || !album) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-400">Album not found.</p>
        <button onClick={() => navigate("/")} className="mt-4 text-gold hover:underline">
          ← Back home
        </button>
      </div>
    );
  }

  // helper to mutate this specific album immutably
  const patchAlbum = (patch: Partial<Album>) =>
    update((draft: DeanDBData) => {
      const ar = draft.artists.find((a) => a.id === artistId);
      const al = ar?.albums.find((a) => a.id === albumId);
      if (al) Object.assign(al, patch);
      return draft;
    });

  const patchTrack = (trackId: string, patch: Partial<Album["tracks"][number]>) =>
    update((draft: DeanDBData) => {
      const ar = draft.artists.find((a) => a.id === artistId);
      const al = ar?.albums.find((a) => a.id === albumId);
      const tr = al?.tracks.find((t) => t.id === trackId);
      if (tr) Object.assign(tr, patch);
      return draft;
    });

  return (
    <div>
      <button onClick={() => navigate(`/artist/${artistId}`)} className="mb-4 text-sm text-zinc-500 hover:text-gold">
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
              onClick={() => navigate(`/artist/${artistId}`)}
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
              <span>· {fmtMinutes(album.minutes)}</span>
              {album.dateListened && <span>· Finished {fmtDate(album.dateListened)}</span>}
              {album.favorite && <span title="Favorite">⭐</span>}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <DeanMeter value={album.rating} size={88} />
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Dean Meter
            </span>
          </div>
        </div>
      </div>

      {/* Edit toggle */}
      <div className="mt-5 flex items-center justify-between">
        <h2 className="font-display text-xl font-black text-white">
          {album.review ? "Dean's Review" : "The Verdict"}
        </h2>
        {isEditor && (
          <button
            onClick={() => setEditing((e) => !e)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              editing ? "bg-gold text-black" : "border border-edge text-zinc-300 hover:text-white"
            }`}
          >
            {editing ? "Done" : "✎ Edit"}
          </button>
        )}
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
                    album.status === s ? "bg-gold text-black" : "border border-edge text-zinc-300"
                  }`}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={() => patchAlbum({ favorite: !album.favorite })}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  album.favorite ? "bg-gold text-black" : "border border-edge text-zinc-300"
                }`}
              >
                ⭐ Favorite
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Dean Meter: <span className="text-gold">{album.rating?.toFixed(1) ?? "—"}</span>
              </label>
              <input
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={album.rating ?? 0}
                onChange={(e) => patchAlbum({ rating: Number(e.target.value) })}
                className="mt-1 w-full accent-gold"
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="text-sm text-zinc-400">
                Minutes
                <input
                  type="number"
                  min={0}
                  value={album.minutes}
                  onChange={(e) => patchAlbum({ minutes: Number(e.target.value) })}
                  className="ml-2 w-20 rounded-md border border-edge bg-panel-2 px-2 py-1 text-white"
                />
              </label>
              <label className="text-sm text-zinc-400">
                Year
                <input
                  type="number"
                  value={album.year ?? ""}
                  onChange={(e) => patchAlbum({ year: e.target.value ? Number(e.target.value) : null })}
                  className="ml-2 w-24 rounded-md border border-edge bg-panel-2 px-2 py-1 text-white"
                />
              </label>
            </div>

            <textarea
              value={album.review}
              onChange={(e) => patchAlbum({ review: e.target.value })}
              placeholder="What's the verdict, Dean?"
              rows={4}
              className="w-full rounded-xl border border-edge bg-panel-2 p-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-gold/50"
            />
          </div>
        ) : album.review ? (
          <p className="whitespace-pre-wrap leading-relaxed text-zinc-300">“{album.review}”</p>
        ) : (
          <p className="italic text-zinc-500">No review yet. Dean hasn&apos;t weighed in.</p>
        )}
      </Panel>

      {/* Tracklist */}
      {(album.tracks.length > 0 || editing) && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-xl font-black text-white">Track Ratings</h2>
          <Panel className="divide-y divide-edge/60">
            {album.tracks.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 p-3">
                <span className="w-6 text-right font-display text-sm text-zinc-600">{i + 1}</span>
                <span className="flex-1 truncate text-sm text-white">{t.title}</span>
                <button
                  onClick={() => patchTrack(t.id, { favorite: !t.favorite })}
                  className="text-base transition-transform hover:scale-125"
                  title="Favorite track"
                >
                  {t.favorite ? "⭐" : "☆"}
                </button>
                <Score10 value={t.rating} onChange={editing ? (v) => patchTrack(t.id, { rating: v }) : undefined} />
              </div>
            ))}
            {album.tracks.length === 0 && (
              <p className="p-4 text-sm italic text-zinc-500">No tracks added yet.</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
