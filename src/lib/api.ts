// ──────────────────────────────────────────────────────────────
// DeanDB data access layer.
//
// All Supabase reads/writes for the multi-user platform live here. The display
// pages and stats.ts still speak the `DeanDBData` shape, so `fetchJourney`
// reassembles a user's normalized rows back into that view model. Writes are
// per-user (RLS-scoped to auth.uid()); shared catalog rows go through the
// SECURITY DEFINER upsert RPCs defined in supabase/schema.sql.
// ──────────────────────────────────────────────────────────────

import { requireClient, authRedirectTo } from "./supabase";
import { firstWord } from "./format";
import type {
  Album,
  AlbumAggregate,
  AlbumStatus,
  Artist,
  ArtistSuggestion,
  DeanDBData,
  FeedItem,
  PersonResult,
  Profile,
  Recommendation,
  Track,
} from "../types";

const FALLBACK_COLOR: [string, string] = ["#3b82f6", "#1e3a8a"];

/** Coerce a Postgres text[] into the [a,b] gradient tuple the UI expects. */
function tuple(arr: string[] | null | undefined): [string, string] {
  if (arr && arr.length >= 2) return [arr[0], arr[1]];
  if (arr && arr.length === 1) return [arr[0], arr[0]];
  return FALLBACK_COLOR;
}

// ── Profiles ────────────────────────────────────────────────────
interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  tagline: string;
  bio: string;
  avatar_url: string | null;
  season: string;
  goal_hours: number;
  journey_visibility: "private" | "public";
  meter_name: string | null;
  theme_accent: string | null;
  theme_secondary: string | null;
  lock_own_theme: boolean;
}

function mapProfile(r: ProfileRow): Profile {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    tagline: r.tagline,
    bio: r.bio,
    avatarUrl: r.avatar_url,
    season: r.season,
    goalHours: r.goal_hours,
    visibility: r.journey_visibility,
    meterName: r.meter_name,
    themeAccent: r.theme_accent,
    themeSecondary: r.theme_secondary,
    lockOwnTheme: r.lock_own_theme,
  };
}

const PROFILE_COLS =
  "id, username, display_name, tagline, bio, avatar_url, season, goal_hours, journey_visibility, meter_name, theme_accent, theme_secondary, lock_own_theme";

// ════════════════════════════════════════════════════════════════
// Auth
// ════════════════════════════════════════════════════════════════

/** Friendlier copy for the handful of auth errors users actually hit. */
function mapAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first — check your inbox.";
  if (/(invalid|incorrect).*(code|totp)|mfa/i.test(msg)) return "That code didn't match. Try the current 6 digits.";
  return msg;
}

// ── Email + password ──────────────────────────────────────────
export async function signUp(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }> {
  const { data, error } = await requireClient().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirectTo() },
  });
  if (error) return { ok: false, error: error.message };
  // With "Confirm email" ON there's no session until the user confirms.
  return { ok: true, needsConfirmation: !data.session };
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await requireClient().auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: mapAuthError(error.message) } : { ok: true };
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await requireClient().auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectTo(),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Set a new password for the current session (reset flow + "change password"). */
export async function updatePassword(password: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await requireClient().auth.updateUser({ password });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** scope "global" = sign out everywhere (revokes all sessions, incl. this one). */
export async function signOut(scope: "local" | "global" = "local"): Promise<void> {
  await requireClient().auth.signOut({ scope });
}

// ── TOTP multi-factor auth (authenticator app; no SMS) ─────────
export type AAL = "aal1" | "aal2" | null;

/** Current vs. attainable assurance level. A challenge is required at sign-in
 *  IFF current === "aal1" && next === "aal2" (i.e. a verified factor exists). */
export async function getAAL(): Promise<{ current: AAL; next: AAL }> {
  const { data } = await requireClient().auth.mfa.getAuthenticatorAssuranceLevel();
  return { current: (data?.currentLevel ?? null) as AAL, next: (data?.nextLevel ?? null) as AAL };
}

export interface MfaFactor {
  id: string;
  friendlyName?: string;
  status: "verified" | "unverified";
}

export async function listMfaFactors(): Promise<MfaFactor[]> {
  const { data } = await requireClient().auth.mfa.listFactors();
  return (data?.all ?? [])
    .filter((f) => f.factor_type === "totp")
    .map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? undefined,
      status: f.status as "verified" | "unverified",
    }));
}

