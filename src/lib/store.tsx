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
import type { DeanDBData } from "../types";
import { checkPasscode, loadState, saveState, subscribe, supabaseEnabled } from "./supabase";

const EDITOR_FLAG = "deandb:editor";
const PASSCODE_KEY = "deandb:passcode";

const LS_KEY = "deandb:working-copy:v1";

// The shape shown before Dean has published anything (or if the cloud is
// unreachable). A clean, empty marathon — never the old bundled seed.
const EMPTY_MARATHON: DeanDBData = {
  listener: {
    name: "Dean",
    handle: "@deanlistens",
    tagline: "250 hours. Every album. No skips. One man's quest through the canon.",
  },
  goalHours: 250,
  season: "The 2026 Marathon",
  artists: [],
};

interface StoreValue {
  data: DeanDBData | null;
  loading: boolean;
  /** True when local edits diverge from what's published. */
  dirty: boolean;
  /** Whether a shared Supabase backend is wired up. */
  supabaseEnabled: boolean;
  publishing: boolean;
  /** A saved-but-unpublished draft exists in this browser (offered, never auto-applied). */
  hasLocalDraft: boolean;
  /** True when this browser is unlocked as the editor (Dean). View-only otherwise. */
  isEditor: boolean;
  /** Validate the passcode and unlock editing. Returns whether it succeeded. */
  login: (passcode: string) => Promise<boolean>;
  /** Lock editing again on this browser. */
  logout: () => void;
  /** Apply an immutable update to the data and persist it locally. */
  update: (mutator: (draft: DeanDBData) => DeanDBData) => void;
  /** Replace the whole dataset (used by import). */
  replace: (next: DeanDBData) => void;
  /** Push local edits to the shared backend (Supabase). */
  publish: (passcode: string) => Promise<{ ok: boolean; error?: string }>;
  /** Load the saved local draft into the editor. */
  restoreLocalDraft: () => void;
  /** Throw away local edits and reload the published (cloud) data. */
  resetToPublished: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Dev-only convenience: the JSON bundled with the build (used only when no backend). */
async function fetchBundled(): Promise<DeanDBData> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/deandb.json`, {
      cache: "no-cache",
    });
    if (res.ok) return (await res.json()) as DeanDBData;
  } catch {
    /* ignore */
  }
  return EMPTY_MARATHON;
}

/**
 * The single source of truth is the Supabase row. If no row exists yet, the
 * marathon is empty. We never silently fall back to bundled seed data when a
 * backend is configured — the database is authoritative.
 */
async function fetchFromDb(): Promise<DeanDBData> {
  if (supabaseEnabled) {
    try {
      const remote = await loadState();
      return remote ?? EMPTY_MARATHON;
    } catch (err) {
      console.error("Supabase read failed; showing an empty marathon.", err);
      return EMPTY_MARATHON;
    }
  }
  // No backend configured at all (e.g. local dev without keys): use bundled JSON.
  return fetchBundled();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DeanDBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  // Editing is locked until the editor logs in. With no backend (local dev),
  // there's nothing to authenticate against, so editing is open.
  const [isEditor, setIsEditor] = useState(
    () => !supabaseEnabled || localStorage.getItem(EDITOR_FLAG) === "1",
  );
  // Realtime callbacks need the latest `dirty` without re-subscribing.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Always start from the database — viewers see exactly what's published.
      // Any local draft is offered for recovery in the Editor, never auto-loaded.
      setHasLocalDraft(Boolean(localStorage.getItem(LS_KEY)));
      try {
        const fresh = await fetchFromDb();
        if (!cancelled) setData(fresh);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live sync: apply remote changes only when we have no unpublished edits,
  // so we never clobber Dean mid-edit.
  useEffect(() => {
    if (!supabaseEnabled) return;
    return subscribe((next) => {
      if (!dirtyRef.current) setData(next);
    });
  }, []);

  const update = useCallback((mutator: (draft: DeanDBData) => DeanDBData) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = mutator(structuredClone(prev));
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
    setDirty(true);
    setHasLocalDraft(true);
  }, []);

  const replace = useCallback((next: DeanDBData) => {
    setData(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    setDirty(true);
    setHasLocalDraft(true);
  }, []);

  const restoreLocalDraft = useCallback(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (!stored) return;
    try {
      setData(JSON.parse(stored) as DeanDBData);
      setDirty(true);
    } catch {
      localStorage.removeItem(LS_KEY);
      setHasLocalDraft(false);
    }
  }, []);

  const publish = useCallback(
    async (passcode: string) => {
      if (!data) return { ok: false, error: "Nothing to publish yet." };
      setPublishing(true);
      try {
        const result = await saveState(data, passcode);
        if (result.ok) {
          // Published copy is now the source of truth; drop the local draft.
          localStorage.removeItem(LS_KEY);
          setDirty(false);
          setHasLocalDraft(false);
        }
        return result;
      } finally {
        setPublishing(false);
      }
    },
    [data],
  );

  const login = useCallback(async (passcode: string) => {
    // No backend = nothing to check against; allow editing locally.
    const ok = !supabaseEnabled ? true : await checkPasscode(passcode);
    if (ok) {
      localStorage.setItem(EDITOR_FLAG, "1");
      localStorage.setItem(PASSCODE_KEY, passcode);
      setIsEditor(true);
    }
    return ok;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(EDITOR_FLAG);
    localStorage.removeItem(PASSCODE_KEY);
    setIsEditor(false);
  }, []);

  const resetToPublished = useCallback(async () => {
    localStorage.removeItem(LS_KEY);
    setHasLocalDraft(false);
    setLoading(true);
    try {
      const fresh = await fetchFromDb();
      setData(fresh);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      data,
      loading,
      dirty,
      supabaseEnabled,
      publishing,
      hasLocalDraft,
      isEditor,
      login,
      logout,
      update,
      replace,
      publish,
      restoreLocalDraft,
      resetToPublished,
    }),
    [
      data,
      loading,
      dirty,
      publishing,
      hasLocalDraft,
      isEditor,
      login,
      logout,
      update,
      replace,
      publish,
      restoreLocalDraft,
      resetToPublished,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
