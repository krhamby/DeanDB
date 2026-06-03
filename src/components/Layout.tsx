import { useEffect, useRef, useState, type ReactNode } from "react";
import { navigate, useHashRoute } from "../lib/router";
import { useAuth, useMyJourney } from "../lib/store";
import { computeStats, flattenAlbums } from "../lib/stats";
import { fmtHours } from "../lib/format";
import { unreadRecommendationCount } from "../lib/api";
import { Avatar } from "./social";

// Journey covers all of the signed-in user's own journey routes (its bare
// shortcuts included), so the tab stays lit while browsing artists/albums.
const NAV: { path: string; label: string; match?: string[] }[] = [
  { path: "/me", label: "Journey", match: ["me", "artists", "artist", "album", "hall-of-fame"] },
  { path: "/feed", label: "Feed" },
];

function Logo() {
  return (
    <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
      <span className="grid h-9 place-items-center rounded-md bg-gold px-2.5 font-display text-xl font-black leading-none text-black shadow-[0_2px_0_rgba(0,0,0,0.4)]">
        Dean
      </span>
      <span className="font-display text-xl font-black tracking-tight text-white">DB</span>
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
    <div className="overflow-hidden border-y border-edge/60 bg-black/40 py-1.5">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap text-xs font-semibold text-zinc-400">
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
      className={`relative rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
        isActive ? "bg-gold text-black" : "text-zinc-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
      {badge ? (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-dean px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function UserMenu() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  if (!profile) return null;
  const go = (p: string) => {
    setOpen(false);
    navigate(p);
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2">
        <Avatar profile={profile} size={34} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-44 overflow-hidden rounded-xl border border-edge bg-panel-2 py-1 shadow-xl">
          <div className="border-b border-edge/60 px-3 py-2 text-xs text-zinc-500">@{profile.username}</div>
          <button onClick={() => go("/people")} className="block w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5">People</button>
          <button onClick={() => go("/editor")} className="block w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5">Editor</button>
          <button onClick={() => go("/settings")} className="block w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5">Settings</button>
          <button onClick={() => { setOpen(false); void signOut(); }} className="block w-full px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/5 hover:text-dean">Sign out</button>
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav className="flex items-center gap-1">
            {session && NAV.map((n) => <NavButton key={n.path} {...n} />)}
            {session && <NavButton path="/recommendations" label="Recs" badge={unread} />}
          </nav>
          <div className="flex items-center gap-3">
            {stats && (
              <button
                onClick={() => navigate("/me")}
                className="hidden items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1.5 sm:flex"
              >
                <span className="text-xs text-zinc-500">Marathon</span>
                <span className="font-display text-sm font-black text-gold">{fmtHours(stats.hoursListened)}</span>
                <span className="text-xs text-zinc-600">/ {fmtHours(stats.totalRuntimeHours)}</span>
              </button>
            )}
            {session ? (
              <UserMenu />
            ) : (
              <button
                onClick={() => navigate("/login")}
                className="rounded-lg bg-gold px-3 py-1.5 text-sm font-bold text-black hover:brightness-110"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
        <Ticker />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      <footer className="mt-16 border-t border-edge/60 py-8 text-center text-xs text-zinc-600">
        <p>
          <span className="font-display font-black text-zinc-400">DeanDB</span> · track your discography
          marathon, share it with friends. Keep spinning. 🎧
        </p>
      </footer>
    </div>
  );
}
