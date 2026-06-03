import type { Album, Artist, DeanDBData } from "../types";
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_ORDER } from "./achievements";

export interface AlbumWithArtist extends Album {
  artistId: string;
  artistName: string;
  artistColor: [string, string];
  /** True when the host artist is a logged "Library" artist (out of the marathon). */
  artistLogged: boolean;
}

// Stats come in two scopes:
//   • MARATHON scope = forward-looking artists only (logged/library excluded).
//     Drives the meter, goal, queue and "conquered" — logged backlog must not
//     inflate progress.
//   • COLLECTION scope = everything (logged included). Drives ratings, Hall of
//     Fame energy, song counts and taste — a logged favorite is a real rating.
export interface Stats {
  // ── Marathon-scoped ──
  totalMinutesListened: number;
  hoursListened: number;
  /** Total runtime of every tracked MARATHON album — the real "size" of the marathon. */
  totalRuntimeMinutes: number;
  totalRuntimeHours: number;
  /** The goal IS the full marathon runtime (in hours). */
  goalHours: number;
  goalPct: number;
  albumsListening: number;
  albumsWant: number;
  artistsConquered: number; // every owned, non-excluded album completed
  marathonArtistsTotal: number;
  // ── Collection-scoped (logged included) ──
  albumsCompleted: number;
  albumsTotal: number;
  artistsTotal: number;
  libraryArtistsTotal: number;
  songsRated: number;
  favoriteSongs: number;
  avgRating: number | null;
  topGenre: string | null;
}

export function flattenAlbums(data: DeanDBData): AlbumWithArtist[] {
  return data.artists.flatMap((a) =>
    a.albums.map((al) => ({
      ...al,
      artistId: a.id,
      artistName: a.name,
      artistColor: a.color,
      artistLogged: a.logged,
    })),
  );
}

/** Forward-marathon artists (not in the already-heard Library). */
export const marathonArtists = (artists: Artist[]): Artist[] => artists.filter((a) => !a.logged);
/** Already-heard "Library" artists (logged), excluded from the marathon. */
export const libraryArtists = (artists: Artist[]): Artist[] => artists.filter((a) => a.logged);

/**
 * Discography completion for one artist (0–1), measured against the listener's
 * CURATED list — the non-excluded albums they actually track — not the full
 * MusicBrainz catalog. Users add/remove albums, so their list is the source of
 * truth: removing trackless/empty albums shrinks the denominator. (catalogSize
 * stays as informational "MB knows of N" metadata only.)
 */
export function artistProgress(artist: Artist): number {
  const tracked = artist.albums.filter((a) => !a.excluded);
  const completed = tracked.filter((a) => a.status === "completed").length;
  const denom = Math.max(tracked.length, 1);
  return Math.min(completed / denom, 1);
}

export function computeStats(data: DeanDBData): Stats {
  // Excluded albums (e.g. ones Dean will never finish) are out of all math.
  const collection = flattenAlbums(data).filter((a) => !a.excluded);
  // The marathon ignores logged "Library" artists entirely.
  const marathon = collection.filter((a) => !a.artistLogged);

  // ── Marathon scope: progress, goal, queue ──
  const marathonCompleted = marathon.filter((a) => a.status === "completed");
  const totalMinutes = marathonCompleted.reduce((sum, a) => sum + (a.minutes || 0), 0);
  const hours = totalMinutes / 60;
  // The goal is the actual total runtime of everything in the marathon.
  const runtimeMinutes = marathon.reduce((sum, a) => sum + (a.minutes || 0), 0);

  // Conquered = a marathon artist whose every curated (non-excluded) album is
  // completed. Keyed on the user's list, not catalogSize, so it agrees with
  // artistProgress hitting 100% (removing trackless albums can't block conquest).
  const artistsConquered = data.artists.filter((a) => {
    const tracked = a.albums.filter((al) => !al.excluded);
    return !a.logged && tracked.length > 0 && tracked.every((al) => al.status === "completed");
  }).length;

  // ── Collection scope: ratings, songs, taste (logged included) ──
  const collectionCompleted = collection.filter((a) => a.status === "completed");
  const rated = collectionCompleted.filter((a) => a.rating != null);
  const avgRating =
    rated.length > 0
      ? rated.reduce((s, a) => s + (a.rating as number), 0) / rated.length
      : null;

  const songsRated = collection.reduce(
    (s, a) => s + a.tracks.filter((t) => t.rating != null).length,
    0,
  );
  const favoriteSongs = collection.reduce(
    (s, a) => s + a.tracks.filter((t) => t.favorite).length,
    0,
  );

  // Collection-scoped on purpose: top genre reflects overall taste, so logged
  // Library artists' completed albums still count here (like avgRating).
  const genreCounts = new Map<string, number>();
  for (const artist of data.artists) {
    const c = artist.albums.filter((a) => a.status === "completed").length;
    if (c > 0) genreCounts.set(artist.genre, (genreCounts.get(artist.genre) ?? 0) + c);
  }
  const topGenre =
    [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const libraryArtistsTotal = libraryArtists(data.artists).length;

  return {
    // Marathon-scoped
    totalMinutesListened: totalMinutes,
    hoursListened: hours,
    totalRuntimeMinutes: runtimeMinutes,
    totalRuntimeHours: runtimeMinutes / 60,
    goalHours: runtimeMinutes / 60,
    goalPct: runtimeMinutes > 0 ? Math.min((totalMinutes / runtimeMinutes) * 100, 100) : 0,
    albumsListening: marathon.filter((a) => a.status === "listening").length,
    albumsWant: marathon.filter((a) => a.status === "want").length,
    artistsConquered,
    marathonArtistsTotal: data.artists.length - libraryArtistsTotal,
    // Collection-scoped
    albumsCompleted: collectionCompleted.length,
    albumsTotal: collection.length,
    artistsTotal: data.artists.length,
    libraryArtistsTotal,
    songsRated,
    favoriteSongs,
    avgRating,
    topGenre,
  };
}

// ── Achievements ────────────────────────────────────────────────
export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  unlocked: boolean;
  /** Optional progress text shown while locked, e.g. "12 / 50 hrs". */
  progress?: string;
  /** Secret achievements stay masked ("???") until they unlock. */
  hidden?: boolean;
}

