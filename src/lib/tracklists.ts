// ──────────────────────────────────────────────────────────────
// Background tracklist loading.
//
// After an artist is imported, their albums arrive trackless (just covers).
// This fills in tracklists + real runtimes from MusicBrainz. Every call funnels
// through musicbrainz.ts's shared ~1 req/sec serial queue, so it's safe to
// fire-and-forget in the background — even with several artists loading at once,
// requests stay spaced out and won't trip MusicBrainz rate limits.
// ──────────────────────────────────────────────────────────────

import { findAlbumCover, fetchTracklist } from "./musicbrainz";
import { setCatalogTracks } from "./api";
import type { Album, Artist } from "../types";

/** Resolve an album's MusicBrainz release-group id (cached on the album, else search). */
async function albumMbid(artistName: string, al: Album): Promise<string | null> {
  return al.mbid ?? (await findAlbumCover(artistName, al.title))?.mbid ?? null;
}

/** One album's freshly-loaded tracklist, ready to apply to the local view. */
export interface LoadedTracklist {
  albumId: string;
  titles: string[];
  trackIds: string[];
  /** Total runtime in minutes (0 when MusicBrainz has no track lengths). */
  runtimeMin: number;
}

/**
 * Fetch + persist tracklists for every album of `artist` that has none, one at a
 * time. `onAlbum` fires after each album's tracks are written to the shared
 * catalog, so the caller can update its local view incrementally. Albums with no
 * MusicBrainz tracklist are left as-is (skipped, not removed).
 */
export async function loadArtistTracklists(
  artist: Artist,
  onAlbum: (loaded: LoadedTracklist) => void,
): Promise<void> {
  for (const al of artist.albums) {
    if (al.tracks.length > 0) continue; // already has tracks
    try {
      const mbid = await albumMbid(artist.name, al);
      if (!mbid) continue;
      const tl = await fetchTracklist(mbid);
      if (!tl.titles.length) continue;
      const trackIds = await setCatalogTracks(al.id, tl.titles);
      onAlbum({ albumId: al.id, titles: tl.titles, trackIds, runtimeMin: tl.runtimeMin });
    } catch {
      /* skip this album; leave it trackless */
    }
  }
}
