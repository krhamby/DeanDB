import { useEffect } from "react";
import { Lock, MessageCircle, SearchX } from "lucide-react";
import { messagesPath, navigate, profilePath } from "../lib/router";
import { MeterNameProvider, useAuth, useJourney, useThemeControl } from "../lib/store";
import { resolveTheme } from "../lib/themes";
import { Avatar, FollowButton } from "../components/social";
import { ModerationMenu } from "../components/moderation";
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
        <div className="mb-3 flex justify-center"><SearchX className="h-12 w-12 text-fg-muted" aria-hidden /></div>
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
          {owner.visibility === "private" && (
            <span className="inline-flex items-center gap-1"> · <Lock className="h-3 w-3" aria-hidden /> private</span>
          )}
        </div>
      </div>
      {/* DMs open between people connected by an accepted follow in either
          direction; the thread itself re-verifies via can_dm (blocks included). */}
      {!view.canEdit &&
        (view.relationship?.followStatus === "accepted" || view.relationship?.followsMe) && (
          <button
            onClick={() => navigate(messagesPath(owner.username))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-edge px-4 py-2 text-sm font-bold text-fg-muted transition hover:text-fg"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Message
          </button>
        )}
      <FollowButton target={owner} initialStatus={view.relationship?.followStatus ?? null} onChanged={view.reloadRelationship} />
      {!view.canEdit && (
        <ModerationMenu
          target={{ id: owner.id, username: owner.username, displayName: owner.displayName }}
          onBlockChanged={() => void view.reloadRelationship()}
        />
      )}
    </Panel>
  );

  if (view.denied || !view.data) {
    return (
      <div className="mx-auto max-w-2xl">
        {Header}
        <Panel className="px-6 py-16 text-center text-fg-muted">
          <div className="mb-3 flex justify-center"><Lock className="h-12 w-12 text-fg-muted" aria-hidden /></div>
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
