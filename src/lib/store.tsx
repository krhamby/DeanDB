import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { DeanDBData, FeedItem, PersonResult, Profile, Recommendation } from "../types";
import { supabase, supabaseEnabled } from "./supabase";
import * as api from "./api";

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
  signIn: (email: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (
    patch: Partial<
      Pick<
        Profile,
        "username" | "displayName" | "handle" | "tagline" | "bio" | "avatarUrl" | "season" | "goalHours" | "visibility"
      >
    >,
  ) => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
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
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      loadProfile(next?.user.id);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback((email: string) => api.signInWithEmail(email), []);
  const signOut = useCallback(async () => {
    await api.signOut();
    setSession(null);
    setProfile(null);
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
    () => ({ session, user, profile, loading, signIn, signOut, refreshProfile, updateProfile }),
    [session, user, profile, loading, signIn, signOut, refreshProfile, updateProfile],
  );

  return (
    <AuthContext.Provider value={value}>
      <MyJourneyProvider>{children}</MyJourneyProvider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

// ════════════════════════════════════════════════════════════════
// My journey (the logged-in user's own, editable)
// ════════════════════════════════════════════════════════════════

interface MyJourneyValue {
  /** The logged-in user's journey in DeanDBData shape, or null when signed out. */
  data: DeanDBData | null;
  loading: boolean;
  userId: string | null;
  reload: () => Promise<void>;
  /** Optimistically mutate the local view (no DB write) — used after bulk ops. */
  patchLocal: (mutator: (d: DeanDBData) => DeanDBData) => void;
  /** Optimistic local edit + persist for one of my albums. */
  setAlbum: (albumId: string, patch: api.UserAlbumPatch) => void;
  /** Optimistic local edit + persist for one of my tracks. */
  setTrack: (albumId: string, trackId: string, patch: { rating?: number | null; favorite?: boolean }) => void;
}

const MyJourneyContext = createContext<MyJourneyValue | null>(null);

function MyJourneyProvider({ children }: { children: ReactNode }) {
  const ctx = useContext(AuthContext);
  const profile = ctx?.profile ?? null;
  const userId = profile?.id ?? null;
  const [data, setData] = useState<DeanDBData | null>(null);
  const [loading, setLoading] = useState(false);
  // Keep the latest data for fire-and-forget writers without re-subscribing.
  const dataRef = useRef<DeanDBData | null>(null);
  dataRef.current = data;

  const reload = useCallback(async () => {
    if (!profile) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      setData(await api.fetchJourney(profile));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  // (Re)load whenever the signed-in profile changes.
  useEffect(() => {
    if (profile) void reload();
    else setData(null);
  }, [profile, reload]);

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

  const value = useMemo<MyJourneyValue>(
    () => ({ data, loading, userId, reload, patchLocal, setAlbum, setTrack }),
    [data, loading, userId, reload, patchLocal, setAlbum, setTrack],
  );

  return <MyJourneyContext.Provider value={value}>{children}</MyJourneyContext.Provider>;
}

export function useMyJourney(): MyJourneyValue {
  const ctx = useContext(MyJourneyContext);
  if (!ctx) throw new Error("useMyJourney must be used within <AuthProvider>");
  return ctx;
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
            handle: null,
            tagline: "",
            bio: "",
            avatarUrl: header.avatarUrl,
            season: "",
            goalHours: 0,
            visibility: header.visibility,
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