export function computeAchievements(data: DeanDBData, stats: Stats): Achievement[] {
  const albumsF = flattenAlbums(data).filter((a) => !a.excluded);
  const completedF = albumsF.filter((a) => a.status === "completed");
  const hasPerfectScore = albumsF.some((a) => a.rating === 10);
  // Endurance Test requires *completing* a >90min album — only completed albums count.
  const longestAlbum = Math.max(0, ...completedF.map((a) => a.minutes));
  const distinctGenres = new Set(
    data.artists
      .filter((a) => a.albums.some((al) => al.status === "completed"))
      .map((a) => a.genre),
  ).size;

  // ── Secret-achievement signals ──
  const decades = new Set(
    completedF.filter((a) => a.year).map((a) => Math.floor((a.year as number) / 10)),
  ).size;
  const countries = new Set(
    data.artists.filter((a) => a.albums.some((al) => al.status === "completed")).map((a) => a.country),
  ).size;
  const perfectSong = albumsF.some((a) => a.tracks.some((t) => t.rating === 10));
  const fullyRatedAlbum = completedF.some(
    (a) => a.tracks.length > 0 && a.tracks.every((t) => t.rating != null),
  );
  const harshCritic = albumsF.some((a) => a.rating != null && a.rating < 2);
  const wordsmith = albumsF.some((a) => a.review.trim().length >= 280);

  // Dynamic unlock signals per id. Presentation (emoji/title/desc/hidden) comes
  // from the shared ACHIEVEMENT_CATALOG so the Dashboard and the social Feed
  // (which only has an achievement_id) can never desync.
  const signals: Record<string, { unlocked: boolean; progress?: string }> = {
    "first-spin": { unlocked: stats.albumsCompleted >= 1 },
    "ten-down": { unlocked: stats.albumsCompleted >= 10, progress: `${stats.albumsCompleted} / 10` },
    "discography-slayer": { unlocked: stats.artistsConquered >= 1 },
    "genre-hopper": { unlocked: distinctGenres >= 4, progress: `${distinctGenres} / 4 genres` },
    "perfect-ten": { unlocked: hasPerfectScore },
    "marathoner-25": { unlocked: stats.hoursListened >= 25, progress: `${stats.hoursListened.toFixed(1)} / 25 hrs` },
    "marathoner-100": { unlocked: stats.hoursListened >= 100, progress: `${stats.hoursListened.toFixed(1)} / 100 hrs` },
    "the-summit": {
      unlocked: stats.totalRuntimeMinutes > 0 && stats.hoursListened >= stats.goalHours,
      progress: `${stats.hoursListened.toFixed(1)} / ${stats.goalHours.toFixed(1)} hrs`,
    },
    endurance: { unlocked: longestAlbum > 90 },
    completionist: { unlocked: fullyRatedAlbum },
    "time-traveler": { unlocked: decades >= 5 },
    globetrotter: { unlocked: countries >= 5 },
    flawless: { unlocked: perfectSong },
    "tough-crowd": { unlocked: harshCritic },
    "the-essayist": { unlocked: wordsmith },
  };

  return ACHIEVEMENT_ORDER.map((id) => {
    const meta = ACHIEVEMENT_CATALOG[id];
    // Fallback guards against catalog/signals drift (a new catalog id with no
    // signal entry renders as locked rather than throwing).
    const sig = signals[id] ?? { unlocked: false };
    // perfect-ten personalizes its description with the listener's meter name.
    const desc =
      id === "perfect-ten" ? `Award a 10.0 on the ${data.listener.meterName} Meter.` : meta.desc;
    return {
      id,
      emoji: meta.emoji,
      title: meta.title,
      desc,
      hidden: meta.hidden,
      unlocked: sig.unlocked,
      progress: sig.progress,
    };
  });
}
