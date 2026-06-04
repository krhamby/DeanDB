import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Artist, DeanDBData, FeedItem, PersonResult, Profile, Recommendation } from "../types";
import { supabase, supabaseEnabled } from "./supabase";
import { firstWord } from "./format";
import { applyTheme, resolveTheme, SKIN_SURFACE, type SkinId, type Theme } from "./themes";
import * as api from "./api";
import { computeAchievements, computeStats } from "./stats";

// ──────────────────────────────────────────────────────────────
// State for the multi-user platform, split into two concerns:
//   • Auth/session + the current user's profile          → useAuth()
//   • The logged-in user's own editable journey          → useMyJourney()
// Other users' journeys are fetched read-only via useJourney(username).
// ──────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════
// Auth
// ════════════════════════════════════════════════════════════════

interface AuthValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Session exists but is aal1 while a verified TOTP factor could raise it to
   *  aal2 — i.e. the user still owes a code. Treated as NOT fully authenticated. */
  mfaPending: boolean;
  /** A password-recovery link was opened; the user must set a new password. */
  passwordRecovery: boolean;
  /** AAL has been resolved at least once (avoids a flash of gated UI on load). */
  aalChecked: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string; mfaRequired?: boolean; factorId?: string; challengeId?: string }>;
  signUp: (email: string, password: string) => Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }>;
  verifyMfa: (factorId: string, challengeId: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  updatePassword: (password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: (scope?: "local" | "global") => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (
    patch: Partial<
      Pick<
        Profile,
        | "username"
        | "displayName"
        | "tagline"
        | "bio"
        | "avatarUrl"
        | "season"
        | "goalHours"
        | "visibility"
        | "meterName"
        | "themeAccent"
        | "themeSecondary"
        | "lockOwnTheme"
        | "skin"
      >
    >,
  ) => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [aalChecked, setAalChecked] = useState(false);
  const user = session?.user ?? null;

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      return;
    }
    // The profiles row is created by a DB trigger on signup; retry briefly in
    // case we win the race against it on a brand-new account.
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = await api.fetchProfileById(uid);
      if (p) {
        setProfile(p);
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    setProfile(null);
  }, []);

  // Resolve the session's assurance level so the app can gate aal1 sessions that
  // still owe a TOTP code. A user with no verified factor legitimately stays aal1.
  const resolveAal = useCallback(async (sess: Session | null) => {
    if (!sess) {
      setMfaPending(false);
      setAalChecked(true);
      return;
    }
    try {
      const aal = await api.getAAL();
      setMfaPending(aal.current === "aal1" && aal.next === "aal2");
    } catch {
      setMfaPending(false);
    } finally {
      setAalChecked(true);
    }
  }, []);

  useEffect(() => {
    if (!supabaseEnabled || !supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      await resolveAal(data.session);
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (event === "SIGNED_OUT") setPasswordRecovery(false);
      loadProfile(next?.user.id);
      void resolveAal(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, resolveAal]);

  const signIn = useCallback(
    (email: string, password: string) => api.signInResolvingMfa(email, password),
    [],
  );
  const signUp = useCallback((email: string, password: string) => api.signUp(email, password), []);
  const verifyMfa = useCallback(
    async (factorId: string, challengeId: string, code: string) => {
      const res = await api.verifyTotp(factorId, challengeId, code);
      if (res.ok && supabase) {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        await resolveAal(data.session);
      }
      return res;
    },
    [resolveAal],
  );
  const requestPasswordReset = useCallback((email: string) => api.requestPasswordReset(email), []);
  const updatePassword = useCallback(async (password: string) => {
    const res = await api.updatePassword(password);
    if (res.ok) setPasswordRecovery(false);
    return res;
  }, []);
  const signOut = useCallback(async (scope: "local" | "global" = "local") => {
    await api.signOut(scope);
    setSession(null);
    setProfile(null);
    setMfaPending(false);
    setPasswordRecovery(false);
  }, []);
  const refreshProfile = useCallback(() => loadProfile(user?.id), [loadProfile, user?.id]);

  const updateProfile = useCallback<AuthValue["updateProfile"]>(
    async (patch) => {
      if (!user) return { ok: false, error: "Not signed in." };
      const res = await api.updateProfile(user.id, patch);
      if (res.ok) setProfile((p) => (p ? { ...p, ...patch } : p));
      return res;
    },
    [user],
  );

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user,
      profile,
      loading,
      mfaPending,
      passwordRecovery,
      aalChecked,
      signIn,
      signUp,
      verifyMfa,
      requestPasswordReset,
      updatePassword,
      signOut,
      refreshProfile,
      updateProfile,
    }),
    [
      session,
      user,
      profile,
      loading,
      mfaPending,
      passwordRecovery,
      aalChecked,
      signIn,
      signUp,
      verifyMfa,
      requestPasswordReset,
      updatePassword,
      signOut,
      refreshProfile,
      updateProfile,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      <ThemeProvider>
        <AutoMeterName>
          <MyJourneyProvider>{children}</MyJourneyProvider>
        </AutoMeterName>
      </ThemeProvider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

// ════════════════════════════════════════════════════════════════
// Theme — global accent colors, with a per-profile override
// ════════════════════════════════════════════════════════════════

interface ThemeControl {
  setThemeOverride: (t: Theme | null) => void;
  skin: SkinId;
  /** Active skin's base surface hex (for per-surface accent legibility). */
  surface: string;
  setSkin: (s: SkinId) => void;
}

const ThemeContext = createContext<ThemeControl>({
  setThemeOverride: () => {},
  skin: "paper",
  surface: SKIN_SURFACE.paper,
  setSkin: () => {},
});

export function useThemeControl(): ThemeControl {
  return useContext(ThemeContext);
}

/** Applies the signed-in user's colors globally; an override (e.g. another
 *  person's profile) takes precedence while mounted. */
function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile, updateProfile } = useAuth();
  const [override, setOverride] = useState<Theme | null>(null);
  const [skin, setSkinState] = useState<SkinId>(() => {
    if (typeof localStorage !== "undefined") {
      const s = localStorage.getItem("deandb.skin");
      if (s === "paper" || s === "midnight") return s;
    }
    return "paper"; // Paper is the authored default
  });
  const surface = SKIN_SURFACE[skin];
  const active = override ?? resolveTheme(profile);

  // Reflect the skin on <html> and feed the surface to the accent clamp. Both run
  // in a layout effect so the clamped accent tokens (and the skin's token block)
  // are committed BEFORE the browser's first paint — otherwise the raw @theme gold
  // (#f5c518 on white = 1.6:1) flashes for a frame on Paper.
  useLayoutEffect(() => {
    document.documentElement.dataset.skin = skin;
  }, [skin]);
  useLayoutEffect(() => {
    applyTheme(active, surface);
  }, [active.accent, active.secondary, surface]);

  // Adopt the account skin once the profile loads (cross-device sync).
  useEffect(() => {
    if (profile?.skin === "paper" || profile?.skin === "midnight") setSkinState(profile.skin);
  }, [profile?.skin]);

  const setSkin = useCallback(
    (s: SkinId) => {
      setSkinState(s);
      try { localStorage.setItem("deandb.skin", s); } catch { /* ignore */ }
      if (profile) void updateProfile({ skin: s });
    },
    [profile, updateProfile],
  );

  const value = useMemo<ThemeControl>(
    () => ({ setThemeOverride: setOverride, skin, surface, setSkin }),
    [skin, surface, setSkin],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ════════════════════════════════════════════════════════════════
// Meter name — the journey owner's short persona name for labels
// ════════════════════════════════════════════════════════════════

const MeterNameContext = createContext<string>("Dean");

export function useMeterName(): string {
  return useContext(MeterNameContext);
}

/** Scope a subtree to one journey's persona name (own journey or a profile). */
export function MeterNameProvider({ name, children }: { name: string; children: ReactNode }) {
  return <MeterNameContext.Provider value={name}>{children}</MeterNameContext.Provider>;
}

/** Default scope: the signed-in user's own meter name. */
function AutoMeterName({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const name = profile ? profile.meterName?.trim() || firstWord(profile.displayName) || "Listener" : "Dean";
  return <MeterNameProvider name={name}>{children}</MeterNameProvider>;
}

// ════════════════════════════════════════════════════════════════
// My journey (the logged-in user's own, editable)
// ════════════════════════════════════════════════════════════════

interface MyJourneyValue {
  /** The logged-in user's journey in DeanDBData shape, or null when signed out. */
  data: DeanDBData | null;
  loading: boolean;
  userId: string | null;
  /** Achievement ids the VIEWER (signed-in user) has unlocked — persisted unlocks
   *  plus freshly-computed ones from their own journey. The single source of truth
   *  for secret-achievement masking everywhere (own + others' profiles, feed). */
  myUnlockedAchievementIds: Set<string>;
  /** Reload the journey from the server and return the fresh copy. */
  reload: () => Promise<DeanDBData | null>;
  /** Optimistically mutate the local view (no DB write) — used after bulk ops. */
  patchLocal: (mutator: (d: DeanDBData) => DeanDBData) => void;
  /** Optimistic local edit + persist for one of my albums. */
  setAlbum: (albumId: string, patch: api.UserAlbumPatch) => void;
  /** Optimistic local edit + persist for one of my tracks. */
  setTrack: (albumId: string, trackId: string, patch: { rating?: number | null; favorite?: boolean }) => void;
  /**
   * Optimistic local edit + persist for one of my artists (logged / verdict /
   * recommender). Pass `recommendedBy` to update the resolved display object
   * locally alongside the `recByUser`/`recByText` columns that are persisted.
   */
  setArtist: (
    artistId: string,
    patch: api.UserArtistPatch & { recommendedBy?: Artist["recommendedBy"] },
  ) => void;
}

const MyJourneyContext = createContext<MyJourneyValue | null>(null);

function MyJourneyProvider({ children }: { children: ReactNode }) {
  const ctx = useContext(AuthContext);
  const profile = ctx?.profile ?? null;
  const userId = profile?.id ?? null;
  const [data, setData] = useState<DeanDBData | null>(null);
  const [loading, setLoading] = useState(false);
  // The viewer's own unlocked achievement ids (persisted ∪ freshly computed),
  // exposed for secret-achievement masking. Reactive so masking updates live.
  const [myUnlocked, setMyUnlocked] = useState<Set<string>>(new Set());
  // Keep the latest data for fire-and-forget writers without re-subscribing.
  const dataRef = useRef<DeanDBData | null>(null);
  dataRef.current = data;

  const reload = useCallback(async () => {
    if (!profile) {
      setData(null);
      return null;
    }
    setLoading(true);
    try {
      const fresh = await api.fetchJourney(profile);
      setData(fresh);
      return fresh;
    } finally {
      setLoading(false);
    }
  }, [profile]);

  // (Re)load whenever the signed-in profile changes.
  useEffect(() => {
    if (profile) void reload();
    else setData(null);
  }, [profile, reload]);

  // ── Achievement unlock detection ────────────────────────────────
  // Achievements derive from whole-journey state, so recompute from the live
  // data (cheap — already done every Dashboard render) and record any NEW
  // unlocks. recordedRef holds ids already in the DB this session (avoids
  // re-inserting on every keystroke); the (user_id, achievement_id) unique
  // constraint is the real idempotency guarantee across sessions/devices.
  const recordedRef = useRef<Set<string> | null>(null);
  const detectAndRecord = useCallback(() => {
    const d = dataRef.current;
    if (!userId || !d || !recordedRef.current) return;
    const stats = computeStats(d);
    const unlockedNow = computeAchievements(d, stats)
      .filter((a) => a.unlocked)
      .map((a) => a.id);
    // Keep the viewer's unlocked set current with freshly-computed own unlocks so
    // a secret reveals on the owner's own surfaces immediately, before the DB
    // roundtrip. Only allocate a new Set when something actually changed.
    setMyUnlocked((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of unlockedNow) if (!next.has(id)) (next.add(id), (changed = true));
      return changed ? next : prev;
    });
    const fresh = unlockedNow.filter((id) => !recordedRef.current!.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => recordedRef.current!.add(id)); // optimistic — prevents re-fire
    void api.recordAchievementUnlocks(userId, fresh).catch((e) => {
      console.error("record achievements failed", e);
      fresh.forEach((id) => recordedRef.current!.delete(id)); // allow retry next change
    });
  }, [userId]);
  useEffect(() => {
    if (!userId) {
      recordedRef.current = null;
      setMyUnlocked(new Set());
      return;
    }
    let active = true;
    void api.fetchUnlockedAchievementIds(userId).then((ids) => {
      if (!active) return;
      recordedRef.current = new Set(ids);
      setMyUnlocked((prev) => new Set([...prev, ...ids])); // seed from persisted unlocks
      detectAndRecord(); // backfill already-earned achievements once recorded ids load
    });
    return () => {
      active = false;
    };
  }, [userId, detectAndRecord]);
  useEffect(detectAndRecord, [data, detectAndRecord]);

  const patchLocal = useCallback((mutator: (d: DeanDBData) => DeanDBData) => {
    setData((prev) => (prev ? mutator(structuredClone(prev)) : prev));
  }, []);

  const setAlbum = useCallback(
    (albumId: string, patch: api.UserAlbumPatch) => {
      if (!userId) return;
      patchLocal((d) => {
        for (const ar of d.artists) {
          const al = ar.albums.find((x) => x.id === albumId);
          if (al) {
            if (patch.status !== undefined) al.status = patch.status;
            if (patch.rating !== undefined) al.rating = patch.rating;
            if (patch.review !== undefined) al.review = patch.review;
            if (patch.minutes !== undefined) al.minutes = patch.minutes;
            if (patch.dateListened !== undefined) al.dateListened = patch.dateListened;
            if (patch.favorite !== undefined) al.favorite = patch.favorite;
            if (patch.excluded !== undefined) al.excluded = patch.excluded;
            break;
          }
        }
        return d;
      });
      void api.upsertUserAlbum(userId, albumId, patch).catch((e) => console.error("save album failed", e));
    },
    [userId, patchLocal],
  );

  const setTrack = useCallback(
    (albumId: string, trackId: string, patch: { rating?: number | null; favorite?: boolean }) => {
      if (!userId) return;
      patchLocal((d) => {
        for (const ar of d.artists) {
          const al = ar.albums.find((x) => x.id === albumId);
          const tr = al?.tracks.find((t) => t.id === trackId);
          if (tr) {
            if (patch.rating !== undefined) tr.rating = patch.rating;
            if (patch.favorite !== undefined) tr.favorite = patch.favorite;
            break;
          }
        }
        return d;
      });
      void api.upsertUserTrack(userId, trackId, patch).catch((e) => console.error("save track failed", e));
    },
    [userId, patchLocal],
  );

  const setArtist = useCallback<MyJourneyValue["setArtist"]>(
    (artistId, patch) => {
      if (!userId) return;
      patchLocal((d) => {
        const ar = d.artists.find((a) => a.id === artistId);
        if (ar) {
          if (patch.logged !== undefined) ar.logged = patch.logged;
          if (patch.verdict !== undefined) ar.verdict = patch.verdict;
          if (patch.verdictNote !== undefined) ar.verdictNote = patch.verdictNote;
          if (patch.recommendedBy !== undefined) ar.recommendedBy = patch.recommendedBy;
        }
        return d;
      });
      void api.upsertUserArtist(userId, artistId, patch).catch((e) => console.error("save artist failed", e));
    },
    [userId, patchLocal],
  );

  const value = useMemo<MyJourneyValue>(
    () => ({ data, loading, userId, myUnlockedAchievementIds: myUnlocked, reload, patchLocal, setAlbum, setTrack, setArtist }),
    [data, loading, userId, myUnlocked, reload, patchLocal, setAlbum, setTrack, setArtist],
  );

  return <MyJourneyContext.Provider value={value}>{children}</MyJourneyContext.Provider>;
}

export function useMyJourney(): MyJourneyValue {
  const ctx = useContext(MyJourneyContext);
  if (!ctx) throw new Error("useMyJourney must be used within <AuthProvider>");
  return ctx;
}

/** DEV-ONLY: supply a fixed journey so auth-gated editors render in the preview harness. */
export function MockJourneyProvider({ data, children }: { data: DeanDBData; children: ReactNode }) {
  const noop = () => {};
  const value: MyJourneyValue = {
    data,
    loading: false,
    userId: "preview-user",
    myUnlockedAchievementIds: new Set<string>(),
    reload: async () => data,
    patchLocal: noop,
    setAlbum: noop,
    setTrack: noop,
    setArtist: noop,
  };
  return <MyJourneyContext.Provider value={value}>{children}</MyJourneyContext.Provider>;
}

// ════════════════════════════════════════════════════════════════
// Viewing any user's journey (read-only, RLS-gated)
// ════════════════════════════════════════════════════════════════

export interface JourneyView {
  loading: boolean;
  data: DeanDBData | null;
  owner: Profile | null;
  canEdit: boolean;
  /** Journey exists but is private and you're not allowed in. */
  denied: boolean;
  notFound: boolean;
  relationship: { followStatus: "pending" | "accepted" | null; followsMe: boolean } | null;
  reloadRelationship: () => Promise<void>;
}

export function useJourney(username: string | undefined): JourneyView {
  const { user, profile } = useAuth();
  const mine = useMyJourney();
  const isMe = Boolean(username && profile && profile.username === username);

  const [state, setState] = useState<Omit<JourneyView, "reloadRelationship">>({
    loading: true,
    data: null,
    owner: null,
    canEdit: false,
    denied: false,
    notFound: false,
    relationship: null,
  });

  const loadRelationship = useCallback(async () => {
    if (!username || isMe || !user) return;
    const header = await api.fetchProfileHeader(username);
    if (!header) return;
    const rel = await api.relationshipTo(user.id, header.id);
    setState((s) => ({ ...s, relationship: rel }));
  }, [username, isMe, user]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!username) {
        setState((s) => ({ ...s, loading: false, notFound: true }));
        return;
      }
      // My own journey: reuse the live editable copy.
      if (isMe && profile) {
        setState({
          loading: mine.loading,
          data: mine.data,
          owner: profile,
          canEdit: true,
          denied: false,
          notFound: false,
          relationship: null,
        });
        return;
      }
      const header = await api.fetchProfileHeader(username);
      if (!active) return;
      if (!header) {
        setState({ loading: false, data: null, owner: null, canEdit: false, denied: false, notFound: true, relationship: null });
        return;
      }
      const rel = user ? await api.relationshipTo(user.id, header.id) : { followStatus: null, followsMe: false };
      const canView = header.visibility === "public" || rel.followStatus === "accepted";
      if (!canView) {
        setState({
          loading: false,
          data: null,
          owner: {
            id: header.id,
            username: header.username,
            displayName: header.displayName,
            tagline: "",
            bio: "",
            avatarUrl: header.avatarUrl,
            season: "",
            goalHours: 0,
            visibility: header.visibility,
            meterName: null,
            themeAccent: null,
            themeSecondary: null,
          },
          canEdit: false,
          denied: true,
          notFound: false,
          relationship: rel,
        });
        return;
      }
      const full = await api.fetchProfileByUsername(username);
      if (!active || !full) {
        setState({ loading: false, data: null, owner: null, canEdit: false, denied: false, notFound: true, relationship: rel });
        return;
      }
      const data = await api.fetchJourney(full);
      if (!active) return;
      setState({ loading: false, data, owner: full, canEdit: false, denied: false, notFound: false, relationship: rel });
    })();
    return () => {
      active = false;
    };
    // Re-run when the target or my own live journey changes.
  }, [username, isMe, profile, user, mine.data, mine.loading]);

  return { ...state, reloadRelationship: loadRelationship };
}

