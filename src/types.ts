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
  /** Marked as heard — per-song completion for listeners who don't do whole
   *  albums. A rated song always counts as heard (see `isHeard` in stats.ts);
   *  optional so fixtures/legacy shapes default to false. */
  listened?: boolean;
}

export interface Album {
  id: string;
  title: string;
  year: number | null;
  /** Two hex colors used to auto-generate a unique cover gradient (fallback). */
  cover: [string, string];
  /** Real cover art URL (e.g. from the Cover Art Archive). Falls back to the gradient. */
  coverUrl?: string;
  /** Dominant color extracted from the cover art (per-album accent source). null = not yet extracted. */
  dominantColor?: string | null;
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
  /** ISO timestamp of when the album RATING last changed (trigger-maintained,
   *  null = unrated). Drives "Latest Verdicts" recency — dateListened is
   *  day-granular and set once, so it can't order re-ratings. */
  ratedAt?: string | null;
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
    /** Short persona name for journey labels — "Kevin Meter", "Kevin's Review".
     *  The profile header shows the full display name separately (Profile.tsx). */
    meterName: string;
    tagline: string;
  };
  /** The legendary goal, in hours. */
  goalHours: number;
  /** Free-form "season" label, e.g. "The 2026 Marathon". */
  season: string;
  /** Whether this journey runs marathon mode (goal meter, Summit, the Wheel).
   *  false = "chill" — a pressure-free listening journal. Absent = true. */
  marathon?: boolean;
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
  tagline: string;
  bio: string;
  avatarUrl: string | null;
  season: string;
  goalHours: number;
  visibility: Visibility;
  /** Short persona name for journey labels. null = derive from displayName. */
  meterName: string | null;
  /** Primary accent color (hex). null = the default gold. */
  themeAccent: string | null;
  /** Secondary accent color (hex). null = the default "dean" red. */
  themeSecondary: string | null;
  /** Accessibility: when true, only ever apply this user's OWN theme — other
   *  users' profile accent themes are not painted while they browse. */
  lockOwnTheme?: boolean;
  /** Active skin, synced across the account. Defaults to "paper". */
  skin?: "paper" | "midnight";
  /** Marathon mode on/off ("chill"). Absent/true = marathon. */
  marathonEnabled?: boolean;
}

/** A person surfaced by search, with my relationship to them. */
export interface PersonResult {
  profile: Profile;
  /** My follow edge toward them, if any. */
  followStatus: FollowStatus | null;
  /** True if they have an accepted edge toward me (they follow me). */
  followsMe: boolean;
}

/** Album activity: a recent rating / status change by someone I follow. */
export interface AlbumFeedItem {
  kind: "album";
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

/** An achievement unlock by someone I follow. Rendered with secret-masking:
 *  the presentation (emoji/title/desc/hidden) is resolved from the client
 *  ACHIEVEMENT_CATALOG by `achievementId`. */
export interface AchievementFeedItem {
  kind: "achievement";
  achievementRowId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  achievementId: string;
  unlockedAt: string;
}

/** One activity-feed entry — album activity or an achievement unlock. */
export type FeedItem = AlbumFeedItem | AchievementFeedItem;

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

/** One direct message between two users (a `dm_messages` row). */
export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

/** A DM thread summary: the counterparty's public identity + latest message. */
export interface Conversation {
  otherId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  lastBody: string;
  /** Who sent the latest message (me vs. them — drives the "You:" prefix). */
  lastSenderId: string;
  lastAt: string;
  unreadCount: number;
}

/** Someone you can start a DM with (the server's can_dm rule: accepted follow
 *  edge in either direction, no block either way). */
export interface DmContact {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Someone you've blocked (the Settings management list). */
export interface BlockedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string;
}

/** Why a user is being reported (mirrors the `reports.reason` check constraint). */
export type ReportReason = "spam" | "harassment" | "impersonation" | "other";

/** Cross-user community rating for an album (shown on the album page). */
export interface AlbumAggregate {
  avgRating: number | null;
  listenerCount: number;
}

// ──────────────────────────────────────────────────────────────
// Discovery (AI artist suggestions)
// ──────────────────────────────────────────────────────────────

/**
 * One AI-generated, MusicBrainz-validated artist suggestion for the Discover
 * page. A free-tier LLM proposes candidates from the user's prompt; each is then
 * confirmed against MusicBrainz so only real artists reach the UI.
 */
export interface ArtistSuggestion {
  /** Canonical artist name from MusicBrainz. */
  name: string;
  /** MusicBrainz artist id when matched (null if validation couldn't confirm one). */
  mbid: string | null;
  /** Top MusicBrainz genre, if any. */
  genre: string | null;
  /** One-sentence reason this artist fits the prompt. */
  reason: string;
}
