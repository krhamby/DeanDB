import { useEffect } from "react";
import { profilePath } from "../lib/router";
import { MeterNameProvider, useAuth, useJourney, useThemeControl } from "../lib/store";
import { resolveTheme } from "../lib/themes";
import { Avatar, FollowButton } from "../components/social";
import { JourneyNav } from "../components/JourneyNav";
import { Panel } from "../components/ui";
import { JourneySkeleton } from "../components/skeletons";
import { Dashboard } from "./Dashboard";
import { Artists } from "./Artists";
import { ArtistDetail } from "./ArtistDetail";
import { AlbumDetail } from "./AlbumDetail";
import { HallOfFame } from "./HallOfFame";

/**
 * Resolves `#/u/:username/...` to that user's read-only journey, gated by RLS.
 * `rest` is the remaining route segments after the username.
 */
export function Profile({ username, rest }: { username: string; rest: string[] }) {
  const view = useJourney(username);
  const basePath = profilePath(username);
  const { setThemeOverride } = useThemeControl();
  const { profile: myProfile } = useAuth();

  // While viewing someone else's visible journey, paint the app in their accent.
  // Own journey (canEdit) already uses the global theme, so it's left alone.
  // Accessibility: if the viewer locked their own theme, never apply a profile's.
  const owner = view.owner;
  const themed = Boolean(view.data) && !view.canEdit && !myProfile?.lockOwnTheme;
  const accent = owner?.themeAccent;
  const secondary = owner?.themeSecondary;
  useEffect(() => {
    if (!themed) return;
    setThemeOverride(resolveTheme({ themeAccent: accent, themeSecondary: secondary }));
    return () => setThemeOverride(null);
  }, [themed, accent, secondary, setThemeOverride]);

  if (view.loading) {
    return <JourneySkeleton />;
  }

  if (view.notFound || !owner) {
    return (
      <Panel className="mx-auto max-w-md px-6 py-16 text-center text-fg-muted">
        <div className="mb-3 text-5xl">🤷</div>
        No journey found at <span className="text-gold">@{username}</span>.
      </Panel>
    );
  }

  const Header = (
    <Panel className="mb-6 flex flex-wrap items-center gap-4 p-5">
      <Avatar profile={owner} size={64} />
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-black text-fg">{owner.displayName}</h1>
        <div className="text-sm text-fg-faint">
          @{owner.username}
          {owner.visibility === "private" && " · 🔒 private"}
        </div>
      </div>
      <FollowButton target={owner} initialStatus={view.relationship?.followStatus ?? null} onChanged={view.reloadRelationship} />
    </Panel>
  );

  if (view.denied || !view.data) {
    return (
      <div className="mx-auto max-w-2xl">
        {Header}
        <Panel className="px-6 py-16 text-center text-fg-muted">
          <div className="mb-3 text-5xl">🔒</div>
          <p className="font-display text-lg font-black text-fg">This journey is private</p>
          <p className="mt-1 text-sm">Follow {owner.displayName} and wait for them to accept to see their marathon.</p>
        </Panel>
      </div>
    );
  }

  const data = view.data;
  const [head, a, b] = rest;

  let content;
  switch (head) {
    case undefined:
      content = <Dashboard data={data} basePath={basePath} />;
      break;
    case "artists":
      content = <Artists data={data} basePath={basePath} />;
      break;
    case "artist":
      content = <ArtistDetail data={data} artistId={a} basePath={basePath} />;
      break;
    case "album":
      content = <AlbumDetail data={data} artistId={a} albumId={b} basePath={basePath} />;
      break;
    case "hall-of-fame":
      content = <HallOfFame data={data} basePath={basePath} />;
      break;
    default:
      content = <Dashboard data={data} basePath={basePath} />;
  }

  return (
    <MeterNameProvider name={data.listener.meterName}>
      {Header}
      {data.artists.length > 0 && <JourneyNav basePath={basePath} />}
      {content}
    </MeterNameProvider>
  );
}
