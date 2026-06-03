import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { navigate, useHashRoute } from "../lib/router";
import { useAuth, useMyJourney } from "../lib/store";
import { computeStats, flattenAlbums } from "../lib/stats";
import { fmtHours } from "../lib/format";
import { unreadRecommendationCount } from "../lib/api";
import { Avatar } from "./social";

/** One header destination. Items live in the nav bar when there's room and
 *  overflow into the profile menu (lowest priority first) when there isn't.
 *  `match` lists route heads (no leading slash) that also light the tab
 *  (Journey covers all of the owner's journey routes); `badge: "unread"` shows
 *  the recommendations unread count. */
type NavItem = { id: string; label: string; path: string; match?: string[]; badge?: "unread" };

// Priority order = kept in the bar longest (left) → first to overflow (right).
// Reorder this array to reprioritize. Settings + Sign out are intentionally NOT
// here — they stay pinned in the profile menu at all times (see UserMenu).
const NAV_PRIORITY: NavItem[] = [
  { id: "journey", label: "Journey", path: "/me", match: ["me", "artists", "artist", "album", "hall-of-fame"] },
  { id: "discover", label: "Discover", path: "/discover" },
  { id: "feed", label: "Feed", path: "/feed" },
  { id: "people", label: "People", path: "/people" },
  { id: "recs", label: "Recs", path: "/recommendations", badge: "unread" },
  { id: "editor", label: "Editor", path: "/editor" },
];

/** A row in the profile dropdown (overflowed nav items + pinned Settings/Sign out). */
type MenuEntry = { label: string; onSelect: () => void; danger?: boolean; badge?: number };

/**
 * Greedy, width-measured overflow. A hidden measurement row renders every
 * candidate at full size; we fit as many as the nav's actual width allows (in
 * priority order) and report the count. The rest overflow into the profile menu.
 * Recomputes on width changes (resize, font load) and when the measured row's own
 * size changes (e.g. the Recs badge appearing).
 */
function useOverflowNav(itemCount: number, active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  useLayoutEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const GAP = 4; // matches the nav's gap-1 (0.25rem)
    const compute = () => {
      const avail = container.clientWidth;
      const kids = Array.from(measure.children) as HTMLElement[];
      let used = 0;
      let count = 0;
      for (let i = 0; i < kids.length; i++) {
        used += kids[i].offsetWidth + (i > 0 ? GAP : 0);
        if (used <= avail) count++;
        else break;
      }
      setVisibleCount(count);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [itemCount, active]);

  return { containerRef, measureRef, visibleCount };
}

function Logo() {
  return (
    <button onClick={() => navigate("/")} className="flex shrink-0 items-center gap-1">
      <span className="grid h-9 place-items-center rounded-md bg-gold px-1.5 font-display text-xl font-black leading-none text-on-accent shadow-[0_2px_0_rgba(0,0,0,0.4)]">
        Dean
      </span>
      <span className="font-display text-xl font-black tracking-tight text-fg">DB</span>
    </button>
  );
}