// ════════════════════════════════════════════════════════════════
// Feed / People / Recommendations hooks
// ════════════════════════════════════════════════════════════════

export function useFeed(): { items: FeedItem[]; loading: boolean; reload: () => void } {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .fetchFeed(user.id)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [user]);
  useEffect(reload, [reload]);
  return { items, loading, reload };
}

export function useRecommendations(): {
  inbox: Recommendation[];
  loading: boolean;
  unread: number;
  reload: () => void;
  markRead: (id: string) => void;
} {
  const { user } = useAuth();
  const [inbox, setInbox] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    if (!user) {
      setInbox([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .listInbox(user.id)
      .then(setInbox)
      .finally(() => setLoading(false));
  }, [user]);
  useEffect(reload, [reload]);
  const markRead = useCallback((id: string) => {
    setInbox((list) => list.map((r) => (r.id === id ? { ...r, readAt: new Date().toISOString() } : r)));
    void api.markRecommendationRead(id);
  }, []);
  const unread = inbox.filter((r) => !r.readAt).length;
  return { inbox, loading, unread, reload, markRead };
}

export function usePeopleSearch(query: string): { results: PersonResult[]; loading: boolean } {
  const { user } = useAuth();
  const [results, setResults] = useState<PersonResult[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (!user || q.length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .searchPeople(user.id, q)
        .then((r) => active && setResults(r))
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, user]);
  return { results, loading };
}