export async function enrollTotp(
  friendlyName?: string,
): Promise<{ ok: boolean; error?: string; factorId?: string; qrCode?: string; secret?: string; uri?: string }> {
  const { data, error } = await requireClient().auth.mfa.enroll({ factorType: "totp", friendlyName });
  if (error || !data) return { ok: false, error: error?.message ?? "Enrollment failed." };
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

export async function verifyTotpEnrollment(
  factorId: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await requireClient().auth.mfa.challengeAndVerify({ factorId, code });
  return error ? { ok: false, error: mapAuthError(error.message) } : { ok: true };
}

export async function unenrollTotp(factorId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await requireClient().auth.mfa.unenroll({ factorId });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Sign in with a password, then resolve whether a TOTP challenge is still
 *  required (the session is aal1 but a verified factor can raise it to aal2). */
export async function signInResolvingMfa(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string; mfaRequired?: boolean; factorId?: string; challengeId?: string }> {
  const res = await signInWithPassword(email, password);
  if (!res.ok) return res;
  const aal = await getAAL();
  if (aal.current === "aal1" && aal.next === "aal2") {
    const factor = (await listMfaFactors()).find((f) => f.status === "verified");
    if (!factor) return { ok: true, mfaRequired: false };
    const { data, error } = await requireClient().auth.mfa.challenge({ factorId: factor.id });
    if (error || !data) return { ok: false, error: error?.message ?? "MFA challenge failed." };
    return { ok: true, mfaRequired: true, factorId: factor.id, challengeId: data.id };
  }
  return { ok: true, mfaRequired: false };
}

export async function verifyTotp(
  factorId: string,
  challengeId: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await requireClient().auth.mfa.verify({ factorId, challengeId, code });
  return error ? { ok: false, error: mapAuthError(error.message) } : { ok: true };
}

/** Create a fresh TOTP challenge (challenges are single-use — used for retries
 *  and when a session reloaded while still at aal1). */
export async function challengeTotp(
  factorId: string,
): Promise<{ ok: boolean; error?: string; challengeId?: string }> {
  const { data, error } = await requireClient().auth.mfa.challenge({ factorId });
  if (error || !data) return { ok: false, error: error?.message };
  return { ok: true, challengeId: data.id };
}

// ════════════════════════════════════════════════════════════════
// Profiles
// ════════════════════════════════════════════════════════════════

export async function fetchProfileById(id: string): Promise<Profile | null> {
  const { data } = await requireClient().from("profiles").select(PROFILE_COLS).eq("id", id).maybeSingle();
  return data ? mapProfile(data as ProfileRow) : null;
}

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const { data } = await requireClient()
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("username", username)
    .maybeSingle();
  return data ? mapProfile(data as ProfileRow) : null;
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, "username" | "displayName" | "tagline" | "bio" | "avatarUrl" | "season" | "goalHours" | "visibility" | "meterName" | "themeAccent" | "themeSecondary" | "lockOwnTheme">>,
): Promise<{ ok: boolean; error?: string }> {
  const row: Record<string, unknown> = {};
  if (patch.username !== undefined) row.username = patch.username;
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.tagline !== undefined) row.tagline = patch.tagline;
  if (patch.bio !== undefined) row.bio = patch.bio;
  if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
  if (patch.season !== undefined) row.season = patch.season;
  if (patch.goalHours !== undefined) row.goal_hours = patch.goalHours;
  if (patch.visibility !== undefined) row.journey_visibility = patch.visibility;
  if (patch.meterName !== undefined) row.meter_name = patch.meterName;
  if (patch.themeAccent !== undefined) row.theme_accent = patch.themeAccent;
  if (patch.themeSecondary !== undefined) row.theme_secondary = patch.themeSecondary;
  if (patch.lockOwnTheme !== undefined) row.lock_own_theme = patch.lockOwnTheme;
  const { error } = await requireClient().from("profiles").update(row).eq("id", id);
  if (error) {
    return {
      ok: false,
      error: /duplicate|unique/i.test(error.message) ? "That username is taken." : error.message,
    };
  }
  return { ok: true };
}

export async function usernameAvailable(name: string): Promise<boolean> {
  const { data } = await requireClient().rpc("username_available", { name });
  return data === true;
}

/** Minimal public header for any username — works even for private journeys. */
export async function fetchProfileHeader(
  username: string,
): Promise<{ id: string; username: string; displayName: string; avatarUrl: string | null; visibility: "private" | "public" } | null> {
  const { data } = await requireClient().rpc("profile_header", { p_username: username });
  const row = (Array.isArray(data) ? data[0] : data) as SearchRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    visibility: row.visibility,
  };
}

// ════════════════════════════════════════════════════════════════
// Journey reassembly  (normalized rows → DeanDBData)
// ════════════════════════════════════════════════════════════════

