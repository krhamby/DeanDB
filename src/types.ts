// ──────────────────────────────────────────────────────────────
// DeanDB data model
// The shape of Dean's entire marathon lives here. The JSON file in
// /public/data/deandb.json conforms to `DeanDBData`.
// ──────────────────────────────────────────────────────────────

export type AlbumStatus = "want" | "listening" | "completed";

export interface Track {
  id: string;
  title: string;
  /** Per-listener song score on the 0–10 scale (the Score10 control). null = unrated. */
  rating: number | null;
  favorite: boolean;
}

export interface Album {
  id: string;
  title: string;
  year: number | null;
  /** Two hex colors used to auto-generate a unique cover gradient (fallback). */
  cover: [string, string];
  /** Real cover art URL (e.g. from the Cover Art Archive). Falls back to the gradient. */
  coverUrl?: string;
  /** MusicBrainz release-group id, if matched, for re-fetching art/metadata. */
  mbid?: string;
  /** Excluded albums are kept for reference but don't count toward the marathon. */
  excluded?: boolean;
  status: AlbumStatus;
  /** "The Dean Meter" — Dean's overall album score, 0.0–10.0. null = unrated. */
  rating: number | null;
  review: string;
  /** Runtime / time Dean spent on this album, in minutes. Fuels the 250h marathon bar. */
  minutes: number;
  /** ISO date string of when Dean finished it. */
  dateListened: string | null;
  favorite: boolean;
  tracks: Track[];
}

export interface Artist {
  id: string;
  name: string;
  genre: string;
  country: string;
  /** Two hex colors for the artist's signature gradient. */
  color: [string, string];
  /** Total albums in the artist's catalog (for discography % even before all are added). */
  catalogSize: number;
  bio: string;
  /** MusicBrainz artist id, if matched, for catalog lookups. */
  mbid?: string;
  /**
   * Logged = an already-listened "Library" artist (a backlog the listener
   * heard long ago), as opposed to a forward-looking marathon artist. Logged
   * artists keep their ratings/reviews/favorites and count toward the
   * collection (Hall of Fame, community averages), but are EXCLUDED from the
   * marathon: goal hours, the progress meter, the Marathon Wheel queue,
   * "Now Spinning" and "Up Next". Defaults to false (a marathon artist).
   */
  logged: boolean;
  /** Overall score for the whole artist on the 0–10 Dean Meter. null = none. */
  verdict: number | null;
  /** Optional short note accompanying the verdict. */
  verdictNote: string;
  /**
   * Who recommended this artist to the listener (optional). May reference an
   * on-platform profile and/or carry a free-text name for someone off-platform.
   */
  recommendedBy?: {
    userId: string | null;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    text: string;
  };
  albums: Album[];
}

export interface DeanDBData {
  /** Branding + the human this journey belongs to. */
  listener: {
    name: string;
    handle: string;
    tagline: string;
  };
  /** The legendary goal, in hours. */
  goalHours: number;
  /** Free-form "season" label, e.g. "The 2026 Marathon". */
  season: string;
  artists: Artist[];
}

// ──────────────────────────────────────────────────────────────
// Accounts & social model (multi-user platform)
// ──────────────────────────────────────────────────────────────

export type Visibility = "private" | "public";
export type FollowStatus = "pending" | "accepted";

/** A user's public-facing identity + journey settings (the `profiles` row). */
export interface Profile {
  id: string;
  username: string;
  displayName: string;
  handle: string | null;
  tagline: string;
  bio: string;
  avatarUrl: string | null;
  season: string;
  goalHours: number;
  visibility: Visibility;
}

/** A person surfaced by search, with my relationship to them. */
export interface PersonResult {
  profile: Profile;
  /** My follow edge toward them, if any. */
  followStatus: FollowStatus | null;
  /** True if they have an accepted edge toward me (they follow me). */
  followsMe: boolean;
}

/** One activity-feed entry (a recent rating / status change by someone I follow). */
export interface FeedItem {
  userAlbumId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  albumId: string;
  albumTitle: string;
  cover: [string, string];
  coverUrl: string | null;
  artistId: string;
  artistName: string;
  status: AlbumStatus;
  rating: number | null;
  review: string;
  favorite: boolean;
  /** True when the album's artist is a logged/library artist — changes the feed verb. */
  logged: boolean;
  updatedAt: string;
}

/** A recommendation sent from one user to another (about an album or an artist). */
export interface Recommendation {
  id: string;
  fromUser: string;
  fromUsername: string;
  fromDisplayName: string;
  toUser: string;
  albumId: string | null;
  albumTitle: string | null;
  artistId: string;
  artistName: string;
  note: string;
  createdAt: string;
  readAt: string | null;
}

/** Cross-user community rating for an album (shown on the album page). */
export interface AlbumAggregate {
  avgRating: number | null;
  listenerCount: number;
}
