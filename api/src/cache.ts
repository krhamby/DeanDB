// Small in-process LRU with TTL — second cache layer behind Cloudflare's edge
// cache. Map iteration order gives us recency for free.
type Entry<V> = { value: V; expiresAt: number };

export function createLruCache<V>(opts: {
  maxEntries: number;
  ttlMs: number;
  now?: () => number;
}) {
  const now = opts.now ?? Date.now;
  const map = new Map<string, Entry<V>>();
  return {
    get(key: string): V | undefined {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        map.delete(key);
        return undefined;
      }
      map.delete(key); // re-insert to mark as most recently used
      map.set(key, entry);
      return entry.value;
    },
    set(key: string, value: V): void {
      if (map.has(key)) map.delete(key);
      map.set(key, { value, expiresAt: now() + opts.ttlMs });
      if (map.size > opts.maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
    },
    get size() {
      return map.size;
    },
  };
}
