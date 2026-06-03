import type { ReactNode } from "react";
import { Layout } from "./components/Layout";
import { Panel } from "./components/ui";
import { parseRoute, parseUserRoute, useHashRoute, navigate } from "./lib/router";
import { MeterNameProvider, useAuth, useMyJourney } from "./lib/store";
import { supabaseEnabled } from "./lib/supabase";
import { JourneyNav } from "./components/JourneyNav";
import { Dashboard } from "./pages/Dashboard";
import { Artists } from "./pages/Artists";
import { ArtistDetail } from "./pages/ArtistDetail";
import { AlbumDetail } from "./pages/AlbumDetail";
import { HallOfFame } from "./pages/HallOfFame";
import { Editor } from "./pages/Editor";
import { Login } from "./pages/Login";
import { Settings } from "./pages/Settings";
import { Feed } from "./pages/Feed";
import { People } from "./pages/People";
import { Recommendations } from "./pages/Recommendations";
import { Profile } from "./pages/Profile";

function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="animate-pulse font-display text-2xl font-black text-gold">DeanDB</div>
    </div>
  );
}

/** Friendly landing for signed-out visitors. */
function Landing() {
  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <div className="text-6xl">🎧</div>
      <h1 className="mt-4 font-display text-4xl font-black text-white">DeanDB</h1>
      <p className="mt-3 text-zinc-400">
        Track your own discography marathon — every artist, album and track, rated and reviewed — and share
        the journey with friends.
      </p>
      <button
        onClick={() => navigate("/login")}
        className="mt-6 rounded-xl bg-gold px-6 py-3 font-bold text-black hover:brightness-110"
      >
        Get started
      </button>
    </div>
  );
}

/** Gate a route behind sign-in. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-400">Please sign in to continue.</p>
        <button onClick={() => navigate("/login")} className="mt-4 text-gold hover:underline">
          Sign in →
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

/** Renders the signed-in user's own journey pages (editable). */
function MyJourney({ rest }: { rest: string[] }) {
  const { data, loading, setAlbum, setTrack } = useMyJourney();
  if (loading) return <Loading />;
  if (!data) return <Loading />;
  const [head, a, b] = rest;
  let content;
  switch (head) {
    case undefined:
      content = <Dashboard data={data} canEdit basePath="" />;
      break;
    case "artists":
      content = <Artists data={data} basePath="" />;
      break;
    case "artist":
      content = <ArtistDetail data={data} artistId={a} basePath="" />;
      break;
    case "album":
      content = <AlbumDetail data={data} artistId={a} albumId={b} canEdit basePath="" setAlbum={setAlbum} setTrack={setTrack} />;
      break;
    case "hall-of-fame":
      content = <HallOfFame data={data} basePath="" />;
      break;
    default:
      content = <Dashboard data={data} canEdit basePath="" />;
  }

  return (
    <MeterNameProvider name={data.listener.meterName}>
      {data.artists.length > 0 && <JourneyNav basePath="" />}
      {content}
    </MeterNameProvider>
  );
}

function Router() {
  const hash = useHashRoute();
  const { session, loading } = useAuth();
  const segments = parseRoute(hash);
  const head = segments[0];

  // #/u/:username/... — another user's journey (read-only, RLS-gated).
  const userRoute = parseUserRoute(segments);
  if (userRoute) return <Profile username={userRoute.username} rest={userRoute.rest} />;

  switch (head) {
    case undefined:
      if (loading) return <Loading />;
      return session ? <Feed /> : <Landing />;
    case "login":
      return <Login />;
    case "me":
      return (
        <RequireAuth>
          <MyJourney rest={segments.slice(1)} />
        </RequireAuth>
      );
    // Bare journey shortcuts resolve to my own journey.
    case "artist":
    case "album":
    case "artists":
    case "hall-of-fame":
      return (
        <RequireAuth>
          <MyJourney rest={segments} />
        </RequireAuth>
      );
    case "editor":
      return (
        <RequireAuth>
          <Editor />
        </RequireAuth>
      );
    case "settings":
      return (
        <RequireAuth>
          <Settings />
        </RequireAuth>
      );
    case "feed":
      return (
        <RequireAuth>
          <Feed />
        </RequireAuth>
      );
    case "people":
      return (
        <RequireAuth>
          <People />
        </RequireAuth>
      );
    case "recommendations":
      return (
        <RequireAuth>
          <Recommendations />
        </RequireAuth>
      );
    default:
      return session ? <Feed /> : <Landing />;
  }
}

export default function App() {
  if (!supabaseEnabled) {
    return (
      <Layout>
        <Panel className="mx-auto max-w-md px-6 py-16 text-center text-zinc-400">
          <div className="mb-3 text-5xl">🔌</div>
          <p className="font-display text-lg font-black text-white">Backend not configured</p>
          <p className="mt-1 text-sm">
            Set <code className="text-gold">SUPABASE_URL</code> and{" "}
            <code className="text-gold">SUPABASE_ANON_KEY</code> in <code>src/lib/config.ts</code> to run DeanDB.
          </p>
        </Panel>
      </Layout>
    );
  }
  return (
    <Layout>
      <Router />
    </Layout>
  );
}
