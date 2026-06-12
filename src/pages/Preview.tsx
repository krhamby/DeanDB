// DEV-ONLY: #/__preview harness — renders every logged-in surface with
// fabricated sample data so we can screenshot without auth or Supabase.
// This file is imported by App.tsx behind an `import.meta.env.DEV` guard
// so it is tree-shaken out of production builds.

import { useThemeControl, MockJourneyProvider } from "../lib/store";
import { sampleJourney } from "../lib/__fixtures__/sampleJourney";
import { Dashboard } from "./Dashboard";
import { Editor } from "./Editor";
import type { DeanDBData } from "../types";
import { NextSpinner } from "../components/NextSpinner";
import { VerdictCard } from "../components/ShareCard";
import { AlbumDetail } from "./AlbumDetail";
import { ArtistDetail } from "./ArtistDetail";
import { HallOfFame } from "./HallOfFame";
import { Onboarding } from "./Onboarding";
import { Feed } from "./Feed";
import { People } from "./People";
import { Recommendations } from "./Recommendations";
import { Discover } from "./Discover";
import { FeedSkeleton, RecommendationsSkeleton, PeopleSearchSkeleton, JourneySkeleton } from "../components/skeletons";
import { Wordmark } from "../components/Wordmark";
import { DeanMeter, StatusBadge, SectionTitle } from "../components/ui";

// The first artist with a completed + rated album is Frank Ocean / Blonde.
const PREVIEW_ARTIST_ID = "artist-frank-ocean";
const PREVIEW_ALBUM_ID = "album-blonde";

// ─── small helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-fg-faint">
        {children}
      </span>
      <div className="h-px flex-1 bg-edge/50" />
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-edge/40 pt-10">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </section>
  );
}

// ─── Preview page ─────────────────────────────────────────────────────────────

