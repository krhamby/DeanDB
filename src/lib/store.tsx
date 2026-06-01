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
import {
  loadState,
  saveState,
  subscribe,
  supabaseEnabled,
} from "./supabase";

const LS_KEY = "deandb:working-copy:v1";

interface StoreValue {
  data: DeanDBData | null;
  loading: boolean;
  /** True when local edits diverge from what's published. */
  dirty: boolean;
  /** Whether a shared Supabase backend is wired up. */
  supabaseEnabled: boolean;
  publishing: boolean;
  /** Apply an immutable update to the data and persist it locally. */
  update: (mutator: (draft: DeanDBData) => DeanDBData) => void;
  /** Replace the whole dataset (used by import). */
  replace: (next: DeanDBData) => void;
  /** Push local edits to the shared backend (Supabase). */
  publish: (passcode: string) => Promise<{ ok: boolean; error?: string }>;
  /** Throw away local edits and reload the published data. */
  resetToPublished: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Fallback source when Supabase is off: the JSON bundled with the build. */
async function fetchBundled(): Promise<DeanDBData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/deandb.json`, {
    cache: "no-cache",
  });
  if (!res.ok) throw new Error(`Failed to load deandb.json (${res.status})`);
  return (await res.json()) as DeanDBData;
}

/** The published baseline: Supabase row if present, else bundled JSON. */
async function fetchPublished(): Promise<DeanDBData> {
  if (supabaseEnabled) {
    try {
      const remote = await loadState();
      if (remote) return remote;
    } catch (err) {
      // Never let a backend hiccup blank the page — fall back to bundled data.
      console.error("Supabase read failed; falling back to bundled JSON.", err);
    }
  }
  return fetchBundled();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DeanDBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Realtime callbacks need the latest `dirty` without re-subscribing.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Dean's unpublished local edits take priority over the published copy.
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        try {
          if (!cancelled) {
            setData(JSON.parse(stored) as DeanDBData);
            setDirty(true);
            setLoading(false);
          }
          return;
        } catch {
          localStorage.removeItem(LS_KEY);
        }
      }
      try {
        const published = await fetchPublished();
        if (!cancelled) setData(published);
      } catch (err) {
        console.error(err);
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
  }, []);

  const replace = useCallback((next: DeanDBData) => {
    setData(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    setDirty(true);
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
        }
        return result;
      } finally {
        setPublishing(false);
      }
    },
    [data],
  );

  const resetToPublished = useCallback(async () => {
    localStorage.removeItem(LS_KEY);
    setLoading(true);
    try {
      const published = await fetchPublished();
      setData(published);
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
      update,
      replace,
      publish,
      resetToPublished,
    }),
    [data, loading, dirty, publishing, update, replace, publish, resetToPublished],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
