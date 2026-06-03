import { useState } from "react";
import { useMyJourney, usePeopleSearch } from "../lib/store";
import { navigate } from "../lib/router";
import { fmtHours } from "../lib/format";
import { computeStats } from "../lib/stats";
import * as api from "../lib/api";
import {
  fetchTracklist,
  findAlbumCover,
  lookupArtist,
  refreshArtistMeta,
} from "../lib/musicbrainz";
import { DeanMeter, LoggedBadge, Panel, SectionTitle, Score10, scoreColor } from "../components/ui";
import { Cover } from "../components/cards";
import { Avatar } from "../components/social";
import type { Album, AlbumStatus, Artist, Profile } from "../types";

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
const pick = (): [string, string] => PALETTE[Math.floor(Math.random() * PALETTE.length)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An album the listener hasn't engaged with yet — safe to auto-prune on import. */
const isPristine = (al: Album) =>
  al.status === "want" && al.rating == null && !al.review && !al.favorite && !al.excluded && !al.dateListened;

const inputCls =
  "rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white outline-none placeholder:text-zinc-600 focus:border-gold/50";

const selectCls =
  "rounded-lg border border-edge bg-panel-2 px-2 py-2 text-xs font-semibold text-zinc-200 outline-none focus:border-gold/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
      {label}
      {children}
    </label>
  );
}

type SetArtist = (
  artistId: string,
  patch: api.UserArtistPatch & { recommendedBy?: Artist["recommendedBy"] },
) => void;

/**
 * Optional "who recommended this artist to me" control. Lets the owner link an
 * on-platform person (search) and/or jot a free-text name for someone not on
 * DeanDB. Kept separate from the peer-to-peer recommendations inbox.
 */
