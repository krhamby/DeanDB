import { navigate } from "../lib/router";
import { Panel } from "./ui";

/** Shown when the marathon has no artists yet — keeps the blank slate intentional. */
export function EmptyState() {
  return (
    <Panel className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="text-6xl">🎙️</div>
      <h2 className="font-display text-2xl font-black text-fg">
        The marathon hasn&apos;t started yet
      </h2>
      <p className="max-w-md text-fg-muted">
        No artists on the board yet. Not sure where to start? Describe what you&apos;re in the
        mood for and let Discover suggest artists — or add a discography yourself in the
        Editor. Stats, covers, and the Hall of Fame fill in from there.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => navigate("/discover")}
          className="rounded-xl bg-gold px-5 py-2.5 font-bold text-black transition hover:brightness-110"
        >
          ✨ Find artists to start with →
        </button>
        <button
          onClick={() => navigate("/editor")}
          className="rounded-xl border border-edge px-5 py-2.5 font-bold text-fg-muted transition hover:text-fg"
        >
          + Add one yourself
        </button>
      </div>
    </Panel>
  );
}
