import { Layout } from "./components/Layout";
import { parseRoute, useHashRoute } from "./lib/router";
import { useStore } from "./lib/store";
import { Dashboard } from "./pages/Dashboard";
import { Artists } from "./pages/Artists";
import { ArtistDetail } from "./pages/ArtistDetail";
import { AlbumDetail } from "./pages/AlbumDetail";
import { HallOfFame } from "./pages/HallOfFame";
import { Editor } from "./pages/Editor";

function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="animate-pulse font-display text-2xl font-black text-gold">DeanDB</div>
    </div>
  );
}

function Router() {
  const hash = useHashRoute();
  const [head, a, b] = parseRoute(hash);

  switch (head) {
    case undefined:
      return <Dashboard />;
    case "artists":
      return <Artists />;
    case "artist":
      return <ArtistDetail artistId={a} />;
    case "album":
      return <AlbumDetail artistId={a} albumId={b} />;
    case "hall-of-fame":
      return <HallOfFame />;
    case "editor":
      return <Editor />;
    default:
      return <Dashboard />;
  }
}

export default function App() {
  const { loading, data } = useStore();
  return (
    <Layout>
      {loading || !data ? <Loading /> : <Router />}
    </Layout>
  );
}