interface UserArtistRow {
  color: string[] | null;
  logged: boolean;
  verdict: number | null;
  verdict_note: string;
  rec_by_text: string;
  rec_by: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  artist: {
    id: string;
    name: string;
    genre: string | null;
    country: string | null;
    catalog_size: number;
    bio: string;
    mbid: string | null;
    color: string[] | null;
  };
}

interface UserAlbumRow {
  status: AlbumStatus;
  rating: number | null;
  review: string;
  minutes: number;
  date_listened: string | null;
  favorite: boolean;
  excluded: boolean;
  album: {
    id: string;
    artist_id: string;
    title: string;
    year: number | null;
    cover: string[] | null;
    cover_url: string | null;
    mbid: string | null;
    runtime_min: number;
    tracks: { id: string; position: number; title: string }[];
  };
}

interface UserTrackRow {
  track_id: string;
  rating: number | null;
  favorite: boolean;
}

/**
 * Reassemble one user's normalized journey into the `DeanDBData` shape the UI
 * and stats.ts consume. `profile` supplies the listener branding.
 */
export async function fetchJourney(profile: Profile): Promise<DeanDBData> {
  const c = requireClient();
  const [artistsRes, albumsRes, tracksRes] = await Promise.all([
    c
      .from("user_artists")
      .select(
        "color, logged, verdict, verdict_note, rec_by_text, " +
          "rec_by:profiles!user_artists_rec_by_user_fkey ( id, username, display_name, avatar_url ), " +
          "artist:catalog_artists!inner ( id, name, genre, country, catalog_size, bio, mbid, color )",
      )
      .eq("user_id", profile.id),
    c
      .from("user_albums")
      .select(
        "status, rating, review, minutes, date_listened, favorite, excluded, " +
          "album:catalog_albums!inner ( id, artist_id, title, year, cover, cover_url, mbid, runtime_min, " +
          "tracks:catalog_tracks ( id, position, title ) )",
      )
      .eq("user_id", profile.id),
    c.from("user_tracks").select("track_id, rating, favorite").eq("user_id", profile.id),
  ]);

  const userArtists = (artistsRes.data ?? []) as unknown as UserArtistRow[];
  const userAlbums = (albumsRes.data ?? []) as unknown as UserAlbumRow[];
  const userTracks = (tracksRes.data ?? []) as unknown as UserTrackRow[];

  const trackOverlay = new Map(userTracks.map((t) => [t.track_id, t]));

  // Build the artist shells.
  const artistById = new Map<string, Artist>();
  for (const ua of userArtists) {
    const a = ua.artist;
    const recText = ua.rec_by_text ?? "";
    const recProfile = ua.rec_by;
    artistById.set(a.id, {
      id: a.id,
      name: a.name,
      genre: a.genre ?? "Unknown",
      country: a.country ?? "—",
      color: tuple(ua.color ?? a.color),
      catalogSize: a.catalog_size,
      bio: a.bio ?? "",
      mbid: a.mbid ?? undefined,
      logged: ua.logged ?? false,
      verdict: ua.verdict,
      verdictNote: ua.verdict_note ?? "",
      // Set only when there's something to show. A private, non-followed
      // recommender's profile is hidden by RLS (rec_by is null) — we then fall
      // back to the free-text name.
      recommendedBy:
        recProfile || recText
          ? {
              userId: recProfile?.id ?? null,
              username: recProfile?.username ?? null,
              displayName: recProfile?.display_name ?? null,
              avatarUrl: recProfile?.avatar_url ?? null,
              text: recText,
            }
          : undefined,
      albums: [],
    });
  }

  // Attach albums (overlaying catalog tracks with this user's ratings).
  for (const ur of userAlbums) {
    const cat = ur.album;
    const host = artistById.get(cat.artist_id);
    if (!host) continue; // user has an album whose artist isn't in their roster — skip
    const tracks: Track[] = (cat.tracks ?? [])
      .slice()
      .sort((x, y) => x.position - y.position)
      .map((t) => {
        const o = trackOverlay.get(t.id);
        return { id: t.id, title: t.title, rating: o?.rating ?? null, favorite: o?.favorite ?? false };
      });
    const album: Album = {
      id: cat.id,
      title: cat.title,
      year: cat.year,
      cover: tuple(cat.cover),
      coverUrl: cat.cover_url ?? undefined,
      mbid: cat.mbid ?? undefined,
      excluded: ur.excluded,
      status: ur.status,
      rating: ur.rating,
      review: ur.review,
      // Per-user 0 means "runtime unknown" — defer to the shared catalog runtime
      // (which is itself 0 until a tracklist fetch fills it). A real value, once
      // loaded, is written to both layers. Never seed a fake number here.
      minutes: ur.minutes || cat.runtime_min || 0,
      dateListened: ur.date_listened,
      favorite: ur.favorite,
      tracks,
    };
    host.albums.push(album);
  }

  return {
    listener: {
      meterName: profile.meterName?.trim() || firstWord(profile.displayName) || "Listener",
      tagline: profile.tagline,
    },
    goalHours: profile.goalHours,
    season: profile.season,
    artists: [...artistById.values()],
  };
}

