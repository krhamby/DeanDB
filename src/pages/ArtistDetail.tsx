import { useStore } from "../lib/store";
import { artistProgress } from "../lib/stats";
import { gradient } from "../lib/format";
import { navigate } from "../lib/router";
import { AlbumCard } from "../components/cards";
import { Panel, ProgressBar } from "../components/ui";

export function ArtistDetail({ artistId }: { artistId: string }) {
  const { data } = useStore();
  const artist = data?.artists.find((a) => a.id === artistId);

  if (!artist) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-400">Artist not found.</p>
        <button onClick={() => navigate("/artists")} className="mt-4 text-gold hover:underline">
          ← Back to artists
        </button>
      </div>
    );
  }

  const completed = artist.albums.filter((a) => a.status === "completed").length;
  const pct = artistProgress(artist) * 100;
  const order = { listening: 0, want: 1, completed: 2 } as const;
  const albums = [...artist.albums].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div>
      <button onClick={() => navigate("/artists")} className="mb-4 text-sm text-zinc-500 hover:text-gold">
        ← All artists
      </button>

      <div
        className="relative overflow-hidden rounded-3xl p-8"
        style={{ background: gradient(artist.color) }}
      >
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
            {artist.genre} · {artist.country}
          </div>
          <h1 className="font-display text-5xl font-black tracking-tight text-white drop-shadow">
            {artist.name}
          </h1>
          <p className="mt-2 max-w-2xl text-white/85">{artist.bio}</p>
        </div>
      </div>

      <Panel className="-mt-6 mx-2 flex items-center gap-6 p-5">
        <div>
          <div className="font-display text-3xl font-black text-gold">{Math.round(pct)}%</div>
          <div className="text-xs text-zinc-500">discography</div>
        </div>
        <div className="flex-1">
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-zinc-400">
              {completed} of {artist.catalogSize} albums completed
            </span>
            <span className="text-zinc-500">{artist.albums.length} tracked</span>
          </div>
          <ProgressBar pct={pct} className="h-2.5" />
        </div>
      </Panel>

      <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4">
        {albums.map((al) => (
          <AlbumCard key={al.id} album={al} artistId={artist.id} />
        ))}
      </div>
    </div>
  );
}
