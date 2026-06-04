export function fmtHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** A 0–10 score for display: a perfect 10 shows as "10" (the scale's ceiling —
 *  there's no 10.x and no finer granularity); every other score keeps its single
 *  decimal (9.8, 9.0). Callers handle the null/unrated "—" case themselves. */
export function fmtScore(value: number): string {
  return value === 10 ? "10" : value.toFixed(1);
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function gradient([a, b]: [string, string], angle = 135): string {
  return `linear-gradient(${angle}deg, ${a}, ${b})`;
}

/**
 * Signature gradient palette for new artists/albums. Shared by the Editor's
 * MusicBrainz import and the Discover page so both pick from the same set.
 */
export const GRADIENT_PALETTE: [string, string][] = [
  ["#ef4444", "#7c2d12"],
  ["#f59e0b", "#92400e"],
  ["#10b981", "#064e3b"],
  ["#3b82f6", "#1e3a8a"],
  ["#a855f7", "#4c1d95"],
  ["#ec4899", "#831843"],
  ["#14b8a6", "#134e4a"],
  ["#f97316", "#7c2d12"],
];

/** A random gradient tuple from GRADIENT_PALETTE. */
export const pickGradient = (): [string, string] =>
  GRADIENT_PALETTE[Math.floor(Math.random() * GRADIENT_PALETTE.length)];

/** Stable slug used when Dean adds new entries in the editor. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "item"
  );
}

/** First word of a name — the default short "meter name" (e.g. "Kevin Hamby" → "Kevin"). */
export function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now()
    .toString(36)
    .slice(-3)}`;
}