// ════════════════════════════════════════════════════════════════
// Catalog upserts (shared rows, via SECURITY DEFINER RPCs)
// ════════════════════════════════════════════════════════════════

async function upsertCatalogArtist(a: {
  mbid?: string;
  name: string;
  genre: string | null;
  country: string | null;
  catalogSize: number;
  color: [string, string];
}): Promise<string> {
  const { data, error } = await requireClient().rpc("upsert_catalog_artist", {
    p_mbid: a.mbid ?? null,
    p_name: a.name,
    p_genre: a.genre,
    p_country: a.country,
    p_catalog_size: a.catalogSize,
    p_color: a.color,
  });
  if (error) throw error;
  return data as string;
}

async function upsertCatalogAlbum(a: {
  artistId: string;
  mbid?: string;
  title: string;
  year: number | null;
  cover: [string, string];
  coverUrl?: string;
  runtimeMin: number;
}): Promise<string> {
  const { data, error } = await requireClient().rpc("upsert_catalog_album", {
    p_artist_id: a.artistId,
    p_mbid: a.mbid ?? null,
    p_title: a.title,
    p_year: a.year,
    p_cover: a.cover,
    p_cover_url: a.coverUrl ?? null,
    p_runtime_min: a.runtimeMin,
  });
  if (error) throw error;
  return data as string;
}

/** Replace an album's catalog tracklist; returns the new track ids in order. */
export async function setCatalogTracks(albumId: string, titles: string[]): Promise<string[]> {
  const { data, error } = await requireClient().rpc("upsert_catalog_tracks", {
    p_album_id: albumId,
    p_titles: titles,
  });
  if (error) throw error;
  return (data as string[]) ?? [];
}

export async function addCatalogTrack(albumId: string, title: string): Promise<string> {
  const { data, error } = await requireClient().rpc("add_catalog_track", {
    p_album_id: albumId,
    p_title: title,
  });
  if (error) throw error;
  return data as string;
}

export async function removeCatalogTrack(trackId: string): Promise<void> {
  const { error } = await requireClient().rpc("remove_catalog_track", { p_track_id: trackId });
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// Per-user journey mutations
// ════════════════════════════════════════════════════════════════

export async function addUserArtist(userId: string, artistId: string, color: [string, string]): Promise<void> {
  // Insert-only (ON CONFLICT DO NOTHING): re-importing an artist must not reset
  // an existing row's color/logged/verdict/recommender. New artists insert normally.
  const { error } = await requireClient()
    .from("user_artists")
    .upsert({ user_id: userId, artist_id: artistId, color }, { onConflict: "user_id,artist_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeUserArtist(artistId: string): Promise<void> {
  const { error } = await requireClient().rpc("remove_user_artist", { p_artist_id: artistId });
  if (error) throw error;
}

/** Fields a listener controls on one of their artists (the per-user row). */
export interface UserArtistPatch {
  logged?: boolean;
  verdict?: number | null;
  verdictNote?: string;
  /** On-platform recommender (profile id), or null to clear. */
  recByUser?: string | null;
  /** Free-text recommender (off-platform), or "" to clear. */
  recByText?: string;
}

/**
 * Set one of my artists' per-user fields (logged / verdict / recommender).
 * Upsert on (user_id, artist_id): the row normally pre-exists (added when the
 * artist joined the roster), so this hits the ON CONFLICT UPDATE path and only
 * the listed columns change. This function never writes `color`, so a user's
 * custom color is untouched here. If the row is somehow missing it is created
 * (with catalog-default color) rather than the write silently affecting zero rows.
 */
export async function upsertUserArtist(userId: string, artistId: string, patch: UserArtistPatch): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, artist_id: artistId };
  if (patch.logged !== undefined) row.logged = patch.logged;
  if (patch.verdict !== undefined) row.verdict = patch.verdict;
  if (patch.verdictNote !== undefined) row.verdict_note = patch.verdictNote;
  if (patch.recByUser !== undefined) row.rec_by_user = patch.recByUser;
  if (patch.recByText !== undefined) row.rec_by_text = patch.recByText;
  const { error } = await requireClient()
    .from("user_artists")
    .upsert(row, { onConflict: "user_id,artist_id" });
  if (error) throw error;
}

/** Fields a listener controls on one of their albums. */
export interface UserAlbumPatch {
  status?: AlbumStatus;
  rating?: number | null;
  review?: string;
  minutes?: number;
  dateListened?: string | null;
  favorite?: boolean;
  excluded?: boolean;
}

function userAlbumRow(userId: string, albumId: string, patch: UserAlbumPatch): Record<string, unknown> {
  const row: Record<string, unknown> = { user_id: userId, album_id: albumId };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.rating !== undefined) row.rating = patch.rating;
  if (patch.review !== undefined) row.review = patch.review;
  if (patch.minutes !== undefined) row.minutes = patch.minutes;
  if (patch.dateListened !== undefined) row.date_listened = patch.dateListened;
  if (patch.favorite !== undefined) row.favorite = patch.favorite;
  if (patch.excluded !== undefined) row.excluded = patch.excluded;
  return row;
}

