import type { Album, Artist, DeanDBData } from "../types";

export interface AlbumWithArtist extends Album {
  artistId: string;
  artistName: string;
  artistColor: [string, string];
}

export interface Stats {
  totalMinutesListened: number;
  hoursListened: number;
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

/** Discography completion for one artist (0–1), based on catalogSize. */
export function artistProgress(artist: Artist): number {
  const completed = artist.albums.filter((a) => a.status === "completed").length;
  const denom = Math.max(artist.catalogSize, artist.albums.length, 1);
  return Math.min(completed / denom, 1);
}

export function computeStats(data: DeanDBData): Stats {
  const albums = flattenAlbums(data);
  const completed = albums.filter((a) => a.status === "completed");
  const totalMinutes = completed.reduce((sum, a) => sum + (a.minutes || 0), 0);
  const hours = totalMinutes / 60;

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
    goalHours: data.goalHours,
    goalPct: Math.min((hours / data.goalHours) * 100, 100),
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
}

export function computeAchievements(data: DeanDBData, stats: Stats): Achievement[] {
  const hasPerfectScore = flattenAlbums(data).some((a) => a.rating === 10);
  const longestAlbum = Math.max(0, ...flattenAlbums(data).map((a) => a.minutes));
  const distinctGenres = new Set(
    data.artists
      .filter((a) => a.albums.some((al) => al.status === "completed"))
      .map((a) => a.genre),
  ).size;

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
      desc: `Reach the ${data.goalHours}-hour goal. The marathon is complete.`,
      unlocked: stats.hoursListened >= data.goalHours,
      progress: `${stats.hoursListened.toFixed(1)} / ${data.goalHours} hrs`,
    },
    {
      id: "endurance",
      emoji: "⏱️",
      title: "Endurance Test",
      desc: "Complete a single album longer than 90 minutes.",
      unlocked: longestAlbum > 90,
    },
  ];
}
