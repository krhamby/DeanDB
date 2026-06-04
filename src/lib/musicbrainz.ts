// ──────────────────────────────────────────────────────────────
// MusicBrainz + Cover Art Archive
//
// Both are free, open-data, no-API-key services that work from a static
// site in the browser:
//   • MusicBrainz (https://musicbrainz.org) — the open music encyclopedia.
//     Its /ws/2 JSON API sends `Access-Control-Allow-Origin: *`, so we can
//     fetch it directly. Etiquette: ~1 request/second.
//   • Cover Art Archive (https://coverartarchive.org) — album art keyed by
//     MusicBrainz release-group id. Image URLs drop straight into <img>
//     (images aren't subject to CORS), so no key or proxy is needed.
// ──────────────────────────────────────────────────────────────

const MB = "https://musicbrainz.org/ws/2";

/** Cover Art Archive front-cover URL for a release-group MBID (250px). */
export function coverArtUrl(releaseGroupMbid: string): string {
  return `https://coverartarchive.org/release-group/${releaseGroupMbid}/front-250`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Global rate limiter ─────────────────────────────────────────
// MusicBrainz asks for ~1 request/second and returns 503 when exceeded.
// Every call funnels through this serial queue so requests are spaced out
// no matter how many imports fire at once. 503/429 get retried with backoff.
const MIN_INTERVAL_MS = 1100;
let lastStarted = 0;
let queue: Promise<unknown> = Promise.resolve();

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastStarted);
    if (wait > 0) await sleep(wait);
    lastStarted = Date.now();
    return task();
  });
  // Keep the chain alive even if a task rejects.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function mbGet<T>(path: string): Promise<T> {
  const url = `${MB}${path}${path.includes("?") ? "&" : "?"}fmt=json`;
  return schedule(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 503 || res.status === 429) {
        // Rate limited — back off and retry inside our own queue slot.
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
      return (await res.json()) as T;
    }
    throw new Error("MusicBrainz rate limit — try again in a moment");
  });
}

const yearOf = (date?: string): number | null => {
  const y = date?.slice(0, 4);
  return y && /^\d{4}$/.test(y) ? Number(y) : null;
};

