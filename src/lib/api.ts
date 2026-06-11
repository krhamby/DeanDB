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
import type { RealtimeChannel } from "@supabase/supabase-js";
import { firstWord } from "./format";
import type {
  Album,
  AlbumAggregate,
  AlbumStatus,
  Artist,
  ArtistSuggestion,
  BlockedUser,
  Conversation,
  DeanDBData,
  DirectMessage,
  DmContact,
  FeedItem,
  PersonResult,
  Profile,
  Recommendation,
  ReportReason,
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
  skin: string | null;
  marathon_enabled: boolean;
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
    skin: r.skin === "midnight" ? "midnight" : "paper",
    marathonEnabled: r.marathon_enabled !== false,
  };
}

const PROFILE_COLS =
  "id, username, display_name, tagline, bio, avatar_url, season, goal_hours, journey_visibility, meter_name, theme_accent, theme_secondary, lock_own_theme, skin, marathon_enabled";

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
  const { data, error } = await requireClient().from("profiles").select(PROFILE_COLS).eq("id", id).maybeSingle();
  // A real query error (vs. genuine not-found) shouldn't masquerade as "no profile";
  // surface it so schema drift is visible rather than silently appearing logged-out.
  if (error) console.error("fetchProfileById:", error.message);
  return data ? mapProfile(data as ProfileRow) : null;
}

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await requireClient()
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("username", username)
    .maybeSingle();
  if (error) console.error("fetchProfileByUsername:", error.message);
  return data ? mapProfile(data as ProfileRow) : null;
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, "username" | "displayName" | "tagline" | "bio" | "avatarUrl" | "season" | "goalHours" | "visibility" | "meterName" | "themeAccent" | "themeSecondary" | "lockOwnTheme" | "skin" | "marathonEnabled">>,
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
  if (patch.skin !== undefined) row.skin = patch.skin;
  if (patch.marathonEnabled !== undefined) row.marathon_enabled = patch.marathonEnabled;
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
  rated_at: string | null;
  favorite: boolean;
  excluded: boolean;
  album: {
    id: string;
    artist_id: string;
    title: string;
    year: number | null;
    cover: string[] | null;
    cover_url: string | null;
    dominant_color: string | null;
    mbid: string | null;
    runtime_min: number;
    tracks: { id: string; position: number; title: string }[];
  };
}

interface UserTrackRow {
  track_id: string;
  rating: number | null;
  favorite: boolean;
  listened: boolean;
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
        "status, rating, review, minutes, date_listened, rated_at, favorite, excluded, " +
          "album:catalog_albums!inner ( id, artist_id, title, year, cover, cover_url, dominant_color, mbid, runtime_min, " +
          "tracks:catalog_tracks ( id, position, title ) )",
      )
      .eq("user_id", profile.id),
    c.from("user_tracks").select("track_id, rating, favorite, listened").eq("user_id", profile.id),
  ]);

  // Fail loudly on a real query error (e.g. a missing column after schema drift)
  // instead of silently returning an empty journey — which would wipe the user's
  // albums/stats/achievements with no signal. The caller surfaces the load failure.
  const loadErr = artistsRes.error ?? albumsRes.error ?? tracksRes.error;
  if (loadErr) throw new Error(`fetchJourney: ${loadErr.message}`);

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
        return {
          id: t.id,
          title: t.title,
          rating: o?.rating ?? null,
          favorite: o?.favorite ?? false,
          listened: o?.listened ?? false,
        };
      });
    const album: Album = {
      id: cat.id,
      title: cat.title,
      year: cat.year,
      cover: tuple(cat.cover),
      coverUrl: cat.cover_url ?? undefined,
      dominantColor: cat.dominant_color ?? null,
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
      ratedAt: ur.rated_at,
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
    marathon: profile.marathonEnabled !== false,
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

/**
 * Write a real (>0) runtime to the SHARED catalog album row. Runtime is an
 * album-level fact: persisting it here (not just to the per-user layer) means it
 * surfaces for the owner AND every viewer via the `cat.runtime_min` fallback in
 * journey reassembly. A 0/unknown value is a no-op server-side (never clobbers a
 * known runtime). Leaves tracks/cover untouched, so song ratings are safe.
 */
export async function setCatalogAlbumRuntime(albumId: string, runtimeMin: number): Promise<void> {
  if (!(runtimeMin > 0)) return;
  const { error } = await requireClient().rpc("set_catalog_album_runtime", {
    p_album_id: albumId,
    p_runtime_min: runtimeMin,
  });
  if (error) throw error;
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
  patch: { rating?: number | null; favorite?: boolean; listened?: boolean },
): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, track_id: trackId };
  if (patch.rating !== undefined) row.rating = patch.rating;
  if (patch.favorite !== undefined) row.favorite = patch.favorite;
  if (patch.listened !== undefined) row.listened = patch.listened;
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
  const c = requireClient();
  // Dedupe: a repeat recommendation of the same subject from the same sender to
  // the same recipient replaces the older one (newest shown, older removed —
  // the ticket's requested behavior). The `recs delete` RLS policy lets the
  // sender remove their own rows.
  const subjectCol = subject.albumId ? "album_id" : "artist_id";
  const subjectId = subject.albumId ?? subject.artistId ?? "";
  await c
    .from("recommendations")
    .delete()
    .eq("from_user", fromUser)
    .eq("to_user", toUser)
    .eq(subjectCol, subjectId);
  const { error } = await c.from("recommendations").insert({
    from_user: fromUser,
    to_user: toUser,
    album_id: subject.albumId ?? null,
    artist_id: subject.artistId ?? null,
    note,
  });
  if (error) throw error;
}

