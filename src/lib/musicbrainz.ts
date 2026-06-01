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

async function mbGet<T>(path: string): Promise<T> {
  const res = await fetch(`${MB}${path}${path.includes("?") ? "&" : "?"}fmt=json`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  return (await res.json()) as T;
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
    media?: Array<{ tracks?: Array<{ title: string; position: number }> }>;
  }>;
}

/**
 * Fetch a tracklist for a release-group. MusicBrainz stores tracks on
 * *releases* (specific editions), so we grab an official release in the group
 * and read its media → tracks. Returns track titles in order.
 */
export async function fetchTracklist(releaseGroupMbid: string): Promise<string[]> {
  const json = await mbGet<ReleaseBrowse>(
    `/release?release-group=${releaseGroupMbid}&inc=recordings&status=official&limit=25`,
  );
  const releases = json.releases ?? [];
  if (releases.length === 0) return [];
  // Prefer the release with the most tracks (usually the standard edition,
  // and avoids picking a single/promo that happens to share the group).
  const best = releases.reduce((a, b) =>
    (b["track-count"] ?? 0) > (a["track-count"] ?? 0) ? b : a,
  );
  const titles: string[] = [];
  for (const m of best.media ?? []) {
    for (const t of m.tracks ?? []) titles.push(t.title);
  }
  return titles;
}

interface ArtistSearch {
  artists?: Array<{ id: string; name: string; country?: string }>;
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

  // Studio albums only: primary type Album, no secondary types (live, comp…).
  const browse = await mbGet<RGBrowse>(
    `/release-group?artist=${hit.id}&type=album&limit=100`,
  );
  const studio = (browse["release-groups"] ?? [])
    .filter((g) => !g["secondary-types"] || g["secondary-types"].length === 0)
    .sort((a, b) =>
      (a["first-release-date"] ?? "9999").localeCompare(b["first-release-date"] ?? "9999"),
    );

  return {
    mbid: hit.id,
    name: hit.name,
    country: hit.country ?? null,
    catalogSize: studio.length,
    albums: studio.map((g) => ({
      mbid: g.id,
      title: g.title,
      year: yearOf(g["first-release-date"]),
      coverUrl: coverArtUrl(g.id),
    })),
  };
}