/** Scrolling ticker of the signed-in user's own recent verdicts. */
function Ticker() {
  const { data } = useMyJourney();
  if (!data) return null;
  const completed = flattenAlbums(data)
    .filter((a) => a.status === "completed" && a.rating != null)
    .sort((a, b) => (b.dateListened ?? "").localeCompare(a.dateListened ?? ""));
  if (completed.length === 0) return null;
  const items = completed.map((a) => `${a.artistName} — ${a.title}  ★ ${a.rating?.toFixed(1)}`);
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-edge/60 bg-fg/5 py-1.5">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap text-xs font-semibold text-fg-muted">
        {doubled.map((t, i) => (
          <span key={i} className="flex items-center gap-8">
            <span className="text-gold">●</span> {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function NavButton({
  path,
  label,
  badge,
  match,
}: {
  path: string;
  label: string;
  badge?: number;
  /** Route heads (no leading slash) that should also light this tab. */
  match?: string[];
}) {
  const hash = useHashRoute();
  const active = hash.replace(/^#/, "") || "/";
  const heads = match ?? [path.replace(/^\//, "")];
  const isActive = heads.some((h) => active === `/${h}` || active.startsWith(`/${h}/`));
  return (
    <button
      onClick={() => navigate(path)}
      aria-current={isActive ? "page" : undefined}
      className={`relative shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50 sm:px-3 ${
        isActive ? "bg-gold text-on-accent" : "text-fg-muted hover:bg-fg/5 hover:text-fg"
      }`}
    >
      {label}
      {badge ? (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-dean px-1 text-[10px] font-bold text-black">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function UserMenu({ overflow, unread }: { overflow: NavItem[]; unread: number }) {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Move focus into the menu when it opens (keyboard + screen-reader support).
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  // Reserve the avatar's 34px footprint while the profile loads. `session`
  // resolves before `profile`, so without this the right cluster is momentarily
  // empty, the width-measured nav fits one extra item, paints, then collapses
  // when the avatar arrives — the load-time flash. A same-size placeholder keeps
  // the measured width constant from first paint.
  if (!profile) return <div aria-hidden className="h-[34px] w-[34px] rounded-full bg-fg/5" />;

  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };
  const go = (p: string) => {
    close();
    navigate(p);
  };

  // Nav items that didn't fit in the bar sit at the top, then a divider, then the
  // always-pinned Settings / Sign out.
  const overflowEntries: MenuEntry[] = overflow.map((n) => ({
    label: n.label,
    badge: n.badge === "unread" ? unread : undefined,
    onSelect: () => go(n.path),
  }));
  const pinned: MenuEntry[] = [
    { label: "Settings", onSelect: () => go("/settings") },
    { label: "Sign out", onSelect: () => { close(); void signOut(); }, danger: true },
  ];
  const items: MenuEntry[] = [...overflowEntries, ...pinned];
  const dividerAt = overflowEntries.length > 0 ? overflowEntries.length : -1;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu, @${profile.username}`}
        className="flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50"
      >
        <Avatar profile={profile} size={34} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          onKeyDown={(e) => {
            const last = items.length - 1;
            const idx = itemRefs.current.findIndex((el) => el === document.activeElement);
            if (e.key === "Escape") {
              e.preventDefault();
              close(true);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              itemRefs.current[idx < last ? idx + 1 : 0]?.focus();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              itemRefs.current[idx > 0 ? idx - 1 : last]?.focus();
            } else if (e.key === "Home") {
              e.preventDefault();
              itemRefs.current[0]?.focus();
            } else if (e.key === "End") {
              e.preventDefault();
              itemRefs.current[last]?.focus();
            } else if (e.key === "Tab") {
              close();
            }
          }}
          className="absolute right-0 top-11 z-40 w-44 overflow-hidden rounded-xl border border-edge bg-panel-2 py-1 shadow-xl"
        >
          <div className="border-b border-edge/60 px-3 py-2 text-xs text-fg-faint">@{profile.username}</div>
          {items.map((it, i) => (
            <Fragment key={it.label}>
              {i === dividerAt && <div role="separator" className="my-1 border-t border-edge/60" />}
              <button
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitem"
                tabIndex={-1}
                onClick={it.onSelect}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-fg/5 focus:bg-fg/10 focus:outline-none ${
                  it.danger ? "text-fg-muted hover:text-dean" : "text-fg-muted"
                }`}
              >
                <span>{it.label}</span>
                {it.badge ? (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-dean px-1 text-[10px] font-bold text-black">
                    {it.badge}
                  </span>
                ) : null}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const { data } = useMyJourney();
  const route = useHashRoute();
  const stats = data ? computeStats(data) : null;
  const [unread, setUnread] = useState(0);
  const { containerRef, measureRef, visibleCount } = useOverflowNav(NAV_PRIORITY.length, !!session);
  const overflow = session ? NAV_PRIORITY.slice(visibleCount) : [];

  // Refetch on navigation so the badge clears after the Recommendations page
  // marks its inbox read (the page owns that state; this header doesn't).
  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    unreadRecommendationCount(user.id).then(setUnread).catch(() => setUnread(0));
  }, [user, route]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-edge/60 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4">
          <Logo />
          {session ? (
            <div ref={containerRef} className="relative min-w-0 flex-1 overflow-hidden">
              <nav aria-label="Primary" className="flex items-center gap-1">
                {NAV_PRIORITY.slice(0, visibleCount).map((n) => (
                  <NavButton
                    key={n.id}
                    path={n.path}
                    label={n.label}
                    match={n.match}
                    badge={n.badge === "unread" ? unread : undefined}
                  />
                ))}
              </nav>
              {/* Hidden measurement row: every candidate at full size, in priority
                  order, so the bar can be fitted to its real available width. */}
              <div
                ref={measureRef}
                aria-hidden
                className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-1"
              >
                {NAV_PRIORITY.map((n) => (
                  <NavButton
                    key={n.id}
                    path={n.path}
                    label={n.label}
                    match={n.match}
                    badge={n.badge === "unread" ? unread : undefined}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {stats && (
              <button
                onClick={() => navigate("/me")}
                className="hidden items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1.5 sm:flex"
              >
                <span className="text-xs text-fg-faint">Marathon</span>
                <span className="font-display text-sm font-black text-gold">{fmtHours(stats.hoursListened)}</span>
                <span className="text-xs text-fg-faint">/ {fmtHours(stats.totalRuntimeHours)}</span>
              </button>
            )}
            {session ? (
              <UserMenu overflow={overflow} unread={unread} />
            ) : (
              <button
                onClick={() => navigate("/login")}
                className="rounded-lg bg-gold px-3 py-1.5 text-sm font-bold text-on-accent hover:brightness-110"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
        <Ticker />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      <footer className="mt-16 border-t border-edge/60 py-8 text-center text-xs text-fg-faint">
        <p>
          <span className="font-display font-black text-fg-muted">DeanDB</span> · track your discography
          marathon, share it with friends. Keep spinning. 🎧
        </p>
        <p className="mt-1 text-fg-faint">© 2026 Kevin Hamby · All rights reserved.</p>
      </footer>
    </div>
  );
}