/** Flat row shape returned by the `list_inbox` RPC (sender public identity +
 *  resolved album/artist), used instead of a PostgREST embed because
 *  recommendations.from_user is an FK to auth.users, not profiles. */
interface InboxRow {
  id: string;
  from_user: string;
  from_username: string | null;
  from_display_name: string | null;
  from_avatar_url: string | null;
  album_id: string | null;
  artist_id: string | null;
  note: string;
  created_at: string;
  read_at: string | null;
  album_title: string | null;
  artist_name: string | null;
}

export async function listInbox(userId: string): Promise<Recommendation[]> {
  const { data, error } = await requireClient().rpc("list_inbox");
  if (error) {
    // Surface (don't silently swallow) so a broken inbox is debuggable, but
    // still degrade to an empty list rather than throwing into the hook.
    console.error("list_inbox failed", error);
    return [];
  }
  return ((data ?? []) as InboxRow[]).map((r) => ({
    id: r.id,
    fromUser: r.from_user,
    fromUsername: r.from_username ?? "",
    fromDisplayName: r.from_display_name ?? "",
    toUser: userId,
    albumId: r.album_id,
    albumTitle: r.album_title,
    artistId: r.artist_id ?? "",
    artistName: r.artist_name ?? "Unknown",
    note: r.note,
    createdAt: r.created_at,
    readAt: r.read_at,
  }));
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

/** Count of incoming follow requests awaiting accept. Only PRIVATE journeys
 *  produce 'pending' edges (follows toward public journeys auto-accept), so this
 *  drives the People nav's "you have requests" badge. */
export async function pendingFollowRequestCount(userId: string): Promise<number> {
  const { count } = await requireClient()
    .from("follows")
    .select("id", { count: "exact", head: true })
    .eq("followee_id", userId)
    .eq("status", "pending");
  return count ?? 0;
}

// ════════════════════════════════════════════════════════════════
// Direct messages, blocking & reporting
// ════════════════════════════════════════════════════════════════

interface DmRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

function mapDm(r: DmRow): DirectMessage {
  return {
    id: r.id,
    senderId: r.sender_id,
    recipientId: r.recipient_id,
    body: r.body,
    createdAt: r.created_at,
    readAt: r.read_at,
  };
}

/** Whether `me` may DM `other` right now (accepted follow either direction, no
 *  block either way). Same SQL helper the INSERT policy enforces — this is just
 *  the UX preflight so the composer isn't shown when sending would be refused. */
export async function canDirectMessage(me: string, other: string): Promise<boolean> {
  const { data } = await requireClient().rpc("can_dm", { sender: me, recipient: other });
  return data === true;
}

export async function sendDirectMessage(
  senderId: string,
  recipientId: string,
  body: string,
): Promise<DirectMessage> {
  const { data, error } = await requireClient()
    .from("dm_messages")
    .insert({ sender_id: senderId, recipient_id: recipientId, body })
    .select()
    .single();
  if (error) throw error;
  return mapDm(data as DmRow);
}

/** The sender's "unsend" — deletes one of my own messages for both parties. */
export async function unsendDirectMessage(messageId: string): Promise<void> {
  const { error } = await requireClient().from("dm_messages").delete().eq("id", messageId);
  if (error) throw error;
}

interface ConversationRow {
  other_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  last_body: string;
  last_sender_id: string;
  last_at: string;
  unread_count: number;
}

interface DmContactRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

/** People I can start a conversation with, optionally filtered by name. Backed
 *  by the `list_dm_contacts` RPC, which mirrors `can_dm` exactly — so a pick
 *  from this list can never produce a refused send. */
export async function listDmContacts(q = ""): Promise<DmContact[]> {
  const { data, error } = await requireClient().rpc("list_dm_contacts", { q });
  if (error) throw error;
  return ((data ?? []) as DmContactRow[]).map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
  }));
}

/** My DM threads, newest activity first, with the counterparty's public identity. */
export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await requireClient().rpc("list_dm_conversations");
  if (error) throw error;
  return ((data ?? []) as ConversationRow[]).map((r) => ({
    otherId: r.other_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    lastBody: r.last_body,
    lastSenderId: r.last_sender_id,
    lastAt: r.last_at,
    unreadCount: Number(r.unread_count),
  }));
}

