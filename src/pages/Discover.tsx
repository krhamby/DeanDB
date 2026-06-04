import { useEffect, useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useMyJourney } from "../lib/store";
import { navigate } from "../lib/router";
import * as api from "../lib/api";
import { lookupArtist } from "../lib/musicbrainz";
import { loadArtistTracklists } from "../lib/tracklists";
import { GRADIENT_PALETTE, gradient, pickGradient } from "../lib/format";
import { Panel, SectionTitle } from "../components/ui";
import type { Artist, ArtistSuggestion } from "../types";

// Prompt ideas to get people who "don't know who to listen to" started.
const EXAMPLES = [
  "Moody 70s prog rock",
  "Upbeat hip-hop for the gym",
  "If I love Radiohead, who else?",
  "Cozy rainy-Sunday folk",
  "Female-fronted post-punk",
];

type AddStatus = "idle" | "adding" | "added" | "error";
interface AddState {
  status: AddStatus;
  msg?: string;
  artistId?: string;
}

/** Stable signature gradient for a suggestion card (deterministic, no flicker). */
const colorFor = (name: string): [string, string] =>
  GRADIENT_PALETTE[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % GRADIENT_PALETTE.length];

/** A taste score for ordering the seed list — verdict, else mean album rating. */
function tasteScore(a: Artist): number {
  if (a.verdict != null) return a.verdict;
  const rated = a.albums.map((al) => al.rating).filter((r): r is number => r != null);
  return rated.length ? rated.reduce((s, r) => s + r, 0) / rated.length : -1;
}

/** Cycling ".", "..", "..." so the add button shows active progress. */
function AddingDots() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x % 3) + 1), 350);
    return () => clearInterval(t);
  }, []);
  return <span className="inline-block w-3 text-left">{".".repeat(n)}</span>;
}

export function Discover() {
  const { data, userId, reload, patchLocal, setAlbum } = useMyJourney();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<ArtistSuggestion[] | null>(null);
  const [adds, setAdds] = useState<Record<string, AddState>>({});

  // Personalize with the listener's own taste; never re-suggest what they have.
  const excludeArtists = useMemo(() => (data ? data.artists.map((a) => a.name) : []), [data]);
  const seedArtists = useMemo(() => {
    if (!data) return [];
    return [...data.artists]
      .sort((x, y) => tasteScore(y) - tasteScore(x))
      .slice(0, 20)
      .map((a) => a.name);
  }, [data]);

  const setAdd = (key: string, patch: AddState) =>
    setAdds((m) => ({ ...m, [key]: { ...(m[key] ?? { status: "idle" }), ...patch } }));

  const run = async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setError("");
    setSuggestions(null);
    setAdds({});
    try {
      setSuggestions(await api.suggestArtists(p, { seedArtists, excludeArtists }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't fetch suggestions — try again.");
    } finally {
      setBusy(false);
    }
  };

  // One-click add: reuse the same MusicBrainz import path as the Editor, so the
  // artist lands with its full studio discography and real covers. Tracklists /
  // runtime can be pulled later from the Editor's "Load all tracklists".
  const add = async (s: ArtistSuggestion) => {
    if (!userId) return;
    const key = s.mbid ?? s.name;
    setAdd(key, { status: "adding", msg: "" });
    try {
      const match = await lookupArtist(s.name);
      if (!match) {
        setAdd(key, { status: "error", msg: "Couldn't import from MusicBrainz." });
        return;
      }
      const artistId = await api.importArtistFromMatch(userId, match, pickGradient(), pickGradient);
      const fresh = await reload();
      setAdd(key, {
        status: "added",
        artistId,
        msg: `${match.albums.length} album${match.albums.length === 1 ? "" : "s"} added`,
      });
      // Fill in tracklists + real runtimes in the background. Every MusicBrainz
      // call goes through the shared ~1 req/sec queue, so this won't trip rate
      // limits — even if several added artists are still loading at once.
      const added = fresh?.artists.find((a) => a.id === artistId);
      if (added) {
        void loadArtistTracklists(added, ({ albumId, titles, trackIds, runtimeMin }) => {
          patchLocal((d) => {
            for (const ar of d.artists) {
              const al = ar.albums.find((x) => x.id === albumId);
              if (al) {
                al.tracks = titles.map((t, i) => ({ id: trackIds[i], title: t, rating: null, favorite: false }));
                break;
              }
            }
            return d;
          });
          if (runtimeMin > 0) setAlbum(albumId, { minutes: runtimeMin });
        }).catch(() => {});
      }
    } catch (e) {
      setAdd(key, { status: "error", msg: e instanceof Error ? e.message : "Import failed." });
    }
  };

  return (
    <div className="space-y-8">
      <SectionTitle kicker="Discover" title="Find your next artist" />

      <Panel className="space-y-3 p-5">
        <p className="text-sm text-fg-muted">
          Describe a vibe, a mood, or an artist you love — get real artists to explore, each
          checked against MusicBrainz and one click from your journey.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run();
          }}
          rows={3}
          placeholder="e.g. moody 70s prog rock with long instrumental passages"
          className="w-full rounded-lg border border-[var(--color-edge-strong)] bg-panel-2 px-3 py-2 text-sm font-normal normal-case tracking-normal text-fg outline-none placeholder:text-fg-faint focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              className="rounded-full border border-edge px-3 py-1 text-xs text-fg-muted hover:border-gold/50 hover:text-fg"
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={run}
            disabled={busy || !prompt.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-on-accent hover:brightness-110 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            {busy ? "Consulting MusicBrainz…" : "Suggest artists"}
          </button>
          {busy && <span className="text-xs text-fg-faint">This takes a few seconds — checking each artist.</span>}
          {error && <span className="text-xs text-dean">{error}</span>}
        </div>
      </Panel>

      {suggestions && suggestions.length === 0 && !busy && (
        <p className="py-6 text-center text-sm text-fg-faint">
          No matches this time — try describing the vibe a little differently.
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 stagger-children">
          {suggestions.map((s) => {
            const key = s.mbid ?? s.name;
            const add$ = adds[key] ?? { status: "idle" as AddStatus };
            return (
              <Panel key={key} className="flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:border-gold/30">
                <div className="flex items-start gap-3">
                  <div
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-lg font-display text-xl font-black text-white/90 shadow-inner"
                    style={{ backgroundImage: gradient(colorFor(s.name)) }}
                    aria-hidden
                  >
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-base font-black leading-tight text-fg">{s.name}</div>
                    {s.genre && (
                      <div className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-fg-faint">
                        {s.genre}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-fg-muted">{s.reason}</p>
                <div className="mt-auto flex items-center gap-3 pt-1">
                  {add$.status === "added" ? (
                    <button
                      onClick={() => add$.artistId && navigate(`/artist/${add$.artistId}`)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-sm font-semibold text-[var(--color-status-done)] hover:opacity-80"
                    >
                      <Check className="h-4 w-4" aria-hidden /> Added — view in journey →
                    </button>
                  ) : (
                    <button
                      onClick={() => add(s)}
                      disabled={add$.status === "adding"}
                      className="rounded-lg bg-gold px-3 py-1.5 text-sm font-bold text-on-accent hover:brightness-110 disabled:opacity-40"
                    >
                      {add$.status === "adding" ? (
                        <span>
                          Adding
                          <AddingDots />
                        </span>
                      ) : (
                        "＋ Add to my journey"
                      )}
                    </button>
                  )}
                  {add$.msg && (
                    <span className={`text-xs ${add$.status === "error" ? "text-dean" : "text-fg-faint"}`}>
                      {add$.msg}
                    </span>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
