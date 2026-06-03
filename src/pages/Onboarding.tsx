import { useState } from "react";
import { useMyJourney } from "../lib/store";
import { navigate } from "../lib/router";
import { lookupArtist } from "../lib/musicbrainz";
import { GRADIENT_PALETTE, gradient, pickGradient } from "../lib/format";
import * as api from "../lib/api";

// A tasteful, broad-appeal default starter set (acclaimed, deep discographies
// across genres). Editable later — this is just the day-one on-ramp.
const STARTERS: { name: string; genre: string }[] = [
  { name: "Radiohead", genre: "Art rock" },
  { name: "Frank Ocean", genre: "R&B" },
  { name: "Kendrick Lamar", genre: "Hip-hop" },
  { name: "Stevie Wonder", genre: "Soul" },
  { name: "Fleetwood Mac", genre: "Rock" },
  { name: "Daft Punk", genre: "Electronic" },
  { name: "Tame Impala", genre: "Psych-pop" },
  { name: "Sade", genre: "Quiet storm" },
];

/** Day-one on-ramp: pick one artist, we import their discography. */
export function Onboarding() {
  const { userId, reload } = useMyJourney();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [custom, setCustom] = useState("");

  const start = async (name: string) => {
    if (!userId || busy) return;
    setError("");
    setBusy(name);
    try {
      const match = await lookupArtist(name);
      if (!match) {
        setError(`Couldn't find "${name}" on MusicBrainz — try another spelling or pick one below.`);
        setBusy(null);
        return;
      }
      await api.importArtistFromMatch(userId, match, pickGradient(), pickGradient);
      await reload(); // Dashboard re-renders, now populated.
    } catch (e) {
      console.error("onboarding import failed", e);
      setError("Something went wrong importing that artist. Please try again.");
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-8 text-center">
      <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">Welcome to DeanDB</div>
      <h1 className="mx-auto mt-3 max-w-xl font-display text-4xl font-black leading-tight text-fg sm:text-5xl">
        Start with one artist.
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-fg-muted">
        Pick someone you love — we&apos;ll pull their whole discography so you can start rating right away.
        You can add more anytime.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STARTERS.map((s, i) => (
          <button
            key={s.name}
            onClick={() => start(s.name)}
            disabled={busy != null}
            className="group rounded-2xl border border-edge bg-panel/70 p-4 text-left transition hover:-translate-y-1 hover:border-gold/50 disabled:opacity-50"
          >
            <div
              className="h-16 w-16 rounded-xl shadow"
              style={{ background: gradient(GRADIENT_PALETTE[i % GRADIENT_PALETTE.length]) }}
            />
            <div className="mt-3 font-display text-base font-black text-fg">
              {busy === s.name ? "Adding…" : s.name}
            </div>
            <div className="text-xs text-fg-faint">{s.genre}</div>
          </button>
        ))}
      </div>

      <div className="mt-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Someone else?</div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && custom.trim() && start(custom.trim())}
            placeholder="Search any artist…"
            className="w-64 rounded-xl border border-edge bg-panel-2 px-4 py-2.5 text-fg outline-none placeholder:text-fg-faint focus:border-gold/50"
            aria-label="Search for an artist to start with"
          />
          <button
            onClick={() => custom.trim() && start(custom.trim())}
            disabled={busy != null || !custom.trim()}
            className="rounded-xl bg-gold px-5 py-2.5 font-bold text-on-accent transition hover:brightness-110 disabled:opacity-40"
          >
            Start &rarr;
          </button>
        </div>
        <button
          onClick={() => navigate("/editor")}
          className="mt-4 text-sm text-fg-muted hover:text-gold"
        >
          Or build your journey manually in the Editor &rarr;
        </button>
      </div>

      {busy && (
        <p className="mt-6 text-sm text-fg-muted">Pulling {busy}&apos;s discography from MusicBrainz&hellip;</p>
      )}
      {error && <p className="mt-4 text-sm font-semibold text-dean">{error}</p>}
    </div>
  );
}
