import { useEffect, useMemo, useRef, useState } from "react";
import type { Artist } from "../types";
import { gradient } from "../lib/format";
import { marathonArtists } from "../lib/stats";
import { navigate } from "../lib/router";
import { Panel } from "./ui";

// Picking your next artist is a DELIBERATE act, not an automatic one: the wheel
// sits idle until you spin, and the spin lands on a RANDOM artist among every
// marathon artist you haven't started yet. An artist you've begun but not
// finished is "in progress", not a candidate. No eligible artists ⇒ no wheel.

function isStarted(a: Artist): boolean {
  return a.albums.some((al) => al.status === "completed" || al.status === "listening");
}
function isConquered(a: Artist): boolean {
  // Conquered = every curated (non-excluded) album completed — consistent with
  // artistProgress/artistsConquered (keyed on the user's list, not catalogSize).
  const tracked = a.albums.filter((al) => !al.excluded);
  return tracked.length > 0 && tracked.every((al) => al.status === "completed");
}

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function randomOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Card outer width = content (152) + mx-2 margins (2×8). Centering is done with
// `left:50%` + translateX so no viewport measurement is needed.
const CARD_W = 168;
const SPIN_MS = 2800;

function ReelCard({ artist, active }: { artist: Artist; active: boolean }) {
  return (
    <div className="mx-2 shrink-0" style={{ width: 152 }}>
      <div
        className={`relative grid h-40 place-items-end overflow-hidden rounded-2xl border transition-shadow ${
          active ? "border-gold/70 shadow-[0_0_28px_rgba(245,197,24,0.28)]" : "border-edge/60"
        }`}
        style={{ background: gradient(artist.color) }}
      >
        <div className={`absolute inset-0 bg-black/45 transition-opacity ${active ? "opacity-100" : "opacity-100"}`} />
        <div className={`relative w-full p-3 ${active ? "" : "opacity-75"}`}>
          <div className="font-display text-lg font-black leading-tight text-white drop-shadow line-clamp-2">
            {artist.name}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-white/80">
            {artist.genre} · {artist.catalogSize} albums
          </div>
        </div>
      </div>
    </div>
  );
}

export function NextSpinner({ artists, basePath = "" }: { artists: Artist[]; basePath?: string }) {
  const pool = useMemo(() => marathonArtists(artists), [artists]);
  // Candidates = marathon artists not yet listened to (not started, so never conquered).
  const eligible = useMemo(() => pool.filter((a) => !isStarted(a)), [pool]);
  const inProgress = useMemo(() => pool.filter((a) => isStarted(a) && !isConquered(a)), [pool]);

  // Idle reel — a calm peek at who's waiting, centered, until the user spins.
  const idleReel = useMemo(() => {
    if (eligible.length === 0) return [] as Artist[];
    const base = shuffled(eligible);
    const out: Artist[] = [];
    while (out.length < Math.max(7, eligible.length)) out.push(...base);
    return out.slice(0, Math.max(7, eligible.length));
  }, [eligible]);

  const [reel, setReel] = useState<Artist[]>(idleReel);
  const [center, setCenter] = useState(() => Math.floor(idleReel.length / 2));
  const [animate, setAnimate] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [picked, setPicked] = useState<Artist | null>(null);
  const timer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  // Whenever the eligible set changes (edits, reload), return to a fresh idle reel.
  useEffect(() => {
    setReel(idleReel);
    setCenter(Math.floor(idleReel.length / 2));
    setAnimate(false);
    setSpinning(false);
    setPicked(null);
  }, [idleReel]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  if (eligible.length === 0) return null;

  const spin = () => {
    if (spinning) return;
    const target = randomOf(eligible);
    // A long blur run that ends on the target, with a little slack after it.
    const blur = Array.from({ length: 34 }, () => randomOf(eligible));
    const trail = Array.from({ length: 3 }, () => randomOf(eligible));
    const strip = [...blur, target, ...trail];
    const targetIndex = blur.length;

    setPicked(null);
    setSpinning(true);
    setReel(strip);
    // Jump to the start with NO transition, then animate to the target next frame.
    setAnimate(false);
    setCenter(2);
    raf.current = requestAnimationFrame(() => {
      raf.current = requestAnimationFrame(() => {
        setAnimate(true);
        setCenter(targetIndex);
      });
    });
    timer.current = window.setTimeout(() => {
      setSpinning(false);
      setAnimate(false);
      setPicked(target);
    }, SPIN_MS);
  };

  const translate = -(center * CARD_W + CARD_W / 2);

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col items-center gap-5 p-6">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">The Marathon Wheel</div>

        {/* Carousel viewport */}
        <div className="relative w-full">
          {/* center selection frame */}
          <div className="pointer-events-none absolute inset-y-2 left-1/2 z-10 w-[156px] -translate-x-1/2 rounded-2xl ring-2 ring-gold/70" />
          {/* edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-panel to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-panel to-transparent" />
          <div className="overflow-hidden py-2">
            <div
              className="relative left-1/2 flex"
              style={{
                transform: `translateX(${translate}px)`,
                transition: animate ? `transform ${SPIN_MS}ms cubic-bezier(0.16, 1, 0.2, 1)` : "none",
                filter: spinning ? "blur(0.6px)" : "none",
              }}
            >
              {reel.map((a, i) => (
                <ReelCard key={i} artist={a} active={!spinning && picked != null && i === center} />
              ))}
            </div>
          </div>
        </div>

        {/* Result / prompt */}
        {picked ? (
          <div className="flex animate-pop flex-col items-center gap-3">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-gold">🎉 Up next</div>
              <div className="font-display text-2xl font-black text-fg">{picked.name}</div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => navigate(`${basePath}/artist/${picked.id}`)}
                className="rounded-xl bg-gold px-5 py-2.5 font-bold text-black transition hover:brightness-110"
              >
                Start {picked.name} →
              </button>
              <button
                onClick={spin}
                className="rounded-xl border border-gold/40 px-5 py-2.5 font-semibold text-gold transition hover:bg-gold/10"
              >
                🎲 Spin again
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-fg-muted">
              {spinning
                ? "Finding your next artist…"
                : `${eligible.length} artist${eligible.length === 1 ? "" : "s"} waiting — let the wheel choose one at random.`}
            </p>
            <button
              onClick={spin}
              disabled={spinning}
              className="rounded-xl bg-gold px-6 py-2.5 font-bold text-black transition hover:brightness-110 disabled:opacity-50"
            >
              {spinning ? "🎡 Spinning…" : "🎲 Spin for my next artist"}
            </button>
          </div>
        )}

        {inProgress.length > 0 && (
          <div className="text-xs text-fg-faint">
            In progress:{" "}
            {inProgress.slice(0, 3).map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                <button
                  onClick={() => navigate(`${basePath}/artist/${a.id}`)}
                  className="font-semibold text-fg-muted hover:text-gold"
                >
                  {a.name}
                </button>
              </span>
            ))}
            {inProgress.length > 3 && ` +${inProgress.length - 3} more`}
          </div>
        )}
      </div>
    </Panel>
  );
}
