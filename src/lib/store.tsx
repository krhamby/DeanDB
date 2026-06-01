import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DeanDBData } from "../types";

const LS_KEY = "deandb:working-copy:v1";

interface StoreValue {
  data: DeanDBData | null;
  loading: boolean;
  /** True when local edits diverge from the published JSON. */
  dirty: boolean;
  /** Apply an immutable update to the data and persist it locally. */
  update: (mutator: (draft: DeanDBData) => DeanDBData) => void;
  /** Replace the whole dataset (used by import). */
  replace: (next: DeanDBData) => void;
  /** Throw away local edits and reload the published JSON. */
  resetToPublished: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

async function fetchPublished(): Promise<DeanDBData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/deandb.json`, {
    cache: "no-cache",
  });
  if (!res.ok) throw new Error(`Failed to load deandb.json (${res.status})`);
  return (await res.json()) as DeanDBData;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DeanDBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Prefer Dean's in-progress local edits; fall back to published JSON.
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

  const persist = useCallback((next: DeanDBData) => {
    setData(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    setDirty(true);
  }, []);

  const update = useCallback(
    (mutator: (draft: DeanDBData) => DeanDBData) => {
      setData((prev) => {
        if (!prev) return prev;
        // structuredClone keeps the mutator honest about immutability.
        const next = mutator(structuredClone(prev));
        localStorage.setItem(LS_KEY, JSON.stringify(next));
        return next;
      });
      setDirty(true);
    },
    [],
  );

  const replace = useCallback((next: DeanDBData) => persist(next), [persist]);

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
    () => ({ data, loading, dirty, update, replace, resetToPublished }),
    [data, loading, dirty, update, replace, resetToPublished],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