const lucene = (s: string) => s.replace(/["\\]/g, " ").trim();

interface RGSearch {
  "release-groups"?: Array<{
    id: string;
    title: string;
    "first-release-date"?: string;
    "primary-type"?: string;
  }>;
}

export interface AlbumMatch {
  mbid: string;
  title: string;
  year: number | null;
  coverUrl: string;
}

/** Find the best release-group match for an artist + album, with its cover. */
export async function findAlbumCover(
  artist: string,
  title: string,
): Promise<AlbumMatch | null> {
  const q = `releasegroup:"${lucene(title)}" AND artist:"${lucene(artist)}"`;
  const json = await mbGet<RGSearch>(
    `/release-group/?query=${encodeURIComponent(q)}&limit=5`,
  );
  const groups = json["release-groups"] ?? [];
  // Prefer an actual Album over singles/EPs/compilations when present.
  const best = groups.find((g) => g["primary-type"] === "Album") ?? groups[0];
  if (!best) return null;
  return {
    mbid: best.id,
    title: best.title,
    year: yearOf(best["first-release-date"]),
    coverUrl: coverArtUrl(best.id),
  };
}

interface ReleaseBrowse {
  releases?: Array<{
    id: string;
    "track-count"?: number;
    media?: Array<{ format?: string; tracks?: Array<{ title: string; position: number; length?: number }> }>;
  }>;
}

export interface Tracklist {
  titles: string[];
  /** Total runtime in minutes (0 if MusicBrainz has no track lengths). */
  runtimeMin: number;
}

/**
 * Fetch a tracklist for a release-group. MusicBrainz stores tracks on
 * *releases* (specific editions), so we grab an official release in the group
 * and read its media → tracks. Returns titles in order plus total runtime.
 */
export async function fetchTracklist(releaseGroupMbid: string): Promise<Tracklist> {
  const json = await mbGet<ReleaseBrowse>(
    `/release?release-group=${releaseGroupMbid}&inc=recordings&status=official&limit=25`,
  );
  const releases = json.releases ?? [];
  if (releases.length === 0) return { titles: [], runtimeMin: 0 };
  // A release-group can include box-set / "collection" releases that bundle
  // several physical media (e.g. 2×CD + DVD + vinyl + cassette). The old
  // "most tracks wins" rule picked those and concatenated every medium → a
  // 70-track album full of repeats. Prefer the DIGITAL ("online") release — a
  // single "Digital Media" edition carries the canonical tracklist and never
  // bundles formats — and otherwise fall back to the release with the FEWEST
  // media (a standard single edition; ties broken by track count). Box sets
  // always lose; a genuine multi-disc album still reads all its discs below.
  const digital = releases.filter((r) => (r.media ?? []).some((m) => m.format === "Digital Media"));
  const pool = digital.length ? digital : releases;
  const best = pool.reduce((a, b) => {
    const am = a.media?.length ?? 99;
    const bm = b.media?.length ?? 99;
    if (am !== bm) return bm < am ? b : a;
    return (b["track-count"] ?? 0) > (a["track-count"] ?? 0) ? b : a;
  });
  const titles: string[] = [];
  let ms = 0;
  for (const m of best.media ?? []) {
    for (const t of m.tracks ?? []) {
      titles.push(t.title);
      ms += t.length ?? 0;
    }
  }
  return { titles, runtimeMin: Math.round(ms / 60000) };
}

interface ArtistSearch {
  artists?: Array<{ id: string; name: string; country?: string }>;
}

interface Tagged {
  name: string;
  country?: string;
  area?: { name?: string };
  genres?: Array<{ name: string; count: number }>;
  tags?: Array<{ name: string; count: number }>;
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Best genre from MusicBrainz's community genres, falling back to tags. */
function pickGenre(d: Tagged): string | null {
  const top = (arr?: Array<{ name: string; count: number }>) =>
    arr && arr.length ? [...arr].sort((a, b) => b.count - a.count)[0].name : null;
  const g = top(d.genres) ?? top(d.tags);
  return g ? titleCase(g) : null;
}

const readableCountry = (d: Tagged): string | null => d.area?.name ?? d.country ?? null;

/** Genre + readable country for an artist (extra MusicBrainz call). */
async function artistMeta(mbid: string): Promise<{ genre: string | null; country: string | null }> {
  const d = await mbGet<Tagged>(`/artist/${mbid}?inc=genres+tags`);
  return { genre: pickGenre(d), country: readableCountry(d) };
}

async function studioCount(mbid: string): Promise<number> {
  // Search (not browse) so the studio-only filter lives in the query: this drops
  // live/compilation/mixtape/etc. at the source and — crucially — avoids the
  // 100-row browse truncation that can hide real studio albums for artists whose
  // comp/live catalog fills the page. -secondarytype:* = "no secondary type".
  const q = `arid:${mbid} AND primarytype:album AND -secondarytype:*`;
  const search = await mbGet<RGBrowse>(`/release-group?query=${encodeURIComponent(q)}&limit=100`);
  return (search["release-groups"] ?? []).filter(
    (g) => !g["secondary-types"] || g["secondary-types"].length === 0,
  ).length;
}

/** Re-pull genre, country, and catalog size for an already-matched artist. */
export async function refreshArtistMeta(
  mbid: string,
): Promise<{ genre: string | null; country: string | null; catalogSize: number }> {
  const [meta, catalogSize] = await Promise.all([artistMeta(mbid), studioCount(mbid)]);
  return { ...meta, catalogSize };
}

interface RGBrowse {
  "release-groups"?: Array<{
    id: string;
    title: string;
    "first-release-date"?: string;
    "secondary-types"?: string[];
  }>;
}

export interface ArtistMatch {
  mbid: string;
  name: string;
  country: string | null;
  /** Top community genre, if MusicBrainz has one. */
  genre: string | null;
  /** Count of studio albums (excludes live/compilation/etc.). */
  catalogSize: number;
  /** Studio albums, oldest first, with covers ready to import. */
  albums: AlbumMatch[];
}

/** Look up an artist and their studio-album discography from MusicBrainz. */
export async function lookupArtist(name: string): Promise<ArtistMatch | null> {
  const search = await mbGet<ArtistSearch>(
    `/artist/?query=artist:"${lucene(name)}"&limit=1`,
  );
  const hit = search.artists?.[0];
  if (!hit) return null;

  // Genre/country come from a detail call; failures shouldn't block the import.
  let meta: { genre: string | null; country: string | null } = {
    genre: null,
    country: hit.country ?? null,
  };
  try {
    meta = await artistMeta(hit.id);
  } catch {
    /* keep the search-result country */
  }

  // Studio albums only. Use the search endpoint with the filter IN the query
  // (arid + primarytype:album + -secondarytype:*) instead of browsing every
  // album-type group and culling client-side: this excludes live/compilation/
  // mixtape/etc. at the source and avoids the 100-row browse truncation that can
  // drop real studio albums for artists with large comp/live catalogs. The
  // client-side secondary-type filter stays as a guard against search-index lag.
  // NOTE: this does NOT exclude trackless "phantom" album-type groups (bootlegs
  // with no release/tracks) — those are pruned later when tracklists are loaded.
  const q = `arid:${hit.id} AND primarytype:album AND -secondarytype:*`;
  const browse = await mbGet<RGBrowse>(
    `/release-group?query=${encodeURIComponent(q)}&limit=100`,
  );
  const studio = (browse["release-groups"] ?? [])
    .filter((g) => !g["secondary-types"] || g["secondary-types"].length === 0)
    .sort((a, b) =>
      (a["first-release-date"] ?? "9999").localeCompare(b["first-release-date"] ?? "9999"),
    );

  return {
    mbid: hit.id,
    name: hit.name,
    country: meta.country ?? hit.country ?? null,
    genre: meta.genre,
    catalogSize: studio.length,
    albums: studio.map((g) => ({
      mbid: g.id,
      title: g.title,
      year: yearOf(g["first-release-date"]),
      coverUrl: coverArtUrl(g.id),
    })),
  };
}