export async function upsertUserAlbum(userId: string, albumId: string, patch: UserAlbumPatch): Promise<void> {
  const { error } = await requireClient()
    .from("user_albums")
    .upsert(userAlbumRow(userId, albumId, patch), { onConflict: "user_id,album_id" });
  if (error) throw error;
}

/**
 * Insert a user_albums row only when the listener doesn't already have it
 * (ON CONFLICT DO NOTHING). Used by import so re-importing an artist adds missing
 * albums without touching the status/rating/review/minutes on ones they already
 * track. Unlike upsertUserAlbum this never updates an existing row.
 */
export async function addUserAlbumIfMissing(userId: string, albumId: string, patch: UserAlbumPatch): Promise<void> {
  const { error } = await requireClient()
    .from("user_albums")
    .upsert(userAlbumRow(userId, albumId, patch), { onConflict: "user_id,album_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeUserAlbum(userId: string, albumId: string): Promise<void> {
  const { error } = await requireClient()
    .from("user_albums")
    .delete()
    .eq("user_id", userId)
    .eq("album_id", albumId);
  if (error) throw error;
}

export async function upsertUserTrack(
  userId: string,
  trackId: string,
  patch: { rating?: number | null; favorite?: boolean },
): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, track_id: trackId };
  if (patch.rating !== undefined) row.rating = patch.rating;
  if (patch.favorite !== undefined) row.favorite = patch.favorite;
  const { error } = await requireClient().from("user_tracks").upsert(row, { onConflict: "user_id,track_id" });
  if (error) throw error;
}

// ── Composite helpers used by the Editor ────────────────────────

/**
 * Add a blank album to the catalog under an artist and into the user's journey.
 * Returns the catalog album id so the UI can reference it.
 */
export async function createUserAlbum(
  userId: string,
  artistId: string,
  album: { title: string; year: number | null; cover: [string, string]; coverUrl?: string; mbid?: string; runtimeMin?: number },
): Promise<string> {
  const albumId = await upsertCatalogAlbum({
    artistId,
    mbid: album.mbid,
    title: album.title,
    year: album.year,
    cover: album.cover,
    coverUrl: album.coverUrl,
    runtimeMin: album.runtimeMin ?? 0,
  });
  // Seed 0 ("unknown") when no real runtime is known — never a fake 40, which
  // would shadow the catalog runtime and corrupt marathon/Endurance math.
  await upsertUserAlbum(userId, albumId, { status: "want", minutes: album.runtimeMin ?? 0 });
  return albumId;
}

/**
 * Import a full artist + discography from a MusicBrainz match into the user's
 * journey, deduping against the shared catalog. Returns the catalog artist id.
 */
export async function importArtistFromMatch(
  userId: string,
  match: {
    mbid?: string;
    name: string;
    genre: string | null;
    country: string | null;
    catalogSize: number;
    albums: { mbid?: string; title: string; year: number | null; coverUrl?: string }[];
  },
  color: [string, string],
  albumCover: () => [string, string],
): Promise<string> {
  const artistId = await upsertCatalogArtist({
    mbid: match.mbid,
    name: match.name,
    genre: match.genre,
    country: match.country,
    catalogSize: match.catalogSize || match.albums.length || 1,
    color,
  });
  await addUserArtist(userId, artistId, color);
  for (const al of match.albums) {
    const albumId = await upsertCatalogAlbum({
      artistId,
      mbid: al.mbid,
      title: al.title,
      year: al.year,
      cover: albumCover(),
      coverUrl: al.coverUrl,
      runtimeMin: 0,
    });
    // Insert-only so a re-import leaves albums the listener already tracks
    // (and their ratings/status/minutes) untouched — it only adds new ones.
    // Seed minutes 0 ("unknown") until a tracklist fetch supplies the real runtime.
    await addUserAlbumIfMissing(userId, albumId, { status: "want", minutes: 0 });
  }
  return artistId;
}