function RecommenderPicker({ artist, setArtist }: { artist: Artist; setArtist: SetArtist }) {
  const [query, setQuery] = useState("");
  const { results } = usePeopleSearch(query);
  const rec = artist.recommendedBy;

  const setText = (text: string) =>
    setArtist(artist.id, {
      recByText: text,
      recommendedBy:
        text || rec?.userId
          ? {
              userId: rec?.userId ?? null,
              username: rec?.username ?? null,
              displayName: rec?.displayName ?? null,
              avatarUrl: rec?.avatarUrl ?? null,
              text,
            }
          : undefined,
    });

  const pickUser = (p: Profile) => {
    // Persist a name fallback in rec_by_text too: if this recommender is private
    // and the viewer doesn't follow them, RLS hides the profile embed on reload,
    // so without the fallback the credit would vanish entirely. With it, the row
    // shows a linked @handle when visible and the plain name otherwise.
    const text = rec?.text || p.displayName || p.username;
    setArtist(artist.id, {
      recByUser: p.id,
      recByText: text,
      recommendedBy: {
        userId: p.id,
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        text,
      },
    });
    setQuery("");
  };

  const clearUser = () =>
    setArtist(artist.id, {
      recByUser: null,
      recommendedBy: rec?.text
        ? { userId: null, username: null, displayName: null, avatarUrl: null, text: rec.text }
        : undefined,
    });

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recommended by</div>
      {rec?.username && (
        <div className="flex items-center gap-2">
          <Avatar profile={{ username: rec.username, displayName: rec.displayName ?? rec.username, avatarUrl: rec.avatarUrl }} size={24} />
          <span className="text-sm text-white">@{rec.username}</span>
          <button onClick={clearUser} className="text-xs text-zinc-600 hover:text-dean" title="Unlink person">
            ×
          </button>
        </div>
      )}
      <input
        className={`${inputCls} w-full`}
        placeholder="A name (e.g. a friend not on DeanDB)…"
        value={rec?.text ?? ""}
        onChange={(e) => setText(e.target.value)}
      />
      <input
        className={`${inputCls} w-full`}
        placeholder="…or search people on DeanDB to link"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <div className="divide-y divide-edge/40 overflow-hidden rounded-lg border border-edge/50 bg-panel-2/60">
          {results.slice(0, 5).map((r) => (
            <button
              key={r.profile.id}
              onClick={() => pickUser(r.profile)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/5"
            >
              <Avatar profile={r.profile} size={24} />
              <span className="truncate text-sm text-white">{r.profile.displayName}</span>
              <span className="truncate text-xs text-zinc-500">@{r.profile.username}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Editor() {
  const { data, userId, patchLocal, reload, setAlbum, setTrack, setArtist } = useMyJourney();

  const [newArtist, setNewArtist] = useState({ name: "", genre: "", country: "", catalogSize: 1 });
  const [albumDraft, setAlbumDraft] = useState<Record<string, { title: string; year: string }>>({});
  const [trackDraft, setTrackDraft] = useState<Record<string, string>>({});
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");
  const [coverBusy, setCoverBusy] = useState<Record<string, boolean>>({});
  const [trackBusy, setTrackBusy] = useState<Record<string, boolean>>({});
  const [bulkTracks, setBulkTracks] = useState<Record<string, string>>({});
  const [metaBusy, setMetaBusy] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [albumOpen, setAlbumOpen] = useState<Record<string, boolean>>({});
  const [artistPanelOpen, setArtistPanelOpen] = useState<Record<string, boolean>>({});
  const [bulkText, setBulkText] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkLog, setBulkLog] = useState<string[]>([]);
  const [rosterQuery, setRosterQuery] = useState("");
  // Roster filters + sort (albums are filtered/sorted within their artist groups).
  const [genreFilter, setGenreFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AlbumStatus>("all");
  const [favOnly, setFavOnly] = useState(false);
  const [ratedFilter, setRatedFilter] = useState<"all" | "rated" | "unrated">("all");
  const [albumSort, setAlbumSort] = useState<"default" | "title" | "year" | "rating" | "date">("default");

  if (!data || !userId) return null;
  const uid = userId;

  // ── Import a single artist's whole studio discography from MusicBrainz ──
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
      const artistId = await api.importArtistFromMatch(uid, match, pick(), pick);
      const fresh = await reload();
      setLookupMsg(`✓ Imported ${match.name} — ${match.albums.length} studio albums with covers. Fetching tracklists…`);
      setNewArtist({ name: "", genre: "", country: "", catalogSize: 1 });
      // Single import → auto-pull tracklists (the bulk path deliberately skips
      // this to stay within MusicBrainz's ~1 req/sec budget). Runs in the
      // background with its own progress under the artist in the roster.
      const imported = fresh?.artists.find((a) => a.id === artistId);
      if (imported) void loadAllTracks(imported).catch((e) => console.error("auto track fetch failed", e));
    } catch (e) {
      setLookupMsg(e instanceof Error ? `${e.message}. You can still add manually.` : "Lookup failed.");
    } finally {
      setLookupBusy(false);
    }
  };

  // ── Bulk import: one artist per line, throttled, skipping the roster ──
  const bulkImport = async () => {
    const names = [...new Set(bulkText.split("\n").map((s) => s.trim()).filter(Boolean))];
    if (names.length === 0) return;
    setBulkImporting(true);
    setBulkLog([`Starting bulk import of ${names.length} artist(s)…`]);
    const seen = new Set(data.artists.map((a) => a.name.toLowerCase()));
    let added = 0,
      skipped = 0,
      missed = 0;
    const log = (line: string) => setBulkLog((l) => [...l, line]);

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const tag = `(${i + 1}/${names.length})`;
      if (seen.has(name.toLowerCase())) {
        log(`${tag} ${name} — already in roster, skipped`);
        skipped++;
        continue;
      }
      try {
        const match = await lookupArtist(name);
        if (!match) {
          log(`${tag} ${name} — no match ✗`);
          missed++;
        } else {
          await api.importArtistFromMatch(uid, match, pick(), pick);
          seen.add(name.toLowerCase());
          seen.add(match.name.toLowerCase());
          log(`${tag} ${match.name} — ${match.albums.length} albums ✓`);
          added++;
        }
      } catch (e) {
        log(`${tag} ${name} — ${e instanceof Error ? e.message : "error"} ✗`);
        missed++;
      }
      await sleep(300);
    }
    await reload();
    log(`✓ Done — added ${added}, skipped ${skipped}, not found ${missed}.`);
    setBulkText("");
    setBulkImporting(false);
  };

  // ── Cover art for one album (shared catalog) ──
  const fetchCover = async (artist: Artist, al: Album) => {
    setCoverBusy((s) => ({ ...s, [al.id]: true }));
    try {
      const m = await findAlbumCover(artist.name, al.title);
      if (m) {
        await api.refreshCatalogAlbum({
          artistId: artist.id,
          mbid: m.mbid,
          title: al.title,
          year: al.year ?? m.year,
          cover: al.cover,
          coverUrl: m.coverUrl,
          runtimeMin: al.minutes,
        });
        patchLocal((d) => {
          const t = d.artists.find((a) => a.id === artist.id)?.albums.find((x) => x.id === al.id);
          if (t) {
            t.coverUrl = m.coverUrl;
            t.mbid = m.mbid;
            if (t.year == null) t.year = m.year;
          }
          return d;
        });
      }
    } finally {
      setCoverBusy((s) => ({ ...s, [al.id]: false }));
    }
  };

  // ── Set an album's tracklist (catalog) + adopt real runtime ──
  const applyTracks = async (artistId: string, al: Album, titles: string[], runtimeMin: number) => {
    const ids = await api.setCatalogTracks(al.id, titles);
    patchLocal((d) => {
      const album = d.artists.find((a) => a.id === artistId)?.albums.find((x) => x.id === al.id);
      if (album) {
        album.tracks = titles.map((title, i) => ({ id: ids[i], title, rating: null, favorite: false }));
        if (runtimeMin > 0) album.minutes = runtimeMin;
      }
      return d;
    });
    if (runtimeMin > 0) setAlbum(al.id, { minutes: runtimeMin });
  };

  const fetchTracks = async (artist: Artist, al: Album) => {
    setTrackBusy((s) => ({ ...s, [al.id]: true }));
    try {
      const mbid = al.mbid ?? (await findAlbumCover(artist.name, al.title))?.mbid ?? null;
      if (!mbid) return;
      const tl = await fetchTracklist(mbid);
      if (tl.titles.length) await applyTracks(artist.id, al, tl.titles, tl.runtimeMin);
    } catch {
      /* leave tracks as-is */
    } finally {
      setTrackBusy((s) => ({ ...s, [al.id]: false }));
    }
  };

  const loadAllTracks = async (artist: Artist) => {
    const todo = artist.albums.filter((a) => a.tracks.length === 0);
    if (todo.length === 0) {
      setBulkTracks((s) => ({ ...s, [artist.id]: "Every album already has tracks." }));
      return;
    }
    let done = 0;
    let pulled = 0;
    const trackless: string[] = [];
    for (const al of todo) {
      setBulkTracks((s) => ({ ...s, [artist.id]: `Loading tracklists… ${done}/${todo.length}` }));
      let gotTracks = false;
      try {
        const mbid = al.mbid ?? (await findAlbumCover(artist.name, al.title))?.mbid ?? null;
        if (mbid) {
          const tl = await fetchTracklist(mbid);
          if (tl.titles.length) {
            await applyTracks(artist.id, al, tl.titles, tl.runtimeMin);
            gotTracks = true;
            pulled++;
          }
        }
      } catch {
        /* skip */
      }
      // No MusicBrainz tracklist → treat as a non-album and drop it from the
      // journey, but only when untouched (never delete rated/owned work).
      if (!gotTracks && isPristine(al)) trackless.push(al.id);
      done++;
      await sleep(300);
    }
    if (trackless.length) {
      await Promise.all(
        trackless.map((id) => api.removeUserAlbum(uid, id).catch((e) => console.error("prune trackless album failed", e))),
      );
      patchLocal((d) => {
        const a = d.artists.find((x) => x.id === artist.id);
        if (a) a.albums = a.albums.filter((al) => !trackless.includes(al.id));
        return d;
      });
    }
    const removed = trackless.length ? `, removed ${trackless.length} without tracks` : "";
    setBulkTracks((s) => ({ ...s, [artist.id]: `✓ Pulled tracklists for ${pulled} album(s)${removed}.` }));
  };

  // ── Refresh genre / country / catalog size from MusicBrainz ──
  const refreshMeta = async (artist: Artist) => {
    setMetaBusy((s) => ({ ...s, [artist.id]: true }));
    try {
      let meta: { genre: string | null; country: string | null; catalogSize: number } | null = null;
      let foundMbid = artist.mbid;
      if (artist.mbid) {
        meta = await refreshArtistMeta(artist.mbid);
      } else {
        const m = await lookupArtist(artist.name);
        if (m) {
          meta = { genre: m.genre, country: m.country, catalogSize: m.catalogSize };
          foundMbid = m.mbid;
        }
      }
      if (meta) {
        await api.refreshCatalogArtist({
          mbid: foundMbid,
          name: artist.name,
          genre: meta.genre,
          country: meta.country,
          catalogSize: meta.catalogSize,
          color: artist.color,
        });
        patchLocal((d) => {
          const a = d.artists.find((x) => x.id === artist.id);
          if (a) {
            if (meta!.genre) a.genre = meta!.genre;
            if (meta!.country) a.country = meta!.country;
            if (meta!.catalogSize) a.catalogSize = meta!.catalogSize;
            if (foundMbid) a.mbid = foundMbid;
          }
          return d;
        });
      }
    } finally {
      setMetaBusy((s) => ({ ...s, [artist.id]: false }));
    }
  };

  // ── Inline edits (optimistic local + persist) ──
  const setAlbumStatus = (al: Album, status: AlbumStatus) =>
    setAlbum(al.id, {
      status,
      dateListened:
        status === "completed" && !al.dateListened ? new Date().toISOString().slice(0, 10) : al.dateListened,
    });

  // ── Structural edits ──
  const addArtist = async () => {
    if (!newArtist.name.trim()) return;
    await api.createUserArtist(
      uid,
      {
        name: newArtist.name.trim(),
        genre: newArtist.genre.trim() || null,
        country: newArtist.country.trim() || null,
        catalogSize: Math.max(1, newArtist.catalogSize),
      },
      pick(),
    );
    await reload();
    setNewArtist({ name: "", genre: "", country: "", catalogSize: 1 });
  };

  const addAlbum = async (artistId: string) => {
    const d = albumDraft[artistId];
    if (!d?.title.trim()) return;
    const albumId = await api.createUserAlbum(uid, artistId, {
      title: d.title.trim(),
      year: d.year ? Number(d.year) : null,
      cover: pick(),
    });
    const fresh = await reload();
    setAlbumDraft((s) => ({ ...s, [artistId]: { title: "", year: "" } }));
    // Adding a single album → auto-fetch its cover + tracklist from MusicBrainz.
    const artist = fresh?.artists.find((a) => a.id === artistId);
    const al = artist?.albums.find((a) => a.id === albumId);
    if (artist && al) {
      await fetchCover(artist, al);
      await fetchTracks(artist, al);
    }
  };

  const addTrack = async (artistId: string, albumId: string) => {
    const key = `${artistId}:${albumId}`;
    const title = trackDraft[key];
    if (!title?.trim()) return;
    const id = await api.addCatalogTrack(albumId, title.trim());
    patchLocal((d) => {
      const al = d.artists.find((a) => a.id === artistId)?.albums.find((x) => x.id === albumId);
      al?.tracks.push({ id, title: title.trim(), rating: null, favorite: false });
      return d;
    });
    setTrackDraft((s) => ({ ...s, [key]: "" }));
  };

  const removeTrack = async (artistId: string, albumId: string, trackId: string) => {
    await api.removeCatalogTrack(trackId);
    patchLocal((d) => {
      const al = d.artists.find((a) => a.id === artistId)?.albums.find((x) => x.id === albumId);
      if (al) al.tracks = al.tracks.filter((t) => t.id !== trackId);
      return d;
    });
  };

  const removeAlbum = async (artistId: string, albumId: string) => {
    await api.removeUserAlbum(uid, albumId);
    patchLocal((d) => {
      const ar = d.artists.find((a) => a.id === artistId);
      if (ar) ar.albums = ar.albums.filter((a) => a.id !== albumId);
      return d;
    });
  };

  const removeArtist = async (artistId: string) => {
    if (!confirm("Remove this artist and all their albums from your journey?")) return;
    await api.removeUserArtist(artistId);
    patchLocal((d) => {
      d.artists = d.artists.filter((a) => a.id !== artistId);
      return d;
    });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-deandb-journey.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Roster search + filters + sort + collapse ──
  const q = rosterQuery.trim().toLowerCase();
  const genreOptions = [...new Set(data.artists.map((a) => a.genre).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  // Album-level predicate: name search (album title OR artist name) + filters.
  const albumPasses = (a: Artist, al: Album) => {
    if (q && !a.name.toLowerCase().includes(q) && !al.title.toLowerCase().includes(q)) return false;
    if (statusFilter !== "all" && al.status !== statusFilter) return false;
    if (favOnly && !al.favorite) return false;
    if (ratedFilter === "rated" && al.rating == null) return false;
    if (ratedFilter === "unrated" && al.rating != null) return false;
    return true;
  };
  const sortAlbums = (list: Album[]) => {
    if (albumSort === "default") return list;
    const sorted = [...list];
    if (albumSort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (albumSort === "year") sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    else if (albumSort === "rating") sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    else if (albumSort === "date") sorted.sort((a, b) => (b.dateListened ?? "").localeCompare(a.dateListened ?? ""));
    return sorted;
  };
  // Filter + sort each artist's albums once per render, keyed by artist id, so
  // shownArtists / the count / the render all read the same precomputed list.
  const visibleByArtist = new Map<string, Album[]>(
    data.artists.map((a) => [a.id, sortAlbums(a.albums.filter((al) => albumPasses(a, al)))]),
  );
  const visibleAlbumsOf = (a: Artist) => visibleByArtist.get(a.id) ?? [];
  const anyAlbumFilterActive =
    q !== "" || statusFilter !== "all" || favOnly || ratedFilter !== "all";
  const anyFilterActive = anyAlbumFilterActive || genreFilter !== "" || albumSort !== "default";
  const clearFilters = () => {
    setRosterQuery("");
    setGenreFilter("");
    setStatusFilter("all");
    setFavOnly(false);
    setRatedFilter("all");
    setAlbumSort("default");
  };
  // Genre lives on the artist, so it narrows which artists show. Album-level
  // filters then require at least one surviving album (but with no album filters
  // active we keep album-less artists so you can still add to them).
  const shownArtists = data.artists.filter(
    (a) =>
      (!genreFilter || a.genre === genreFilter) &&
      (!anyAlbumFilterActive || visibleAlbumsOf(a).length > 0),
  );
  const shownAlbumCount = shownArtists.reduce((n, a) => n + visibleAlbumsOf(a).length, 0);
  const allAlbumIds = data.artists.flatMap((a) => a.albums.map((al) => al.id));
  const allCollapsed = allAlbumIds.every((id) => !albumOpen[id]);
  const toggleAllAlbums = () => {
    const open = allCollapsed;
    setAlbumOpen(() => {
      const next: Record<string, boolean> = {};
      for (const id of allAlbumIds) next[id] = open;
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle kicker="Mission control" title="The Editor" />
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/settings")} className="rounded-lg border border-edge px-3 py-1.5 text-sm font-semibold text-zinc-300 hover:text-white">
            ⚙ Profile & sharing
          </button>
          <button onClick={exportJson} className="rounded-lg border border-edge px-3 py-1.5 text-sm font-semibold text-zinc-300 hover:text-white">
            ⬇ Export backup
          </button>
        </div>
      </div>

      <p className="text-sm text-zinc-500">
        Every change saves to your account instantly. Your goal — {" "}
        <span className="text-gold">{fmtHours(computeStats(data).totalRuntimeHours)}</span> of total runtime — grows
        as you add albums. Set your season, goal and visibility in{" "}
        <button onClick={() => navigate("/settings")} className="text-gold hover:underline">Settings</button>.
      </p>

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
          <button onClick={importArtist} disabled={lookupBusy || !newArtist.name.trim()} className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-black hover:brightness-110 disabled:opacity-40">
            {lookupBusy ? "🔎 Searching…" : "🔎 Import from MusicBrainz"}
          </button>
          <button onClick={addArtist} className="rounded-lg border border-edge px-4 py-2 text-sm font-semibold text-zinc-300 hover:text-white">
            + Add blank artist
          </button>
          {lookupMsg && <span className="text-xs text-zinc-400">{lookupMsg}</span>}
        </div>
        <p className="text-xs leading-relaxed text-zinc-500">
          <span className="text-zinc-300">Import from MusicBrainz</span> auto-fills the full studio discography
          with real album covers (free, open-data — no API key). Or add a blank artist and fill it in by hand.
        </p>
      </Panel>

      {/* Bulk import */}
      <Panel className="space-y-3 p-5">
        <h3 className="font-display text-lg font-black text-white">Bulk Import from MusicBrainz</h3>
        <p className="text-xs leading-relaxed text-zinc-500">
          Paste one artist per line. Each is looked up on MusicBrainz (~1.5s apiece to stay polite), names already
          in your roster are skipped, and full studio discographies arrive with covers.
        </p>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          disabled={bulkImporting}
          rows={6}
          placeholder={"50 Cent\nAlice in Chains\nBig Thief\nTool\n…"}
          className={`${inputCls} w-full font-mono`}
        />
        <button onClick={bulkImport} disabled={bulkImporting || !bulkText.trim()} className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-black hover:brightness-110 disabled:opacity-40">
          {bulkImporting ? "⏳ Importing… (don't close this tab)" : "⇊ Import all from MusicBrainz"}
        </button>
        {bulkLog.length > 0 && (
          <div className="max-h-56 space-y-0.5 overflow-auto rounded-lg border border-edge bg-panel-2/60 p-3 font-mono text-xs text-zinc-400">
            {bulkLog.map((l, i) => (
              <div key={i} className={l.includes("✓") ? "text-emerald-400" : l.includes("✗") ? "text-dean" : ""}>
                {l}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Manage artists */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display text-lg font-black text-white">Roster ({data.artists.length})</h3>
          <input
            value={rosterQuery}
            onChange={(e) => setRosterQuery(e.target.value)}
            placeholder="Search artists or albums…"
            className={`${inputCls} flex-1 sm:max-w-xs`}
          />
          {allAlbumIds.length > 0 && (
            <button onClick={toggleAllAlbums} className="rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-white">
              {allCollapsed ? "⤢ Expand all albums" : "⤡ Collapse to album names"}
            </button>
          )}
        </div>
        {/* Filters + sort — narrow the roster and order albums within each artist. */}
        <div className="flex flex-wrap items-center gap-2">
          {genreOptions.length > 0 && (
            <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)} className={selectCls} title="Filter by genre">
              <option value="">All genres</option>
              {genreOptions.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | AlbumStatus)} className={selectCls} title="Filter by status">
            <option value="all">Any status</option>
            <option value="want">Want</option>
            <option value="listening">Listening</option>
            <option value="completed">Done</option>
          </select>
          <select value={ratedFilter} onChange={(e) => setRatedFilter(e.target.value as "all" | "rated" | "unrated")} className={selectCls} title="Filter by rating">
            <option value="all">Rated &amp; unrated</option>
            <option value="rated">Rated only</option>
            <option value="unrated">Unrated only</option>
          </select>
          <button
            onClick={() => setFavOnly((v) => !v)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${favOnly ? "bg-gold text-black" : "border border-edge text-zinc-400 hover:text-white"}`}
            title="Show favorites only"
          >
            ⭐ Favorites
          </button>
          <select value={albumSort} onChange={(e) => setAlbumSort(e.target.value as typeof albumSort)} className={selectCls} title="Sort albums within each artist">
            <option value="default">Sort: default</option>
            <option value="title">Title A–Z</option>
            <option value="year">Year (new→old)</option>
            <option value="rating">Rating (high→low)</option>
            <option value="date">Recently listened</option>
          </select>
          {anyFilterActive && (
            <>
              <span className="text-xs text-zinc-500">
                {shownArtists.length} artist{shownArtists.length === 1 ? "" : "s"} · {shownAlbumCount} album{shownAlbumCount === 1 ? "" : "s"}
              </span>
              <button onClick={clearFilters} className="rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-white">
                Clear filters
              </button>
            </>
          )}
        </div>
        {shownArtists.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500">
            {data.artists.length === 0
              ? "No artists yet — add your first above."
              : q
                ? `No artists or albums match “${rosterQuery.trim()}”.`
                : "No artists or albums match your filters."}
          </p>
        )}
        {shownArtists.map((artist: Artist) => (
          <Panel key={artist.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-black text-white">{artist.name}</span>
                {artist.logged && <LoggedBadge />}
                <span className="ml-1 text-xs text-zinc-500">
                  {artist.genre} · {artist.albums.length}/{artist.catalogSize} albums
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setArtist(artist.id, { logged: !artist.logged })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    artist.logged
                      ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                      : "border border-edge text-zinc-300 hover:text-white"
                  }`}
                  title={
                    artist.logged
                      ? "In your Library (already heard — out of the marathon). Click to move into the marathon."
                      : "A marathon artist. Click to move to your Library (already heard)."
                  }
                >
                  {artist.logged ? "📚 Library" : "🏃 Marathon"}
                </button>
                <button
                  onClick={() => setArtistPanelOpen((s) => ({ ...s, [artist.id]: !s[artist.id] }))}
                  className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-gold hover:brightness-110"
                  title="Set an overall verdict and who recommended this artist"
                >
                  {artistPanelOpen[artist.id] ? "▾ Verdict & credit" : "★ Verdict & credit"}
                </button>
                <button onClick={() => refreshMeta(artist)} disabled={metaBusy[artist.id]} className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-gold hover:brightness-110 disabled:opacity-50" title="Update genre, country & catalog size from MusicBrainz">
                  {metaBusy[artist.id] ? "↻ …" : "↻ Genre & country"}
                </button>
                <button onClick={() => loadAllTracks(artist)} className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-gold hover:brightness-110" title="Fetch tracklists for every album from MusicBrainz">
                  🎵 Load all tracklists
                </button>
                {artist.albums.length > 0 && (
                  <button
                    onClick={() => {
                      const open = artist.albums.every((a) => albumOpen[a.id]);
                      setAlbumOpen((s) => {
                        const next = { ...s };
                        for (const a of artist.albums) next[a.id] = !open;
                        return next;
                      });
                    }}
                    className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white"
                  >
                    {artist.albums.every((a) => albumOpen[a.id]) ? "⤡ Collapse all" : "⤢ Expand all"}
                  </button>
                )}
                <button onClick={() => removeArtist(artist.id)} className="text-xs text-zinc-600 hover:text-dean">
                  Remove
                </button>
              </div>
            </div>
            {bulkTracks[artist.id] && <p className="mt-2 text-xs text-zinc-400">{bulkTracks[artist.id]}</p>}

            {artistPanelOpen[artist.id] && (
              <div className="mt-3 grid gap-4 rounded-xl border border-edge/60 bg-panel-2/40 p-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Overall verdict
                  </div>
                  <div className="flex items-center gap-2">
                    <DeanMeter value={artist.verdict} size={34} />
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.1}
                      value={artist.verdict ?? 0}
                      onChange={(e) => setArtist(artist.id, { verdict: Number(e.target.value) })}
                      className="h-6 flex-1 cursor-pointer accent-gold"
                      title="One overall score for the whole artist"
                    />
                    <span className="w-8 text-right text-xs font-bold text-gold">
                      {artist.verdict != null ? artist.verdict.toFixed(1) : "—"}
                    </span>
                    {artist.verdict != null && (
                      <button
                        onClick={() => setArtist(artist.id, { verdict: null })}
                        className="text-xs text-zinc-600 hover:text-dean"
                        title="Clear verdict"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <input
                    className={`${inputCls} w-full`}
                    placeholder="A line on why…"
                    value={artist.verdictNote}
                    onChange={(e) => setArtist(artist.id, { verdictNote: e.target.value })}
                  />
                </div>
                <RecommenderPicker artist={artist} setArtist={setArtist} />
              </div>
            )}

            <div className="mt-3 space-y-2">
              {visibleAlbumsOf(artist).map((al) => (
                <div key={al.id} className={`overflow-hidden rounded-xl border border-edge/60 bg-panel-2/60 ${al.excluded ? "opacity-60" : ""}`}>
                  <button onClick={() => setAlbumOpen((s) => ({ ...s, [al.id]: !s[al.id] }))} className="flex w-full items-center gap-2 p-3 text-left hover:bg-white/5">
                    <span className="w-3 shrink-0 text-xs text-zinc-500">{albumOpen[al.id] ? "▾" : "▸"}</span>
                    <Cover size="xs" colors={al.cover} title={al.title} coverUrl={al.coverUrl} />
                    <span className="flex-1 truncate text-sm font-semibold text-white">
                      {al.title} <span className="font-normal text-zinc-600">{al.year ?? ""}</span>
                    </span>
                    {al.excluded && <span className="shrink-0 text-xs text-dean" title="Excluded">🚫</span>}
                    {al.favorite && <span className="shrink-0 text-xs" title="Favorite">⭐</span>}
                    <span className="hidden shrink-0 text-xs text-zinc-600 sm:inline">{al.tracks.length} trk</span>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      title={al.status}
                      style={{ background: al.status === "completed" ? "#34d399" : al.status === "listening" ? "#f5c518" : "#52525b" }}
                    />
                    <span className="w-9 shrink-0 text-right font-display text-sm font-black tabular-nums" style={{ color: scoreColor(al.rating) }}>
                      {al.rating != null ? al.rating.toFixed(1) : "—"}
                    </span>
                  </button>

                  {albumOpen[al.id] && (
                    <div className="border-t border-edge/50 p-3">
                      <div className="flex items-center justify-end">
                        <div className="flex items-center gap-3">
                          <button onClick={() => fetchCover(artist, al)} disabled={coverBusy[al.id]} className="text-xs font-semibold text-gold hover:brightness-110 disabled:opacity-50" title="Fetch cover art from the Cover Art Archive">
                            {coverBusy[al.id] ? "🎨 …" : al.coverUrl ? "🎨 Refresh cover" : "🎨 Find cover"}
                          </button>
                          <button onClick={() => fetchTracks(artist, al)} disabled={trackBusy[al.id]} className="text-xs font-semibold text-gold hover:brightness-110 disabled:opacity-50" title="Fetch this album's tracklist from MusicBrainz">
                            {trackBusy[al.id] ? "🎵 …" : al.tracks.length ? "🎵 Reload tracks" : "🎵 Get tracks"}
                          </button>
                          <button onClick={() => removeAlbum(artist.id, al.id)} className="text-xs text-zinc-600 hover:text-dean">
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {(["want", "listening", "completed"] as AlbumStatus[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => setAlbumStatus(al, s)}
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${al.status === s ? "bg-gold text-black" : "border border-edge text-zinc-400 hover:text-white"}`}
                          >
                            {s === "want" ? "Want" : s === "listening" ? "Listening" : "Done"}
                          </button>
                        ))}
                        <button onClick={() => setAlbum(al.id, { favorite: !al.favorite })} className="text-base transition-transform hover:scale-110" title="Favorite album">
                          {al.favorite ? "⭐" : "☆"}
                        </button>
                        <button
                          onClick={() => setAlbum(al.id, { excluded: !al.excluded })}
                          className={`rounded-md px-2 py-1 text-xs font-semibold ${al.excluded ? "bg-dean/20 text-dean ring-1 ring-dean/40" : "border border-edge text-zinc-500 hover:text-white"}`}
                          title="Exclude from the marathon (won't count toward runtime or progress)"
                        >
                          {al.excluded ? "🚫 Excluded" : "Exclude"}
                        </button>
                        <div className="ml-auto flex items-center gap-2">
                          <DeanMeter value={al.rating} size={34} />
                          <input
                            type="range"
                            min={0}
                            max={10}
                            step={0.1}
                            value={al.rating ?? 0}
                            onChange={(e) => setAlbum(al.id, { rating: Number(e.target.value) })}
                            className="h-6 w-32 cursor-pointer accent-gold"
                            title={`${data.listener.meterName} Meter — overall album score`}
                          />
                          <span className="w-8 text-right text-xs font-bold text-gold">{al.rating != null ? al.rating.toFixed(1) : "—"}</span>
                        </div>
                      </div>

                      {al.tracks.length > 0 && (
                        <div className="mt-2">
                          <button onClick={() => setExpanded((s) => ({ ...s, [al.id]: !s[al.id] }))} className="text-xs font-semibold text-zinc-400 hover:text-white">
                            {expanded[al.id] ? "▾" : "▸"} {al.tracks.length} tracks — rate songs
                          </button>
                          {expanded[al.id] && (
                            <div className="mt-2 divide-y divide-edge/40 rounded-lg border border-edge/40 bg-panel/40">
                              {al.tracks.map((t, i) => (
                                <div key={t.id} className="flex items-center gap-2 px-2.5 py-1.5">
                                  <span className="w-5 text-right text-xs text-zinc-600">{i + 1}</span>
                                  <span className="flex-1 truncate text-sm text-white">{t.title}</span>
                                  <button onClick={() => setTrack(al.id, t.id, { favorite: !t.favorite })} className="px-1 text-lg leading-none transition-transform hover:scale-110 sm:text-sm" title="Favorite track">
                                    {t.favorite ? "⭐" : "☆"}
                                  </button>
                                  <Score10 value={t.rating} onChange={(v) => setTrack(al.id, t.id, { rating: v })} />
                                  <button onClick={() => removeTrack(artist.id, al.id, t.id)} className="text-zinc-600 hover:text-dean" title="Remove track">
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-2 flex gap-2">
                        <input
                          className={`${inputCls} flex-1`}
                          placeholder="Add a track…"
                          value={trackDraft[`${artist.id}:${al.id}`] ?? ""}
                          onChange={(e) => setTrackDraft((s) => ({ ...s, [`${artist.id}:${al.id}`]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && addTrack(artist.id, al.id)}
                        />
                        <button onClick={() => addTrack(artist.id, al.id)} className="rounded-lg border border-edge px-3 text-sm text-zinc-300 hover:text-white">
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

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
