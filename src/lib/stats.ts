import type { Album, Artist, DeanDBData } from "../types";

export interface AlbumWithArtist extends Album {
  artistId: string;
  artistName: string;
  artistColor: [string, string];
}

export interface Stats {
  totalMinutesListened: number;
  hoursListened: number;
  /** Total runtime of every tracked album — the real "size" of the marathon. */
  totalRuntimeMinutes: number;
  totalRuntimeHours: number;
  /** The goal IS the full runtime (in hours). */
  goalHours: number;
  goalPct: number;
  albumsCompleted: number;
  albumsListening: number;
  albumsWant: number;
  albumsTotal: number;
  artistsTotal: number;
  artistsConquered: number; // every owned album completed AND catalog fully logged
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
    })),
  );
}

/** Discography completion for one artist (0–1). Excluded albums don't count. */
export function artistProgress(artist: Artist): number {
  const tracked = artist.albums.filter((a) => !a.excluded);
  const excludedCount = artist.albums.length - tracked.length;
  const completed = tracked.filter((a) => a.status === "completed").length;
  const denom = Math.max(artist.catalogSize - excludedCount, tracked.length, 1);
  return Math.min(completed / denom, 1);
}

export function computeStats(data: DeanDBData): Stats {
  // Excluded albums (e.g. ones Dean will never finish) are out of all math.
  const albums = flattenAlbums(data).filter((a) => !a.excluded);
  const completed = albums.filter((a) => a.status === "completed");
  const totalMinutes = completed.reduce((sum, a) => sum + (a.minutes || 0), 0);
  const hours = totalMinutes / 60;

  // The goal is the actual total runtime of everything Dean is working through.
  const runtimeMinutes = albums.reduce((sum, a) => sum + (a.minutes || 0), 0);

  const rated = completed.filter((a) => a.rating != null);
  const avgRating =
    rated.length > 0
      ? rated.reduce((s, a) => s + (a.rating as number), 0) / rated.length
      : null;

  const songsRated = albums.reduce(
    (s, a) => s + a.tracks.filter((t) => t.rating != null).length,
    0,
  );
  const favoriteSongs = albums.reduce(
    (s, a) => s + a.tracks.filter((t) => t.favorite).length,
    0,
  );

  const genreCounts = new Map<string, number>();
  for (const artist of data.artists) {
    const c = artist.albums.filter((a) => a.status === "completed").length;
    if (c > 0) genreCounts.set(artist.genre, (genreCounts.get(artist.genre) ?? 0) + c);
  }
  const topGenre =
    [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const artistsConquered = data.artists.filter(
    (a) =>
      a.albums.length > 0 &&
      a.albums.every((al) => al.status === "completed") &&
      a.albums.length >= a.catalogSize,
  ).length;

  return {
    totalMinutesListened: totalMinutes,
    hoursListened: hours,
    totalRuntimeMinutes: runtimeMinutes,
    totalRuntimeHours: runtimeMinutes / 60,
    goalHours: runtimeMinutes / 60,
    goalPct: runtimeMinutes > 0 ? Math.min((totalMinutes / runtimeMinutes) * 100, 100) : 0,
    albumsCompleted: completed.length,
    albumsListening: albums.filter((a) => a.status === "listening").length,
    albumsWant: albums.filter((a) => a.status === "want").length,
    albumsTotal: albums.length,
    artistsTotal: data.artists.length,
    artistsConquered,
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
  const longestAlbum = Math.max(0, ...albumsF.map((a) => a.minutes));
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

  return [
    {
      id: "first-spin",
      emoji: "🎧",
      title: "First Spin",
      desc: "Complete your very first album.",
      unlocked: stats.albumsCompleted >= 1,
    },
    {
      id: "ten-down",
      emoji: "💿",
      title: "Crate Digger",
      desc: "Complete 10 albums.",
      unlocked: stats.albumsCompleted >= 10,
      progress: `${stats.albumsCompleted} / 10`,
    },
    {
      id: "discography-slayer",
      emoji: "🗡️",
      title: "Discography Slayer",
      desc: "Conquer an artist's entire catalog.",
      unlocked: stats.artistsConquered >= 1,
    },
    {
      id: "genre-hopper",
      emoji: "🌍",
      title: "Genre Hopper",
      desc: "Finish albums across 4+ different genres.",
      unlocked: distinctGenres >= 4,
      progress: `${distinctGenres} / 4 genres`,
    },
    {
      id: "perfect-ten",
      emoji: "🏆",
      title: "The Perfect Ten",
      desc: "Award a 10.0 on the Dean Meter.",
      unlocked: hasPerfectScore,
    },
    {
      id: "marathoner-25",
      emoji: "🔥",
      title: "Warmed Up",
      desc: "Log 25 hours of listening.",
      unlocked: stats.hoursListened >= 25,
      progress: `${stats.hoursListened.toFixed(1)} / 25 hrs`,
    },
    {
      id: "marathoner-100",
      emoji: "⚡",
      title: "Triple Digits",
      desc: "Log 100 hours of listening.",
      unlocked: stats.hoursListened >= 100,
      progress: `${stats.hoursListened.toFixed(1)} / 100 hrs`,
    },
    {
      id: "the-summit",
      emoji: "👑",
      title: "The Summit",
      desc: "Listen through the entire tracked runtime. The marathon is complete.",
      unlocked: stats.totalRuntimeMinutes > 0 && stats.hoursListened >= stats.goalHours,
      progress: `${stats.hoursListened.toFixed(1)} / ${stats.goalHours.toFixed(1)} hrs`,
    },
    {
      id: "endurance",
      emoji: "⏱️",
      title: "Endurance Test",
      desc: "Complete a single album longer than 90 minutes.",
      unlocked: longestAlbum > 90,
    },
    {
      id: "completionist",
      emoji: "✅",
      title: "The Completionist",
      desc: "Rate every single track on a completed album.",
      unlocked: fullyRatedAlbum,
    },
    // ── Secret achievements (masked until earned) ──
    {
      id: "time-traveler",
      emoji: "🕰️",
      title: "Time Traveler",
      desc: "Complete albums spanning five different decades.",
      unlocked: decades >= 5,
      hidden: true,
    },
    {
      id: "globetrotter",
      emoji: "🌐",
      title: "Passport Stamped",
      desc: "Finish albums from artists of five different countries.",
      unlocked: countries >= 5,
      hidden: true,
    },
    {
      id: "flawless",
      emoji: "💎",
      title: "Flawless",
      desc: "Award a single song a perfect 10.0.",
      unlocked: perfectSong,
      hidden: true,
    },
    {
      id: "tough-crowd",
      emoji: "🍅",
      title: "Tough Crowd",
      desc: "Rate an album below 2.0. Somebody had to say it.",
      unlocked: harshCritic,
      hidden: true,
    },
    {
      id: "the-essayist",
      emoji: "✍️",
      title: "The Essayist",
      desc: "Write a review of 280+ characters. A true head.",
      unlocked: wordsmith,
      hidden: true,
    },
  ];
}