/** The latest messages between me and `other`, oldest-first for rendering. */
export async function fetchThread(me: string, other: string, limit = 200): Promise<DirectMessage[]> {
  const { data, error } = await requireClient()
    .from("dm_messages")
    .select("*")
    .or(
      `and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as DmRow[]).map(mapDm).reverse();
}

/** Mark everything `other` sent me as read (opening / viewing the thread). */
export async function markThreadRead(me: string, other: string): Promise<void> {
  const { error } = await requireClient()
    .from("dm_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", me)
    .eq("sender_id", other)
    .is("read_at", null);
  if (error) throw error;
}

/** Unread DM count for the Messages nav badge. */
export async function unreadDmCount(userId: string): Promise<number> {
  const { count } = await requireClient()
    .from("dm_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

/**
 * Live delivery of messages sent TO `userId`. Realtime respects the table's
 * RLS, so the stream only ever contains rows the user could select anyway.
 * Returns an unsubscribe function.
 *
 * ONE channel per user, shared by every surface (nav badge, conversation list,
 * open thread) via a listener registry. This is load-bearing: supabase-js
 * dedupes channels by topic, and realtime-js THROWS if a `postgres_changes`
 * callback is added to an already-subscribed channel — so a second component
 * subscribing its "own" channel would crash its render tree (a blank
 * #/messages page). The single binding below is attached before subscribe and
 * fans out to however many listeners are currently registered.
 */
let dmChannel: RealtimeChannel | null = null;
let dmChannelUserId: string | null = null;
const dmListeners = new Set<(m: DirectMessage) => void>();

export function subscribeToIncomingDms(userId: string, onMessage: (m: DirectMessage) => void): () => void {
  const c = requireClient();
  if (dmChannelUserId !== userId || !dmChannel) {
    if (dmChannel) void c.removeChannel(dmChannel);
    dmChannelUserId = userId;
    dmChannel = c
      .channel(`dm-inbox-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const m = mapDm(payload.new as DmRow);
          for (const listener of [...dmListeners]) listener(m);
        },
      )
      .subscribe();
  }
  dmListeners.add(onMessage);
  return () => {
    dmListeners.delete(onMessage);
    // Last listener gone (sign-out unmounts the Layout subscription too) —
    // tear the channel down so the socket doesn't outlive the session.
    if (dmListeners.size === 0 && dmChannel) {
      void c.removeChannel(dmChannel);
      dmChannel = null;
      dmChannelUserId = null;
    }
  };
}

// ── Blocking ───────────────────────────────────────────────────
// A DB trigger severs follow edges in both directions on insert, and RLS on
// follows/recommendations/dm_messages refuses new contact across the block.

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await requireClient()
    .from("blocks")
    .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: "blocker_id,blocked_id" });
  if (error) throw error;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await requireClient()
    .from("blocks")
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId);
  if (error) throw error;
}

/** True when I have blocked `other` (incoming blocks are never visible). */
export async function hasBlocked(me: string, other: string): Promise<boolean> {
  const { data } = await requireClient()
    .from("blocks")
    .select("id")
    .eq("blocker_id", me)
    .eq("blocked_id", other)
    .maybeSingle();
  return Boolean(data);
}

interface BlockedRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

/** Everyone I've blocked (Settings management list), public identity only. */
export async function listBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await requireClient().rpc("list_blocked");
  if (error) throw error;
  return ((data ?? []) as BlockedRow[]).map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    blockedAt: r.created_at,
  }));
}

// ── Reporting ──────────────────────────────────────────────────

/** File a moderation report about a user, optionally anchored to one of their
 *  messages (the DB snapshots the message body server-side as evidence). */
export async function reportUser(
  reporterId: string,
  reportedUserId: string,
  reason: ReportReason,
  details: string,
  messageId?: string,
): Promise<void> {
  const { error } = await requireClient().from("reports").insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    reason,
    details,
    message_id: messageId ?? null,
  });
  if (error) throw error;
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
// Cover color extraction (extract-cover Edge Function)
// ════════════════════════════════════════════════════════════════

/** Best-effort: ask the slim `extract-cover` Edge Function for an album's dominant
 *  cover color. Returns the hex, or null on any failure (caller keeps the gradient).
 *  No image is uploaded -- Cover Art Archive keeps hosting the artwork. */
/** Cover hosts the extract-cover function is allowed to fetch server-side. The
 *  catalog `cover_url` is world-writable via the upsert RPC, so a poisoned value
 *  must never reach the function — guard it client-side too (defense in depth;
 *  the function should re-validate). Prevents SSRF to internal/metadata hosts. */
function isAllowedCoverHost(coverUrl: string): boolean {
  try {
    const u = new URL(coverUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === "coverartarchive.org" ||
      host.endsWith(".coverartarchive.org") ||
      host === "archive.org" ||
      host.endsWith(".archive.org")
    );
  } catch {
    return false;
  }
}

export async function extractCover(albumId: string, coverUrl: string): Promise<string | null> {
  if (!isAllowedCoverHost(coverUrl)) return null;
  try {
    const { data, error } = await requireClient().functions.invoke("extract-cover", {
      body: { albumId, coverUrl },
    });
    if (error || !data || typeof data.dominant_color !== "string") return null;
    return data.dominant_color;
  } catch {
    return null;
  }
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
