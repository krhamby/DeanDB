import { useId, useState } from "react";
import { Crown, HelpCircle, Library, Lock, Medal, Mic, Play } from "lucide-react";
import { computeAchievements, computeStats, flattenAlbums } from "../lib/stats";
import { shouldMaskSecret } from "../lib/achievements";
import { useMyJourney, useThemeControl } from "../lib/store";
import { legible, darken, lighten, pickOnAccent, SKIN_SURFACE } from "../lib/themes";
import { fmtHours } from "../lib/format";
import { useCountUp } from "../lib/useCountUp";
import { navigate } from "../lib/router";
import { Cover } from "../components/cards";
import { DeanMeter, Panel, SectionTitle } from "../components/ui";
import { Onboarding } from "./Onboarding";
import { NextSpinner } from "../components/NextSpinner";
import type { DeanDBData } from "../types";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  // Long values (e.g. a genre name) get a smaller, wrapping treatment so they
  // never spill past the card edge.
  const long = value.length > 6;
  return (
    <Panel className="overflow-hidden p-4">
      <div
        className={`font-display font-black leading-tight text-fg break-words ${
          long ? "text-xl" : "text-3xl"
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-fg-faint">{label}</div>
      {sub && <div className="mt-1 truncate text-xs text-gold">{sub}</div>}
    </Panel>
  );
}

/** A stencil mountain — the marathon's "climb to the Summit" motif. Used as a
 *  faint backdrop at the bottom of the meter/Summit card when nothing is currently
 *  spinning; the silhouette fills (gold) to the listener's progress. Decorative. */
function SummitMountain({ pct }: { pct: number }) {
  const id = useId();
  const climb = Math.max(0, Math.min(100, pct));
  const fillTop = 104 - (104 - 18) * (climb / 100); // base y=104 → summit y=18
  return (
    <svg viewBox="0 0 220 110" preserveAspectRatio="xMidYMax meet" className="h-full w-full text-fg" aria-hidden>
      <defs>
        <clipPath id={id}>
          <path d="M0 104 L64 36 L98 64 L138 18 L176 58 L220 104 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect x="0" y={fillTop} width="220" height="110" fill="var(--color-gold)" />
      </g>
      <path
        d="M0 104 L64 36 L98 64 L138 18 L176 58 L220 104"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Dashboard({
  data,
  basePath = "",
  canEdit = false,
}: {
  data: DeanDBData;
  /** Route prefix for links, e.g. "/u/dean" when viewing another journey. */
  basePath?: string;
  canEdit?: boolean;
}) {
  const stats = computeStats(data);
  const animatedHours = useCountUp(stats.hoursListened);
  const animatedPct = useCountUp(stats.goalPct);
  const achievements = computeAchievements(data, stats);
  const unlocked = achievements.filter((a) => a.unlocked);
  // Secret-achievement masking is keyed on whether the VIEWER (not this profile's
  // owner) has unlocked it — so secrets stay hidden on others' profiles too.
  const { myUnlockedAchievementIds } = useMyJourney();
  const { surface } = useThemeControl();

  const albums = flattenAlbums(data);
  // "Now spinning" is a marathon concept — logged Library artists aren't queued.
  const nowSpinning = albums.filter((a) => a.status === "listening" && !a.artistLogged);
  // Latest verdicts span the whole collection (a freshly logged favorite counts).
  const recent = albums
    .filter((a) => a.status === "completed" && a.rating != null)
    .sort((a, b) => (b.dateListened ?? "").localeCompare(a.dateListened ?? ""))
    .slice(0, 6);
  // Hall-of-Fame preview — top scores (mirrors HallOfFame.tsx; rating-sorted, not date).
  const top3 = [...albums]
    .filter((a) => a.rating != null)
    .sort((a, b) => (b.rating as number) - (a.rating as number))
    .slice(0, 3);

  // Disclosure: the closing trio shows a compact Achievements card; this reveals
  // the full grid (with masking intact) below the trio.
  const [showAllAch, setShowAllAch] = useState(false);

  // Hero "featured record" — freshest verdict, else what's currently spinning.
  // Drives the hero's SCOPED accent (cover-derived, gold-only like AlbumDetail).
  // (Intentionally NO lazy extractCover here — out of scope.)
  const featured = recent[0] ?? nowSpinning[0] ?? null;
  const heroAccent = featured ? legible(featured.dominantColor ?? featured.cover[0], surface) : null;
  const heroStyle = heroAccent
    ? ({
        ["--color-gold" as string]: heroAccent,
        ["--color-gold-soft" as string]:
          surface === SKIN_SURFACE.paper ? darken(heroAccent, 0.12) : lighten(heroAccent, 0.55),
        ["--color-on-accent" as string]: pickOnAccent(heroAccent),
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="space-y-12">
      {/* ── Hero / marathon meter ── */}
      <section className="animate-pop" style={heroStyle}>
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
          {data.season}
        </div>
        <h1 className="mt-1 font-display text-4xl font-black leading-tight tracking-tight text-fg sm:text-5xl">
          {data.listener.meterName}&apos;s Discography Marathon
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">{data.listener.tagline}</p>

        <div
          className={`mt-6 grid gap-6 ${
            featured ? "lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-stretch" : ""
          }`}
        >
          {/* LEFT — the marathon meter (or Summit) + the live "now spinning" pulse */}
          <div className="flex flex-col gap-6">
          <Panel className={`relative overflow-hidden p-6 sm:p-7 ${nowSpinning.length > 0 ? "" : "flex flex-1 flex-col justify-center"}`}>
            {nowSpinning.length === 0 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 opacity-[0.10]" aria-hidden>
                <SummitMountain pct={stats.goalPct} />
              </div>
            )}
            <div className="relative">
            {stats.goalPct >= 100 ? (
              <div
                className="animate-pop relative overflow-hidden rounded-xl border border-gold/50 bg-gradient-to-r from-gold/20 via-dean/10 to-transparent p-6 text-center"
                style={{ boxShadow: "0 0 32px -6px color-mix(in srgb, var(--color-gold) 50%, transparent)" }}
              >
                <div className="inline-flex items-center justify-center gap-1.5 font-display text-[11px] uppercase tracking-[0.3em] text-gold">
                  The Summit — conquered <Crown className="h-4 w-4" aria-hidden />
                </div>
                <div className="mt-2 font-display text-4xl font-black leading-none text-fg sm:text-5xl">
                  {fmtHours(animatedHours)}
                </div>
                <div className="mt-2 text-sm text-fg-muted">
                  Every hour of the marathon, complete. The whole discography, conquered.
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint">
                      Total time logged
                    </div>
                    <div className="font-display text-5xl font-black leading-none text-gold sm:text-6xl">
                      {fmtHours(animatedHours)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-3xl font-black leading-none text-fg">
                      {animatedPct.toFixed(1)}%
                    </div>
                    <div className="mt-1 text-xs text-fg-faint">to the Summit</div>
                  </div>
                </div>
                <div className="relative mt-5">
                  <div className="relative h-4 w-full overflow-hidden rounded-full bg-fg/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-dean via-gold to-gold-soft transition-[width] duration-700"
                      style={{
                        width: `${Math.max(2, Math.min(100, stats.goalPct))}%`,
                        boxShadow: "0 0 16px color-mix(in srgb, var(--color-gold) 55%, transparent)",
                      }}
                    />
                    {[25, 50, 75].map((m) => (
                      <span key={m} className="absolute top-0 h-full w-px bg-fg/20" style={{ left: `${m}%` }} />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-fg-faint">
                    <span>0h</span>
                    <span className="inline-flex items-center gap-1">{fmtHours(stats.totalRuntimeHours)} — The Summit <Crown className="h-4 w-4" aria-hidden /></span>
                  </div>
                </div>
              </>
            )}
            </div>
          </Panel>

          {nowSpinning.length > 0 && (
            <Panel className="flex-1 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-fg-faint">
                On the turntable
              </div>
              <div className="mt-3 space-y-3">
                {nowSpinning.slice(0, 2).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`${basePath}/album/${a.artistId}/${a.id}`)}
                    className="group flex w-full items-center gap-3 text-left transition-transform hover:-translate-y-0.5"
                  >
                    <Cover colors={a.cover} title={a.title} coverUrl={a.coverUrl} size="xs" />
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gold"><Play className="h-3 w-3 fill-current" aria-hidden /> Live</div>
                      <div className="truncate font-display text-sm font-black text-fg">{a.title}</div>
                      <div className="truncate text-xs text-fg-muted">{a.artistName}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
          )}
          </div>

          {/* RIGHT — the hero's companion "featured record" card */}
          {featured && (
            <Panel className="p-0">
              <button
                onClick={() => navigate(`${basePath}/album/${featured.artistId}/${featured.id}`)}
                className="group flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-gold/30 bg-gradient-to-b from-gold/10 to-transparent p-6 text-center transition-transform hover:-translate-y-0.5"
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-fg-faint">
                  Featured · latest verdict
                </div>
                <Cover colors={featured.cover} title={featured.title} coverUrl={featured.coverUrl} size="md" />
                <div>
                  <div className="font-display text-lg font-black leading-tight text-fg">{featured.title}</div>
                  <div className="text-sm text-fg-muted">{featured.artistName}</div>
                </div>
                <DeanMeter value={featured.rating} size={56} />
              </button>
            </Panel>
          )}
        </div>
      </section>

      {data.artists.length === 0 ? (
        canEdit ? (
          <Onboarding />
        ) : (
          <Panel className="flex flex-col items-center gap-3 px-6 py-16 text-center text-fg-muted">
            <Mic className="h-12 w-12 text-fg-muted" aria-hidden />
            {data.listener.meterName} hasn&apos;t added any artists yet.
          </Panel>
        )
      ) : (
        <>
          {/* ── What's next (owner-only — the marathon "what to play next" tool) ── */}
          {canEdit &&
            (stats.marathonArtistsTotal > 0 ? (
              <NextSpinner artists={data.artists} basePath={basePath} />
            ) : (
              <Panel className="px-6 py-10 text-center text-fg-muted">
                <div className="mb-2 flex justify-center"><Library className="h-10 w-10" aria-hidden /></div>
                Everything here is in the Library — no marathon artists yet. Start one in the{" "}
                <button onClick={() => navigate("/editor")} className="text-gold hover:underline">
                  Editor
                </button>
                .
              </Panel>
            ))}

      {/* ── Stat grid ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Albums done" value={String(stats.albumsCompleted)} />
        <StatCard
          label="Artists"
          value={String(stats.marathonArtistsTotal)}
          sub={
            stats.libraryArtistsTotal > 0
              ? `${stats.artistsConquered} conquered · ${stats.libraryArtistsTotal} library`
              : `${stats.artistsConquered} conquered`
          }
        />
        <StatCard label="Avg score" value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"} sub={`${data.listener.meterName} Meter`} />
        <StatCard label="Songs rated" value={String(stats.songsRated)} />
        <StatCard label="Now spinning" value={String(stats.albumsListening)} />
        <StatCard label="Top genre" value={stats.topGenre ?? "—"} />
      </section>

      {/* ── Recent verdicts ── */}
      {recent.length > 0 && (
        <section>
          <SectionTitle kicker="Fresh off the needle" title="Latest Verdicts" />
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 stagger-children">
            {recent.map((a) => (
              <button
                key={a.id}
                onClick={() => navigate(`${basePath}/album/${a.artistId}/${a.id}`)}
                className="group flex flex-col items-center gap-2 transition-transform hover:-translate-y-1"
              >
                <Cover colors={a.cover} title={a.title} coverUrl={a.coverUrl} size="sm" />
                <DeanMeter value={a.rating} size={44} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Closing trio: Achievements · Hall of Fame · Now-Spinning/Season ──
          A balanced three-across row (single column on mobile). Identical for
          owner and read-only viewer — no canEdit branch. */}
      <div className="grid gap-4 lg:grid-cols-3 items-stretch stagger-children">
        {/* Card A — Achievements (compact) */}
        <Panel className="flex h-full flex-col p-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-fg-faint">
              Achievements
            </span>
            <span className="text-xs font-semibold text-gold">
              {unlocked.length} / {achievements.length}
            </span>
          </div>
          <div className="mt-4 flex-1 space-y-2.5">
            {unlocked.length === 0 ? (
              <p className="text-sm text-fg-faint">No achievements unlocked yet — keep listening.</p>
            ) : (
              unlocked.slice(0, 4).map((a) => {
                const secret = shouldMaskSecret(a, myUnlockedAchievementIds.has(a.id));
                const Icon = a.Icon;
                return (
                  <div key={a.id} className="flex items-center gap-3">
                    {secret ? (
                      <HelpCircle className="h-6 w-6 text-fg-faint" aria-hidden />
                    ) : (
                      <Icon className="h-6 w-6 text-gold" aria-hidden />
                    )}
                    <span className="truncate font-display text-sm font-black text-fg">
                      {secret ? "Secret Achievement" : a.title}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <button
            onClick={() => setShowAllAch((v) => !v)}
            className="mt-4 self-start text-xs font-semibold text-gold hover:underline"
          >
            {showAllAch ? "Hide all ↑" : "View all →"}
          </button>
        </Panel>

        {/* Card B — Hall of Fame (preview) */}
        <Panel className="flex h-full flex-col p-5">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-fg-faint">
            Hall of Fame
          </span>
          <div className="mt-4 flex-1 space-y-2.5">
            {top3.length === 0 ? (
              <p className="text-sm text-fg-faint">No inductees yet.</p>
            ) : (
              top3.map((a, i) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`${basePath}/album/${a.artistId}/${a.id}`)}
                  className="group flex w-full items-center gap-3 text-left transition-transform hover:-translate-y-0.5"
                >
                  <span className="grid w-6 shrink-0 place-items-center">
                    <Medal
                      className={`h-5 w-5 ${i === 0 ? "text-gold" : i === 1 ? "text-zinc-400" : "text-amber-700"}`}
                      aria-label={`Rank ${i + 1}`}
                    />
                  </span>
                  <Cover colors={a.cover} title={a.title} coverUrl={a.coverUrl} size="xs" />
                  <span className="min-w-0 flex-1 truncate font-display text-sm font-black text-fg">
                    {a.title}
                  </span>
                  <DeanMeter value={a.rating} size={36} />
                </button>
              ))
            )}
          </div>
          <button
            onClick={() => navigate(`${basePath}/hall-of-fame`)}
            className="mt-4 self-start text-xs font-semibold text-gold hover:underline"
          >
            See the Hall of Fame →
          </button>
        </Panel>

        {/* Card C — This Season (Now Spinning now lives in the hero) */}
        <Panel className="flex h-full flex-col p-5">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-fg-faint">
            This Season
          </span>
          <div className="mt-4 flex-1 space-y-1">
            <div className="font-display text-lg font-black leading-tight text-fg">{data.season}</div>
            <div className="text-sm text-fg-muted">{fmtHours(stats.hoursListened)} logged</div>
            <div className="text-xs font-semibold text-gold">
              {stats.goalPct.toFixed(0)}% to the Summit
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Full achievements (disclosure) — masking preserved verbatim ── */}
      {showAllAch && (
        <section>
          <SectionTitle
            kicker={`${unlocked.length} / ${achievements.length} unlocked`}
            title="Achievements"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.map((a) => {
              const secret = shouldMaskSecret(a, myUnlockedAchievementIds.has(a.id));
              const Icon = a.Icon;
              return (
                <Panel
                  key={a.id}
                  className={`flex items-center gap-3 p-4 transition-opacity ${
                    a.unlocked ? "" : "opacity-50 grayscale"
                  } ${a.hidden && a.unlocked ? "border-gold/50" : ""}`}
                >
                  {secret ? (
                    <HelpCircle className="h-7 w-7 shrink-0 text-fg-faint" aria-hidden />
                  ) : a.unlocked ? (
                    <Icon className="h-7 w-7 shrink-0 text-gold" aria-hidden />
                  ) : (
                    <Lock className="h-7 w-7 shrink-0 text-fg-faint" aria-hidden />
                  )}
                  <div>
                    <div className="font-display font-black text-fg">
                      {secret ? "Secret Achievement" : a.title}
                      {a.hidden && !secret && (
                        <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide text-gold">
                          ★ secret
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-fg-faint">
                      {secret ? "Keep listening to reveal this one…" : a.desc}
                    </div>
                    {!a.unlocked && !a.hidden && a.progress && (
                      <div className="mt-0.5 text-xs font-semibold text-gold">{a.progress}</div>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        </section>
      )}
        </>
      )}
    </div>
  );
}