export function Preview() {
  const { skin, setSkin } = useThemeControl();

  const summitJourney: DeanDBData = {
    ...sampleJourney,
    artists: sampleJourney.artists.map((a) =>
      a.logged
        ? a
        : {
            ...a,
            albums: a.albums.map((al) =>
              al.excluded ? al : { ...al, status: "completed" as const, dateListened: al.dateListened ?? "2024-12-31" },
            ),
          },
    ),
  };

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-10">
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-edge/60 bg-panel p-4">
        <div>
          <div className="font-display text-lg font-black text-fg">DeanDB Preview</div>
          <div className="text-xs text-fg-faint">dev only · not visible in production builds</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Skin:</span>
          <button
            onClick={() => setSkin("paper")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              skin === "paper" ? "bg-gold text-on-accent" : "border border-edge text-fg-muted hover:text-fg"
            }`}
          >
            Paper
          </button>
          <button
            onClick={() => setSkin("midnight")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              skin === "midnight" ? "bg-gold text-on-accent" : "border border-edge text-fg-muted hover:text-fg"
            }`}
          >
            Midnight
          </button>
        </div>
      </div>

      {/* ── Brand sheet ── */}
      <Section label="Brand">
        <div className="space-y-8">
          {/* Wordmark */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">Wordmark</div>
            <div className="flex flex-wrap items-end gap-6">
              <Wordmark size="hero" />
              <Wordmark size="nav" />
              <Wordmark size="footer" />
            </div>
          </div>

          {/* Palette */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">Palette</div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {([
                ["Gold", "bg-gold"],
                ["Dean", "bg-dean"],
                ["Panel", "bg-panel"],
                ["Panel 2", "bg-panel-2"],
                ["Surface", "bg-surface"],
                ["Edge", "bg-edge"],
              ] as const).map(([label, cls]) => (
                <div key={label} className="space-y-1">
                  <div className={`h-12 rounded-lg border border-edge ${cls}`} />
                  <div className="text-[11px] text-fg-faint">{label}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-sm font-semibold">
              <span className="text-fg">Foreground</span>
              <span className="text-fg-muted">Muted</span>
              <span className="text-fg-faint">Faint</span>
              <span className="text-[var(--color-status-done)]">Success</span>
              <span className="text-[var(--color-status-lib)]">Library</span>
              <span className="text-dean">Alert</span>
            </div>
          </div>

          {/* Type */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">Type</div>
            <div className="font-display text-4xl font-black text-fg">Fraunces display</div>
            <SectionTitle kicker="Editorial kicker" title="Section title" />
            <p className="max-w-prose text-sm text-fg-muted">
              Inter body — plain-spoken, a little playful; album-as-art reverence without snobbery.
            </p>
          </div>

          {/* Components */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">Components</div>
            <div className="flex flex-wrap items-center gap-5">
              <DeanMeter value={9.2} size={56} />
              <StatusBadge status="completed" />
              <StatusBadge status="listening" />
              <StatusBadge status="want" />
              <button className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-on-accent">Gold CTA</button>
            </div>
            {/* Nav active-tab treatment: gold underline, not a filled box */}
            <div className="flex items-center gap-1">
              <span className="relative rounded-lg px-3 py-1.5 text-sm font-semibold text-fg">
                Journey
                <span aria-hidden className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-gold" />
              </span>
              <span className="rounded-lg px-3 py-1.5 text-sm font-semibold text-fg-muted">Feed</span>
              <span className="rounded-lg px-3 py-1.5 text-sm font-semibold text-fg-muted">People</span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Dashboard (owner) ── */}
      <Section label="Dashboard (owner)">
        <Dashboard data={sampleJourney} basePath="/__preview" canEdit />
      </Section>

      {/* ── Dashboard (read-only viewer — no Wheel; trio must stay even) ── */}
      <Section label="Dashboard (read-only viewer)">
        <Dashboard data={sampleJourney} basePath="/__preview-viewer" />
      </Section>

      {/* ── Dashboard — Summit reached ── */}
      <Section label="Dashboard — Summit reached">
        <Dashboard data={summitJourney} basePath="/__preview-summit" canEdit />
      </Section>

      {/* ── Dashboard — chill mode (marathon off: no meter/Summit/Wheel) ── */}
      <Section label="Dashboard — Chill mode (marathon off)">
        <Dashboard data={{ ...sampleJourney, marathon: false }} basePath="/__preview-chill" canEdit />
      </Section>

      {/* ── Marathon Wheel ── */}
      <Section label="The Marathon Wheel">
        <NextSpinner artists={sampleJourney.artists} basePath="/__preview" />
      </Section>

      {/* ── Share card — Verdict ── */}
      <Section label="Share card — Verdict">
        <VerdictCard
          title="Blonde"
          artist="Frank Ocean"
          rating={10}
          review="A masterpiece of modern R&B that refuses easy categorisation — alien and warm at once."
          cover={["#5a2bd0", "#b1244a"]}
          meterName="Dean"
        />
      </Section>

      {/* ── Album / Verdict ── */}
      <Section label="Album Detail · Frank Ocean — Blonde">
        <AlbumDetail
          data={sampleJourney}
          artistId={PREVIEW_ARTIST_ID}
          albumId={PREVIEW_ALBUM_ID}
          canEdit
          basePath="/__preview"
          setAlbum={() => {}}
          setTrack={() => {}}
        />
      </Section>

      {/* ── Artist ── */}
      <Section label="Artist Detail · Radiohead">
        <ArtistDetail
          data={sampleJourney}
          artistId="artist-radiohead"
          basePath="/__preview"
        />
      </Section>

      {/* ── Hall of Fame ── */}
      <Section label="Hall of Fame">
        <HallOfFame data={sampleJourney} basePath="/__preview" />
      </Section>

      {/* ── Onboarding (empty journey) ── */}
      <Section label="Onboarding (empty journey)">
        <Onboarding />
      </Section>

      {/* ── Editor (mission control) ── */}
      <Section label="Editor (mission control)">
        <MockJourneyProvider data={sampleJourney}>
          <Editor />
        </MockJourneyProvider>
      </Section>

      {/* ── Feed (logged-out: empty state) ── */}
      <Section label="Feed (empty state / logged-out)">
        <Feed />
      </Section>

      {/* ── People (logged-out: search input + empty lists) ── */}
      <Section label="People (search input / logged-out)">
        <People />
      </Section>

      {/* ── Recommendations (logged-out: empty state) ── */}
      <Section label="Recommendations (empty state / logged-out)">
        <Recommendations />
      </Section>

      {/* ── Discover (logged-out: prompt panel) ── */}
      <Section label="Discover (prompt panel / logged-out)">
        <Discover />
      </Section>

      {/* ── Loading skeletons (shown while data resolves on the real pages) ── */}
      <Section label="Loading skeletons">
        <div className="space-y-8">
          <div>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">Journey</div>
            <JourneySkeleton />
          </div>
          <div>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">Feed</div>
            <FeedSkeleton count={2} />
          </div>
          <div>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">Recommendations</div>
            <RecommendationsSkeleton count={2} />
          </div>
          <div>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">People search</div>
            <div className="space-y-2">
              <PeopleSearchSkeleton />
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
