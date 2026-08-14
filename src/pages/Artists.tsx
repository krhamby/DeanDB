import { useMemo, useState } from "react";
import { artistProgress, libraryArtists, marathonArtists } from "../lib/stats";
import { ArtistCard } from "../components/cards";
import { SectionTitle } from "../components/ui";
import type { Artist, DeanDBData } from "../types";

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

  const marathon = marathonArtists(artists);
  const library = libraryArtists(artists);
  const section = (kicker: string, title: string, list: Artist[]) =>
    list.length > 0 && (
      <section className="mb-8">
        <SectionTitle kicker={kicker} title={title} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 stagger-children">
          {list.map((a) => (
            <ArtistCard key={a.id} artist={a} basePath={basePath} />
          ))}
        </div>
      </section>
    );

  return (
    <div>
      <SectionTitle kicker="The roster" title="Artists" />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search artists or genres…"
          className="flex-1 rounded-xl border border-[var(--color-edge-strong)] bg-panel px-4 py-2 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold"
        />
        <div className="flex gap-1 rounded-xl border border-edge bg-panel p-1">
          {(["progress", "name", "albums"] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                sort === s ? "bg-gold text-on-accent" : "text-fg-muted hover:text-fg"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {section("In the marathon", "The Marathon", marathon)}
      {section("Already heard", "The Library", library)}
      {artists.length === 0 && (
        <p className="py-12 text-center text-fg-faint">No artists match “{q}”.</p>
      )}
    </div>
  );
}
