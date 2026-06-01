import type { ReactNode } from "react";
import { navigate, useHashRoute } from "../lib/router";
import { useStore } from "../lib/store";
import { computeStats, flattenAlbums } from "../lib/stats";
import { fmtHours } from "../lib/format";

const NAV = [
  { path: "/", label: "Home" },
  { path: "/artists", label: "Artists" },
  { path: "/hall-of-fame", label: "Hall of Fame" },
  { path: "/editor", label: "Editor" },
];

function Logo() {
  return (
    <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
      <span className="grid h-9 place-items-center rounded-md bg-gold px-2.5 font-display text-xl font-black leading-none text-black shadow-[0_2px_0_rgba(0,0,0,0.4)]">
        Dean
      </span>
      <span className="font-display text-xl font-black tracking-tight text-white">
        DB
      </span>
    </button>
  );
}

function Ticker() {
  const { data } = useStore();
  if (!data) return null;
  const completed = flattenAlbums(data)
    .filter((a) => a.status === "completed" && a.rating != null)
    .sort((a, b) => (b.dateListened ?? "").localeCompare(a.dateListened ?? ""));
  if (completed.length === 0) return null;
  const items = completed.map(
    (a) => `${a.artistName} — ${a.title}  ★ ${a.rating?.toFixed(1)}`,
  );
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

export function Layout({ children }: { children: ReactNode }) {
  const hash = useHashRoute();
  const { data } = useStore();
  const active = hash.replace(/^#/, "") || "/";
  const stats = data ? computeStats(data) : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-edge/60 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav className="flex items-center gap-1">
            {NAV.map((n) => {
              const isActive = n.path === "/" ? active === "/" : active.startsWith(n.path);
              return (
                <button
                  key={n.path}
                  onClick={() => navigate(n.path)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                    isActive ? "bg-gold text-black" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {n.label}
                </button>
              );
            })}
          </nav>
          {stats && (
            <div className="hidden items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1.5 sm:flex">
              <span className="text-xs text-zinc-500">Marathon</span>
              <span className="font-display text-sm font-black text-gold">
                {fmtHours(stats.hoursListened)}
              </span>
              <span className="text-xs text-zinc-600">/ {stats.goalHours}h</span>
            </div>
          )}
        </div>
        <Ticker />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      <footer className="mt-16 border-t border-edge/60 py-8 text-center text-xs text-zinc-600">
        <p>
          <span className="font-display font-black text-zinc-400">DeanDB</span> · built for{" "}
          {data?.listener.name ?? "Dean"}, the realest music head we know. Keep spinning. 🎧
        </p>
      </footer>
    </div>
  );
}
