// ──────────────────────────────────────────────────────────────
// DeanDB data model
// The shape of Dean's entire marathon lives here. The JSON file in
// /public/data/deandb.json conforms to `DeanDBData`.
// ──────────────────────────────────────────────────────────────

export type AlbumStatus = "want" | "listening" | "completed";

export interface Track {
  id: string;
  title: string;
  /** Dean's star rating for the individual song, 1–5. null = unrated. */
  rating: number | null;
  favorite: boolean;
}

export interface Album {
  id: string;
  title: string;
  year: number | null;
  /** Two hex colors used to auto-generate a unique cover gradient. */
  cover: [string, string];
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
  albums: Album[];
}

export interface DeanDBData {
  /** Branding + the human this shrine is built for. */
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
