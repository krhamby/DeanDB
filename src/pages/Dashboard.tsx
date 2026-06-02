import { computeAchievements, computeStats, flattenAlbums } from "../lib/stats";
import { fmtHours } from "../lib/format";
import { navigate } from "../lib/router";
import { Cover } from "../components/cards";
import { DeanMeter, Panel, ProgressBar, SectionTitle } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import { NextSpinner } from "../components/NextSpinner";
import type { DeanDBData } from "../types";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  // Long values (e.g. a genre name) get a smaller, wrapping treatment so they
  // never spill past the card edge.
  const long = value.length > 6;
  return (
    <Panel className="overflow-hidden p-4">
      <div
        className={`font-display font-black leading-tight text-white break-words ${
          long ? "text-xl" : "text-3xl"
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      {sub && <div className="mt-1 truncate text-xs text-gold">{sub}</div>}
    </Panel>
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
  const achievements = computeAchievements(data, stats);
  const unlocked = achievements.filter((a) => a.unlocked);

  const albums = flattenAlbums(data);
  // "Now spinning" is a marathon concept — logged Library artists aren't queued.
  const nowSpinning = albums.filter((a) => a.status === "listening" && !a.artistLogged);
  // Latest verdicts span the whole collection (a freshly logged favorite counts).
  const recent = albums
    .filter((a) => a.status === "completed" && a.rating != null)
    .sort((a, b) => (b.dateListened ?? "").localeCompare(a.dateListened ?? ""))
    .slice(0, 6);

  return (
    <div className="space-y-12">
      {/* ── Hero / marathon meter ── */}
      <section className="animate-pop">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
          {data.season}
        </div>
        <h1 className="mt-1 font-display text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
          {data.listener.name}&apos;s Discography Marathon
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-400">{data.listener.tagline}</p>

        <Panel className="mt-6 p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Total time logged
              </div>
              <div className="font-display text-5xl font-black text-gold">
                {fmtHours(stats.hoursListened)}
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl font-black text-white">
                {stats.goalPct.toFixed(1)}%
              </div>
              <div className="text-xs text-zinc-500">of {fmtHours(stats.totalRuntimeHours)} total runtime</div>
            </div>
          </div>
          <div className="mt-4">
            <ProgressBar pct={stats.goalPct} className="h-3" />
            <div className="mt-2 flex justify-between text-xs text-zinc-600">
              <span>0h</span>
              <span>{fmtHours(stats.totalRuntimeHours)} — The Summit 👑</span>
            </div>
          </div>
        </Panel>
      </section>

      {data.artists.length === 0 ? (
        canEdit ? (
          <EmptyState />
        ) : (
          <Panel className="px-6 py-16 text-center text-zinc-400">
            {data.listener.name} hasn&apos;t added any artists yet. 🎙️
          </Panel>
        )
      ) : (
        <>
          {/* ── What's next ── */}
          {stats.marathonArtistsTotal > 0 ? (
            <NextSpinner artists={data.artists} basePath={basePath} />
          ) : (
            <Panel className="px-6 py-10 text-center text-zinc-400">
              <div className="mb-2 text-4xl">📚</div>
              Everything here is in the Library — no marathon artists yet.
              {canEdit && (
                <>
                  {" "}
                  Start one in the{" "}
                  <button onClick={() => navigate("/editor")} className="text-gold hover:underline">
                    Editor
                  </button>
                  .
                </>
              )}
            </Panel>
          )}

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
        <StatCard label="Avg score" value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"} sub="Dean Meter" />
        <StatCard label="Songs rated" value={String(stats.songsRated)} />
        <StatCard label="Now spinning" value={String(stats.albumsListening)} />
        <StatCard label="Top genre" value={stats.topGenre ?? "—"} />
      </section>

      {/* ── Now spinning ── */}
      {nowSpinning.length > 0 && (
        <section>
          <SectionTitle kicker="On the turntable" title="Now Spinning" />
          <div className="flex flex-wrap gap-5">
            {nowSpinning.map((a) => (
              <button
                key={a.id}
                onClick={() => navigate(`${basePath}/album/${a.artistId}/${a.id}`)}
                className="group flex items-center gap-4 rounded-2xl border border-gold/30 bg-gradient-to-r from-gold/10 to-transparent p-3 pr-6 transition-transform hover:-translate-y-0.5"
              >
                <Cover colors={a.cover} title={a.title} coverUrl={a.coverUrl} size="sm" />
                <div className="text-left">
                  <div className="text-xs font-bold uppercase tracking-wide text-gold">▶ Live</div>
                  <div className="font-display text-lg font-black text-white">{a.title}</div>
                  <div className="text-sm text-zinc-400">{a.artistName}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Recent verdicts ── */}
      {recent.length > 0 && (
        <section>
          <SectionTitle kicker="Fresh off the needle" title="Latest Verdicts" />
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
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

      {/* ── Achievements ── */}
      <section>
        <SectionTitle
          kicker={`${unlocked.length} / ${achievements.length} unlocked`}
          title="Achievements"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((a) => {
            const secret = a.hidden && !a.unlocked;
            return (
              <Panel
                key={a.id}
                className={`flex items-center gap-3 p-4 transition-opacity ${
                  a.unlocked ? "" : "opacity-50 grayscale"
                } ${a.hidden && a.unlocked ? "border-gold/50" : ""}`}
              >
                <span className="text-3xl">{secret ? "❓" : a.unlocked ? a.emoji : "🔒"}</span>
                <div>
                  <div className="font-display font-black text-white">
                    {secret ? "Secret Achievement" : a.title}
                    {a.hidden && a.unlocked && (
                      <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide text-gold">
                        ★ secret
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
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
        </>
      )}
    </div>
  );
}