/** Create a blank (manual) artist in the catalog + user's journey. */
export async function createUserArtist(
  userId: string,
  a: { name: string; genre: string | null; country: string | null; catalogSize: number },
  color: [string, string],
): Promise<string> {
  const artistId = await upsertCatalogArtist({ ...a, color });
  await addUserArtist(userId, artistId, color);
  return artistId;
}

/** Update shared catalog metadata for an artist (genre/country/catalog size/mbid). */
export async function refreshCatalogArtist(a: {
  mbid?: string;
  name: string;
  genre: string | null;
  country: string | null;
  catalogSize: number;
  color: [string, string];
}): Promise<string> {
  return upsertCatalogArtist(a);
}

/** Update shared catalog art/metadata for an album (cover fetch). */
export async function refreshCatalogAlbum(a: {
  artistId: string;
  mbid?: string;
  title: string;
  year: number | null;
  cover: [string, string];
  coverUrl?: string;
  runtimeMin: number;
}): Promise<string> {
  return upsertCatalogAlbum(a);
}

// ════════════════════════════════════════════════════════════════
// Social graph: follows
// ════════════════════════════════════════════════════════════════

export async function followUser(followerId: string, followeeId: string): Promise<void> {
  // Trigger sets status (accepted if target public, else pending).
  const { error } = await requireClient()
    .from("follows")
    .upsert({ follower_id: followerId, followee_id: followeeId }, { onConflict: "follower_id,followee_id" });
  if (error) throw error;
}

export async function unfollowUser(followerId: string, followeeId: string): Promise<void> {
  const { error } = await requireClient()
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId);
  if (error) throw error;
}

export async function acceptFollow(followerId: string, followeeId: string): Promise<void> {
  const { error } = await requireClient()
    .from("follows")
    .update({ status: "accepted" })
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId);
  if (error) throw error;
}

/** My follow edge toward `owner`, if any (pending/accepted/null). */
export async function relationshipTo(
  me: string,
  owner: string,
): Promise<{ followStatus: "pending" | "accepted" | null; followsMe: boolean }> {
  const c = requireClient();
  const [mine, theirs] = await Promise.all([
    c.from("follows").select("status").eq("follower_id", me).eq("followee_id", owner).maybeSingle(),
    c.from("follows").select("status").eq("follower_id", owner).eq("followee_id", me).maybeSingle(),
  ]);
  return {
    followStatus: (mine.data?.status as "pending" | "accepted" | undefined) ?? null,
    followsMe: theirs.data?.status === "accepted",
  };
}

/**
 * A follow edge with the counterparty's PUBLIC identity, returned by the
 * `list_followers`/`list_following` SECURITY DEFINER RPCs. Those bypass the
 * `profiles` RLS so a PRIVATE user's follow request/edge is never silently
 * dropped (a plain join would hide their profile and lose the row) — they expose
 * only public-identity fields, exactly like `search_profiles`.
 */
interface FollowEdgeRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  visibility: "private" | "public";
  status: "pending" | "accepted";
}

function followEdgeToPerson(
  r: FollowEdgeRow,
  followsMe: boolean,
  followStatus: "pending" | "accepted" | null,
): PersonResult {
  return {
    profile: {
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      tagline: "",
      bio: "",
      avatarUrl: r.avatar_url,
      season: "",
      goalHours: 0,
      visibility: r.visibility,
      meterName: null,
      themeAccent: null,
      themeSecondary: null,
    },
    followStatus,
    followsMe,
  };
}

/**
 * People who follow me — accepted followers AND pending requests. The RPC scopes
 * to auth.uid() internally; `userId` is kept for the call sites but unused.
 */
export async function listFollowers(_userId: string): Promise<PersonResult[]> {
  const { data } = await requireClient().rpc("list_followers");
  return ((data ?? []) as FollowEdgeRow[]).map((r) => followEdgeToPerson(r, r.status === "accepted", null));
}

/** People I follow (accepted) + requests I've sent (pending), via the same RPC. */
export async function listFollowing(_userId: string): Promise<PersonResult[]> {
  const { data } = await requireClient().rpc("list_following");
  return ((data ?? []) as FollowEdgeRow[]).map((r) => followEdgeToPerson(r, false, r.status));
}

interface SearchRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  visibility: "private" | "public";
}

