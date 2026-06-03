import { useHashRoute } from "../lib/router";

// Sub-navigation across a single journey. The same three views exist for your
// own journey (#/me) and anyone else's (#/u/:username), so this is threaded
// with `basePath` exactly like the cards and detail pages.
const TABS = [
  { key: "overview", label: "Overview", seg: "" },
  { key: "artists", label: "Artists", seg: "/artists" },
  { key: "hall-of-fame", label: "Hall of Fame", seg: "/hall-of-fame" },
] as const;

/**
 * Tabbed nav for one journey. `basePath` is "" for your own (#/me) journey and
 * "/u/:username" when viewing someone else's. Artist/album detail pages count
 * as part of the "Artists" tab so the active marker stays put while drilling in.
 */
export function JourneyNav({ basePath = "" }: { basePath?: string }) {
  const hash = useHashRoute();
  const path = hash.replace(/^#/, "") || "/";
  // Strip the journey prefix so we can match on the view segment alone. Own
  // journeys live under #/me but their links also use the bare shortcuts
  // (#/artist, #/album, …), so fall back to matching the raw path.
  const base = basePath || "/me";
  const rel = path.startsWith(base) ? path.slice(base.length) : path;
  const active =
    rel.startsWith("/hall-of-fame")
      ? "hall-of-fame"
      : rel.startsWith("/artist") || rel.startsWith("/album")
        ? "artists"
        : "overview";

  return (
    <nav aria-label="Journey sections" className="mb-6 flex items-center gap-1 border-b border-edge/60">
      {TABS.map((t) => {
        const isActive = active === t.key;
        const href = `#${t.key === "overview" ? base : `${basePath}${t.seg}`}`;
        return (
          <a
            key={t.key}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`relative rounded-t-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
              isActive ? "text-gold" : "text-zinc-400 hover:text-white"
            }`}
          >
            {t.label}
            {isActive && (
              <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" />
            )}
          </a>
        );
      })}
    </nav>
  );
}
