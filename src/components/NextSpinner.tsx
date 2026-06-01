import { useRef, useState } from "react";
import type { Artist } from "../types";
import { gradient } from "../lib/format";
import { navigate } from "../lib/router";
import { Panel } from "./ui";

// Dean works through the queue in order, so "next up" is deterministic — but
// the reveal should still be a little ceremony. The reel spins through every
// artist's name and lands on the next one he hasn't started.

function isStarted(a: Artist): boolean {
  return a.albums.some((al) => al.status === "completed" || al.status === "listening");
}
function isConquered(a: Artist): boolean {
  return (
    a.albums.length > 0 &&
    a.albums.every((al) => al.status === "completed") &&
    a.albums.length >= a.catalogSize
  );
}

export function NextSpinner({ artists }: { artists: Artist[] }) {
  // Queue order = the order artists were added. Next = first un-started one.
  const queue = artists.filter((a) => !isConquered(a));
  const current = queue.find(isStarted) ?? null;
  const upNext = queue.find((a) => !isStarted(a)) ?? null;

  const [display, setDisplay] = useState<Artist | null>(upNext);
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<number | null>(null);

  if (artists.length === 0) return null;

  const spin = () => {
    if (spinning || !upNext) return;
    setRevealed(false);
    setSpinning(true);
    const start = Date.now();
    const duration = 2600;
    let i = 0;
    const tick = () => {
      const elapsed = Date.now() - start;
      // Cycle visible names, decelerating as we approach the end.
      setDisplay(artists[i % artists.length]);
      i++;
      if (elapsed >= duration) {
        setDisplay(upNext);
        setSpinning(false);
        setRevealed(true);
        return;
      }
      const delay = 60 + Math.pow(elapsed / duration, 3) * 320;
      timer.current = window.setTimeout(tick, delay);
    };
    tick();
  };

  const shown = display ?? upNext ?? current;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col items-center gap-4 p-6">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
          The Marathon Wheel
        </div>

        {/* The reel */}
        <div className="relative w-full max-w-md">
          <div
            className={`grid place-items-center rounded-2xl border border-edge px-4 py-8 transition-shadow ${
              spinning ? "shadow-[0_0_30px_rgba(245,197,24,0.25)]" : ""
            }`}
            style={{
              background: shown ? gradient(shown.color) : "linear-gradient(135deg,#1d1d24,#15151a)",
            }}
          >
            <div className="absolute inset-0 rounded-2xl bg-black/40" />
            <div className="relative text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/70">
                {spinning ? "Spinning…" : revealed ? "🎉 Up next" : "Next artist"}
              </div>
              <div
                className={`font-display text-3xl font-black tracking-tight text-white drop-shadow sm:text-4xl ${
                  spinning ? "blur-[1px]" : "animate-pop"
                }`}
              >
                {shown ? shown.name : "—"}
              </div>
              {!spinning && shown && (
                <div className="mt-1 text-sm text-white/80">
                  {shown.genre} · {shown.catalogSize} albums
                </div>
              )}
            </div>
          </div>
        </div>

        {current && (
          <div className="text-xs text-zinc-500">
            Currently spinning: <span className="text-zinc-300">{current.name}</span>
          </div>
        )}

        {!upNext ? (
          <p className="text-sm text-zinc-500">
            🏁 No artists waiting in the queue — add more in the Editor!
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={spin}
              disabled={spinning}
              className="rounded-xl bg-gold px-5 py-2.5 font-bold text-black transition hover:brightness-110 disabled:opacity-50"
            >
              {spinning ? "🎡 Spinning…" : revealed ? "🎡 Spin again" : "🎡 Reveal next artist"}
            </button>
            {revealed && shown && (
              <button
                onClick={() => navigate(`/artist/${shown.id}`)}
                className="rounded-xl border border-gold/40 px-5 py-2.5 font-semibold text-gold transition hover:bg-gold/10"
              >
                Open {shown.name} →
              </button>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