/** Discover people by name (returns public identity for any user). */
export async function searchPeople(me: string, q: string): Promise<PersonResult[]> {
  const c = requireClient();
  const { data } = await c.rpc("search_profiles", { q });
  const rows = (data ?? []) as SearchRow[];
  if (rows.length === 0) return [];
  // Resolve my relationship to each in one query.
  const { data: edges } = await c
    .from("follows")
    .select("followee_id, status")
    .eq("follower_id", me)
    .in("followee_id", rows.map((r) => r.id));
  const edgeMap = new Map((edges ?? []).map((e) => [e.followee_id as string, e.status as "pending" | "accepted"]));
  return rows.map((r) => ({
    profile: {
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      tagline: "",
      bio: "",
      avatarUrl: r.avatar_url,
      season: "",
      goalHours: 0,
      visibility: r.visibility,
      meterName: null,
      themeAccent: null,
      themeSecondary: null,
    },
    followStatus: edgeMap.get(r.id) ?? null,
    followsMe: false,
  }));
}

// ════════════════════════════════════════════════════════════════
// Activity feed
// ════════════════════════════════════════════════════════════════

interface FeedRow {
  user_album_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  album_id: string;
  album_title: string;
  cover: string[] | null;
  cover_url: string | null;
  artist_id: string;
  artist_name: string;
  status: AlbumStatus;
  rating: number | null;
  review: string;
  favorite: boolean;
  logged: boolean;
  updated_at: string;
}

interface AchFeedRow {
  achievement_row_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  achievement_id: string;
  unlocked_at: string;
}

/** Recent activity from people I follow (accepted edges only): album activity
 *  plus achievement unlocks, merged newest-first. */
export async function fetchFeed(userId: string): Promise<FeedItem[]> {
  const c = requireClient();
  const { data: edges } = await c
    .from("follows")
    .select("followee_id")
    .eq("follower_id", userId)
    .eq("status", "accepted");
  const followeeIds = (edges ?? []).map((e) => e.followee_id as string);
  if (followeeIds.length === 0) return [];

  // Cap achievement events to a recent window so a first-load backfill burst
  // (already-earned achievements inserted at deploy time) ages out quickly.
  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [albumsRes, achRes] = await Promise.all([
    c.from("feed_items").select("*").in("user_id", followeeIds).order("updated_at", { ascending: false }).limit(50),
    c
      .from("achievement_feed")
      .select("*")
      .in("user_id", followeeIds)
      .gte("unlocked_at", sinceIso)
      .order("unlocked_at", { ascending: false })
      .limit(50),
  ]);

  const albums: FeedItem[] = ((albumsRes.data ?? []) as FeedRow[]).map((r) => ({
    kind: "album" as const,
    userAlbumId: r.user_album_id,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    albumId: r.album_id,
    albumTitle: r.album_title,
    cover: tuple(r.cover),
    coverUrl: r.cover_url,
    artistId: r.artist_id,
    artistName: r.artist_name,
    status: r.status,
    rating: r.rating,
    review: r.review,
    favorite: r.favorite,
    logged: r.logged ?? false,
    updatedAt: r.updated_at,
  }));
  const achievements: FeedItem[] = ((achRes.data ?? []) as AchFeedRow[]).map((r) => ({
    kind: "achievement" as const,
    achievementRowId: r.achievement_row_id,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    achievementId: r.achievement_id,
    unlockedAt: r.unlocked_at,
  }));

  // Newest first. ISO-8601 (UTC) strings compare lexicographically; use raw
  // </> rather than localeCompare so ordering is locale-independent.
  const ts = (it: FeedItem) => (it.kind === "album" ? it.updatedAt : it.unlockedAt);
  return [...albums, ...achievements].sort((a, b) => (ts(a) < ts(b) ? 1 : ts(a) > ts(b) ? -1 : 0)).slice(0, 50);
}

/** The achievement ids this user has already recorded (for unlock detection). */
export async function fetchUnlockedAchievementIds(userId: string): Promise<string[]> {
  const { data } = await requireClient()
    .from("user_achievements")
    .select("achievement_id")
    .eq("user_id", userId);
  return (data ?? []).map((r) => (r as { achievement_id: string }).achievement_id);
}

/** Record newly-unlocked achievements via the SECURITY DEFINER RPC, which stamps
 *  auth.uid() + now() server-side (the client can't forge owner/time). Idempotent
 *  (ON CONFLICT DO NOTHING). `_userId` is unused — the RPC derives it from the
 *  session — but kept for call-site symmetry with fetchUnlockedAchievementIds. */
