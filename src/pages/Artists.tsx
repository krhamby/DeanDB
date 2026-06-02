import { useMemo, useState } from "react";
import { artistProgress } from "../lib/stats";
import { ArtistCard } from "../components/cards";
import { SectionTitle } from "../components/ui";
import type { DeanDBData } from "../types";

type Sort = "progress" | "name" | "albums";

export function Artists({ data, basePath = "" }: { data: DeanDBData; basePath?: string }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("progress");

  const artists = useMemo(() => {
    const filtered = data.artists.filter((a) =>
      `${a.name} ${a.genre}`.toLowerCase().includes(q.toLowerCase()),
    );
    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "albums") return b.albums.length - a.albums.length;
      return artistProgress(b) - artistProgress(a);
    });
  }, [data, q, sort]);

  return (
    <div>
      <SectionTitle kicker="The roster" title="Artists in the Marathon" />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search artists or genres…"
          className="flex-1 rounded-xl border border-edge bg-panel px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-gold/50"
        />
        <div className="flex gap-1 rounded-xl border border-edge bg-panel p-1">
          {(["progress", "name", "albums"] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                sort === s ? "bg-gold text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {artists.map((a) => (
          <ArtistCard key={a.id} artist={a} basePath={basePath} />
        ))}
      </div>
      {artists.length === 0 && (
        <p className="py-12 text-center text-zinc-500">No artists match “{q}”.</p>
      )}
    </div>
  );
}
