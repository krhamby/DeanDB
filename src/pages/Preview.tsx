// DEV-ONLY: #/__preview harness — renders every logged-in surface with
// fabricated sample data so we can screenshot without auth or Supabase.
// This file is imported by App.tsx behind an `import.meta.env.DEV` guard
// so it is tree-shaken out of production builds.

import { useThemeControl } from "../lib/store";
import { sampleJourney } from "../lib/__fixtures__/sampleJourney";
import { Dashboard } from "./Dashboard";
import type { DeanDBData } from "../types";
import { NextSpinner } from "../components/NextSpinner";
import { VerdictCard } from "../components/ShareCard";
import { AlbumDetail } from "./AlbumDetail";
import { ArtistDetail } from "./ArtistDetail";
import { HallOfFame } from "./HallOfFame";
import { Onboarding } from "./Onboarding";

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
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-10">
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

      {/* ── Dashboard ── */}
      <Section label="Dashboard">
        <Dashboard data={sampleJourney} basePath="/__preview" canEdit />
      </Section>

      {/* ── Dashboard — Summit reached ── */}
      <Section label="Dashboard — Summit reached">
        <Dashboard data={summitJourney} basePath="/__preview-summit" canEdit />
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
    </div>
  );
}