export async function recordAchievementUnlocks(_userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await requireClient().rpc("record_achievement_unlocks", { p_ids: ids });
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// Recommendations
// ════════════════════════════════════════════════════════════════

interface RecRow {
  id: string;
  from_user: string;
  to_user: string;
  album_id: string | null;
  artist_id: string | null;
  note: string;
  created_at: string;
  read_at: string | null;
  from_profile: { username: string; display_name: string } | null;
  album: { title: string; artist_id: string; artist: { id: string; name: string } | null } | null;
  artist: { id: string; name: string } | null;
}

function mapRec(r: RecRow): Recommendation {
  const artist = r.album?.artist ?? r.artist;
  return {
    id: r.id,
    fromUser: r.from_user,
    fromUsername: r.from_profile?.username ?? "",
    fromDisplayName: r.from_profile?.display_name ?? "",
    toUser: r.to_user,
    albumId: r.album_id,
    albumTitle: r.album?.title ?? null,
    artistId: artist?.id ?? "",
    artistName: artist?.name ?? "Unknown",
    note: r.note,
    createdAt: r.created_at,
    readAt: r.read_at,
  };
}

const REC_COLS =
  "id, from_user, to_user, album_id, artist_id, note, created_at, read_at, " +
  "from_profile:profiles!recommendations_from_user_fkey ( username, display_name ), " +
  "album:catalog_albums ( title, artist_id, artist:catalog_artists ( id, name ) ), " +
  "artist:catalog_artists ( id, name )";

export async function sendRecommendation(
  fromUser: string,
  toUser: string,
  subject: { albumId?: string; artistId?: string },
  note: string,
): Promise<void> {
  const { error } = await requireClient().from("recommendations").insert({
    from_user: fromUser,
    to_user: toUser,
    album_id: subject.albumId ?? null,
    artist_id: subject.artistId ?? null,
    note,
  });
  if (error) throw error;
}

export async function listInbox(userId: string): Promise<Recommendation[]> {
  const { data } = await requireClient()
    .from("recommendations")
    .select(REC_COLS)
    .eq("to_user", userId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as RecRow[]).map(mapRec);
}

export async function listSent(userId: string): Promise<Recommendation[]> {
  const { data } = await requireClient()
    .from("recommendations")
    .select(REC_COLS)
    .eq("from_user", userId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as RecRow[]).map(mapRec);
}

export async function markRecommendationRead(id: string): Promise<void> {
  await requireClient().from("recommendations").update({ read_at: new Date().toISOString() }).eq("id", id);
}

export async function unreadRecommendationCount(userId: string): Promise<number> {
  const { count } = await requireClient()
    .from("recommendations")
    .select("id", { count: "exact", head: true })
    .eq("to_user", userId)
    .is("read_at", null);
  return count ?? 0;
}

// ════════════════════════════════════════════════════════════════
// Community album aggregate
// ════════════════════════════════════════════════════════════════

export async function albumAggregate(albumId: string): Promise<AlbumAggregate> {
  const { data } = await requireClient().rpc("album_aggregate", { p_album_id: albumId });
  const row = Array.isArray(data) ? data[0] : data;
  return {
    avgRating: row?.avg_rating != null ? Number(row.avg_rating) : null,
    listenerCount: row?.listener_count != null ? Number(row.listener_count) : 0,
  };
}

// ════════════════════════════════════════════════════════════════
// Discovery — AI artist suggestions (suggest-artists Edge Function)
// ════════════════════════════════════════════════════════════════

/** Tuning knobs for {@link suggestArtists}. */
export interface SuggestArtistsOptions {
  /** Artist names the listener already enjoys, used to personalize results. */
  seedArtists?: string[];
  /** Artist names already in the journey, so they aren't suggested again. */
  excludeArtists?: string[];
  /** Max suggestions to return (the Edge Function caps this server-side too). */
  limit?: number;
}

/**
 * Turn a free-text prompt into MusicBrainz-validated artist suggestions.
 *
 * Delegates to the `suggest-artists` Supabase Edge Function: a free-tier LLM
 * interprets the prompt (personalized by `seedArtists`, avoiding
 * `excludeArtists`) and every candidate is confirmed against MusicBrainz inside
 * the function, so only real artists come back. The function is JWT-gated — the
 * caller must be signed in (supabase-js attaches the session token automatically).
 */
export async function suggestArtists(
  prompt: string,
  opts: SuggestArtistsOptions = {},
): Promise<ArtistSuggestion[]> {
  const { data, error } = await requireClient().functions.invoke("suggest-artists", {
    body: {
      prompt,
      seedArtists: opts.seedArtists ?? [],
      excludeArtists: opts.excludeArtists ?? [],
      limit: opts.limit ?? 8,
    },
  });
  if (error) throw error;
  const suggestions = (data as { suggestions?: ArtistSuggestion[] } | null)?.suggestions;
  return Array.isArray(suggestions) ? suggestions : [];
}
