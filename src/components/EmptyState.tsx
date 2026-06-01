import { navigate } from "../lib/router";
import { Panel } from "./ui";

/** Shown when the marathon has no artists yet — keeps the blank slate intentional. */
export function EmptyState() {
  return (
    <Panel className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="text-6xl">🎙️</div>
      <h2 className="font-display text-2xl font-black text-white">
        The marathon hasn&apos;t started yet
      </h2>
      <p className="max-w-md text-zinc-400">
        No artists on the board. Head to the Editor to add the first discography —
        the stats, covers, and Hall of Fame fill in from there.
      </p>
      <button
        onClick={() => navigate("/editor")}
        className="rounded-xl bg-gold px-5 py-2.5 font-bold text-black transition hover:brightness-110"
      >
        + Add the first artist →
      </button>
    </Panel>
  );
}
