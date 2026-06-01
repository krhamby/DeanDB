import { useRef, useState } from "react";
import { useStore } from "../lib/store";
import { slugify, uid } from "../lib/format";
import { findAlbumCover, lookupArtist } from "../lib/musicbrainz";
import { Panel, SectionTitle } from "../components/ui";
import type { Album, Artist, DeanDBData } from "../types";

const PALETTE: [string, string][] = [
  ["#ef4444", "#7c2d12"],
  ["#f59e0b", "#92400e"],
  ["#10b981", "#064e3b"],
  ["#3b82f6", "#1e3a8a"],
  ["#a855f7", "#4c1d95"],
  ["#ec4899", "#831843"],
  ["#14b8a6", "#134e4a"],
  ["#f97316", "#7c2d12"],
];
const pick = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
      {label}
      {children}
    </label>
  );
}

const inputCls =
  "rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white outline-none placeholder:text-zinc-600 focus:border-gold/50";

export function Editor() {
  const {
    data,
    update,
    replace,
    resetToPublished,
    dirty,
    supabaseEnabled,
    publishing,
    publish,
    hasLocalDraft,
    restoreLocalDraft,
  } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newArtist, setNewArtist] = useState({ name: "", genre: "", country: "", catalogSize: 1 });
  const [albumDraft, setAlbumDraft] = useState<Record<string, { title: string; year: string }>>({});
  const [trackDraft, setTrackDraft] = useState<Record<string, string>>({});
  const [passcode, setPasscode] = useState(() => localStorage.getItem("deandb:passcode") ?? "");
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");
  const [coverBusy, setCoverBusy] = useState<Record<string, boolean>>({});

  if (!data) return null;

  // Import an artist's whole studio discography (covers + years) from MusicBrainz.
  const importArtist = async () => {
    const name = newArtist.name.trim();
    if (!name) return;
    setLookupBusy(true);
    setLookupMsg("Searching MusicBrainz…");
    try {
      const match = await lookupArtist(name);
      if (!match) {
        setLookupMsg(`No MusicBrainz match for “${name}”. Add it manually below.`);
        return;
      }
      update((draft) => {
        draft.artists.push({
          id: `${slugify(match.name)}-${uid("a").slice(-4)}`,
          name: match.name,
          genre: newArtist.genre.trim() || "Unknown",
          country: match.country ?? (newArtist.country.trim() || "—"),
          color: pick(),
          catalogSize: match.catalogSize || match.albums.length || 1,
          bio: "",
          mbid: match.mbid,
          albums: match.albums.map((al) => ({
            id: `${slugify(al.title)}-${uid("al").slice(-4)}`,
            title: al.title,
            year: al.year,
            cover: pick(),
            coverUrl: al.coverUrl,
            mbid: al.mbid,
            status: "want" as const,
            rating: null,
            review: "",
            minutes: 40,
            dateListened: null,
            favorite: false,
            tracks: [],
          })),
        });
        return draft;
      });
      setLookupMsg(`✓ Imported ${match.name} — ${match.albums.length} studio albums with covers.`);
      setNewArtist({ name: "", genre: "", country: "", catalogSize: 1 });
    } catch {
      setLookupMsg("MusicBrainz lookup failed (network/CORS). You can still add manually.");
    } finally {
      setLookupBusy(false);
    }
  };

  // Pull a single album's cover art (and fill the year if missing).
  const fetchCover = async (artist: Artist, al: Album) => {
    setCoverBusy((s) => ({ ...s, [al.id]: true }));
    try {
      const m = await findAlbumCover(artist.name, al.title);
      if (m) {
        update((draft) => {
          const t = draft.artists
            .find((a) => a.id === artist.id)
            ?.albums.find((x) => x.id === al.id);
          if (t) {
            t.coverUrl = m.coverUrl;
            t.mbid = m.mbid;
            if (t.year == null) t.year = m.year;
          }
          return draft;
        });
      }
    } finally {
      setCoverBusy((s) => ({ ...s, [al.id]: false }));
    }
  };

  const doPublish = async () => {
    setPublishMsg(null);
    localStorage.setItem("deandb:passcode", passcode);
    const res = await publish(passcode);
    setPublishMsg(
      res.ok
        ? { ok: true, text: "Published! Everyone can see it now. 🎉" }
        : { ok: false, text: res.error ?? "Publish failed." },
    );
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "deandb.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as DeanDBData;
        if (!parsed.artists) throw new Error("Missing artists");
        replace(parsed);
      } catch {
        alert("That doesn't look like a valid deandb.json file.");
      }
    };
    reader.readAsText(file);
  };

  const addArtist = () => {
    if (!newArtist.name.trim()) return;
    update((draft) => {
      draft.artists.push({
        id: `${slugify(newArtist.name)}-${uid("a").slice(-4)}`,
        name: newArtist.name.trim(),
        genre: newArtist.genre.trim() || "Unknown",
        country: newArtist.country.trim() || "—",
        color: pick(),
        catalogSize: Math.max(1, newArtist.catalogSize),
        bio: "",
        albums: [],
      });
      return draft;
    });
    setNewArtist({ name: "", genre: "", country: "", catalogSize: 1 });
  };

  const addAlbum = (artistId: string) => {
    const d = albumDraft[artistId];
    if (!d?.title.trim()) return;
    update((draft) => {
      const ar = draft.artists.find((a) => a.id === artistId);
      ar?.albums.push({
        id: `${slugify(d.title)}-${uid("al").slice(-4)}`,
        title: d.title.trim(),
        year: d.year ? Number(d.year) : null,
        cover: pick(),
        status: "want",
        rating: null,
        review: "",
        minutes: 40,
        dateListened: null,
        favorite: false,
        tracks: [],
      });
      return draft;
    });
    setAlbumDraft((s) => ({ ...s, [artistId]: { title: "", year: "" } }));
  };

  const addTrack = (artistId: string, albumId: string) => {
    const key = `${artistId}:${albumId}`;
    const title = trackDraft[key];
    if (!title?.trim()) return;
    update((draft) => {
      const al = draft.artists.find((a) => a.id === artistId)?.albums.find((x) => x.id === albumId);
      al?.tracks.push({ id: uid("t"), title: title.trim(), rating: null, favorite: false });
      return draft;
    });
    setTrackDraft((s) => ({ ...s, [key]: "" }));
  };

  const removeAlbum = (artistId: string, albumId: string) =>
    update((draft) => {
      const ar = draft.artists.find((a) => a.id === artistId);
      if (ar) ar.albums = ar.albums.filter((a) => a.id !== albumId);
      return draft;
    });

  const removeArtist = (artistId: string) => {
    if (!confirm("Remove this artist and all their albums?")) return;
    update((draft) => {
      draft.artists = draft.artists.filter((a) => a.id !== artistId);
      return draft;
    });
  };

  const patchListener = (patch: Partial<DeanDBData["listener"]>) =>
    update((draft) => {
      Object.assign(draft.listener, patch);
      return draft;
    });

  return (
    <div className="space-y-8">
      <SectionTitle kicker="Mission control" title="The Editor" />

      {/* Unpublished draft recovery — DB is loaded fresh, draft is only offered. */}
      {hasLocalDraft && !dirty && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 border-gold/40 bg-gold/5 p-4">
          <span className="text-sm text-zinc-300">
            💾 You have unpublished edits saved in this browser from a previous session.
          </span>
          <div className="flex gap-2">
            <button
              onClick={restoreLocalDraft}
              className="rounded-lg bg-gold px-3 py-1.5 text-sm font-bold text-black hover:brightness-110"
            >
              Restore draft
            </button>
            <button
              onClick={() => resetToPublished()}
              className="rounded-lg border border-edge px-3 py-1.5 text-sm font-semibold text-zinc-400 hover:text-dean"
            >
              Discard
            </button>
          </div>
        </Panel>
      )}

      {/* Live publish via Supabase */}
      {supabaseEnabled && (
        <Panel className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" />
            <h3 className="font-display text-lg font-black text-white">Live Sync</h3>
            <span className="text-xs text-zinc-500">connected to the cloud</span>
          </div>
          <p className="text-xs leading-relaxed text-zinc-500">
            Edits autosave to <span className="text-zinc-300">this browser</span>. Hit{" "}
            <span className="text-gold">Publish</span> to push them live — everyone viewing DeanDB sees
            the update instantly, no commit required. Writing requires your editor passcode.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="password"
              className={`${inputCls} w-48`}
              placeholder="Editor passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
            />
            <button
              onClick={doPublish}
              disabled={publishing || !passcode}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-black hover:brightness-110 disabled:opacity-40"
            >
              {publishing ? "Publishing…" : dirty ? "⬆ Publish changes" : "✓ Up to date — Publish anyway"}
            </button>
            {dirty && (
              <span className="rounded-full bg-dean/15 px-3 py-1 text-xs font-semibold text-dean ring-1 ring-dean/30">
                ● Unpublished edits
              </span>
            )}
          </div>
          {publishMsg && (
            <p className={`text-sm font-semibold ${publishMsg.ok ? "text-emerald-400" : "text-dean"}`}>
              {publishMsg.text}
            </p>
          )}
        </Panel>
      )}

      {/* Manual export / import (backup, or when offline) */}
      <Panel className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={exportJson} className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-black hover:brightness-110">
            ⬇ Export deandb.json
          </button>
          <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-edge px-4 py-2 text-sm font-semibold text-zinc-300 hover:text-white">
            ⬆ Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
          />
          <button onClick={() => resetToPublished()} className="rounded-lg border border-edge px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-dean">
            ↺ Discard local edits
          </button>
          {dirty && (
            <span className="rounded-full bg-dean/15 px-3 py-1 text-xs font-semibold text-dean ring-1 ring-dean/30">
              ● Unpublished local edits
            </span>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          {supabaseEnabled ? (
            <>
              Backup tools. <span className="text-zinc-300">Export</span> downloads a snapshot of the data;{" "}
              <span className="text-zinc-300">Import</span> loads one back in. Handy for backups or seeding{" "}
              <code className="rounded bg-black/40 px-1 text-gold">public/data/deandb.json</code>.
            </>
          ) : (
            <>
              Edits save automatically to <span className="text-zinc-300">this browser</span> only. To make
              them visible to everyone, click <span className="text-gold">Export</span>, then replace{" "}
              <code className="rounded bg-black/40 px-1 text-gold">public/data/deandb.json</code> in the repo
              with the downloaded file and push. GitHub Pages redeploys automatically. 🚀
            </>
          )}
        </p>
      </Panel>

      {/* Marathon settings */}
      <Panel className="space-y-4 p-5">
        <h3 className="font-display text-lg font-black text-white">Marathon Settings</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Listener name">
            <input className={inputCls} value={data.listener.name} onChange={(e) => patchListener({ name: e.target.value })} />
          </Field>
          <Field label="Handle">
            <input className={inputCls} value={data.listener.handle} onChange={(e) => patchListener({ handle: e.target.value })} />
          </Field>
          <Field label="Season label">
            <input className={inputCls} value={data.season} onChange={(e) => update((d) => ((d.season = e.target.value), d))} />
          </Field>
          <Field label="Goal hours">
            <input
              type="number"
              className={inputCls}
              value={data.goalHours}
              onChange={(e) => update((d) => ((d.goalHours = Number(e.target.value) || 0), d))}
            />
          </Field>
        </div>
        <Field label="Tagline">
          <input className={inputCls} value={data.listener.tagline} onChange={(e) => patchListener({ tagline: e.target.value })} />
        </Field>
      </Panel>

      {/* Add artist */}
      <Panel className="space-y-3 p-5">
        <h3 className="font-display text-lg font-black text-white">Add an Artist</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Name">
            <input className={inputCls} value={newArtist.name} onChange={(e) => setNewArtist({ ...newArtist, name: e.target.value })} placeholder="e.g. Björk" />
          </Field>
          <Field label="Genre">
            <input className={inputCls} value={newArtist.genre} onChange={(e) => setNewArtist({ ...newArtist, genre: e.target.value })} placeholder="Art Pop" />
          </Field>
          <Field label="Country">
            <input className={inputCls} value={newArtist.country} onChange={(e) => setNewArtist({ ...newArtist, country: e.target.value })} placeholder="Iceland" />
          </Field>
          <Field label="Catalog size">
            <input type="number" min={1} className={inputCls} value={newArtist.catalogSize} onChange={(e) => setNewArtist({ ...newArtist, catalogSize: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={importArtist}
            disabled={lookupBusy || !newArtist.name.trim()}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-black hover:brightness-110 disabled:opacity-40"
          >
            {lookupBusy ? "🔎 Searching…" : "🔎 Import from MusicBrainz"}
          </button>
          <button
            onClick={addArtist}
            className="rounded-lg border border-edge px-4 py-2 text-sm font-semibold text-zinc-300 hover:text-white"
          >
            + Add blank artist
          </button>
          {lookupMsg && <span className="text-xs text-zinc-400">{lookupMsg}</span>}
        </div>
        <p className="text-xs leading-relaxed text-zinc-500">
          <span className="text-zinc-300">Import from MusicBrainz</span> auto-fills the full studio
          discography with real album covers (free, open-data — no API key). Or add a blank artist and
          fill it in by hand.
        </p>
      </Panel>

      {/* Manage artists */}
      <div className="space-y-4">
        <h3 className="font-display text-lg font-black text-white">Roster ({data.artists.length})</h3>
        {data.artists.map((artist: Artist) => (
          <Panel key={artist.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-display text-lg font-black text-white">{artist.name}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {artist.genre} · {artist.albums.length}/{artist.catalogSize} albums
                </span>
              </div>
              <button onClick={() => removeArtist(artist.id)} className="text-xs text-zinc-600 hover:text-dean">
                Remove
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {artist.albums.map((al) => {
                const tkey = `${artist.id}:${al.id}`;
                return (
                  <div key={al.id} className="rounded-xl border border-edge/60 bg-panel-2/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">
                        {al.title} <span className="text-zinc-600">{al.year ?? ""}</span>
                        <span className="ml-2 text-xs text-zinc-500">· {al.tracks.length} tracks</span>
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => fetchCover(artist, al)}
                          disabled={coverBusy[al.id]}
                          className="text-xs font-semibold text-gold hover:brightness-110 disabled:opacity-50"
                          title="Fetch cover art from the Cover Art Archive"
                        >
                          {coverBusy[al.id] ? "🎨 …" : al.coverUrl ? "🎨 Refresh cover" : "🎨 Find cover"}
                        </button>
                        <button onClick={() => removeAlbum(artist.id, al.id)} className="text-xs text-zinc-600 hover:text-dean">
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        className={`${inputCls} flex-1`}
                        placeholder="Add a track…"
                        value={trackDraft[tkey] ?? ""}
                        onChange={(e) => setTrackDraft((s) => ({ ...s, [tkey]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addTrack(artist.id, al.id)}
                      />
                      <button onClick={() => addTrack(artist.id, al.id)} className="rounded-lg border border-edge px-3 text-sm text-zinc-300 hover:text-white">
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* add album */}
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className={`${inputCls} flex-1`}
                placeholder="New album title…"
                value={albumDraft[artist.id]?.title ?? ""}
                onChange={(e) => setAlbumDraft((s) => ({ ...s, [artist.id]: { title: e.target.value, year: s[artist.id]?.year ?? "" } }))}
                onKeyDown={(e) => e.key === "Enter" && addAlbum(artist.id)}
              />
              <input
                type="number"
                className={`${inputCls} w-24`}
                placeholder="Year"
                value={albumDraft[artist.id]?.year ?? ""}
                onChange={(e) => setAlbumDraft((s) => ({ ...s, [artist.id]: { title: s[artist.id]?.title ?? "", year: e.target.value } }))}
              />
              <button onClick={() => addAlbum(artist.id)} className="rounded-lg bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20">
                + Album
              </button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
