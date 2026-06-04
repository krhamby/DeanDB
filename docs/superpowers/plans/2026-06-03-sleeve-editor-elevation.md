# Sleeve — Editor "Mission Control" Full Elevation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Comprehensively elevate the Editor (the power-user "mission control") into a polished, command-center experience — **without changing any data logic** (all handlers/state/API calls stay identical). First make it screenshot-verifiable, then redesign every region.

**Architecture:** `src/lib/store.tsx` gains a dev-only `MockJourneyProvider` so `Preview.tsx` can render the Editor against the sample journey (it reads `useMyJourney` from context, not props). Then `Editor.tsx` is restyled region by region: a mission-control header + stats strip, a roster-first layout (imports tucked into a disclosure), a cohesive filter toolbar, richer artist cards (monogram + progress), and polished album rows (real status badges + tactile rating). Everything token-driven (both skins) and reduced-motion-safe.

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens · `gradient()`/`computeStats`/`artistProgress`.

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green; **visual via `#/__preview` (new Editor section) in both skins** — the controller screenshots + iterates. Live interactive flows are the user's to confirm in their account.

---

## Task 1: Make the Editor previewable

**Files:** `src/lib/store.tsx`, `src/pages/Preview.tsx`

- [ ] **Step 1:** in `store.tsx`, export a dev-only mock provider that supplies a `MyJourneyValue` from a `data` prop with no-op mutators (so the Editor renders for visual review without a real session). Place it near `MyJourneyProvider`:
```tsx
/** DEV-ONLY: supply a fixed journey so auth-gated editors render in the preview harness. */
export function MockJourneyProvider({ data, children }: { data: DeanDBData; children: ReactNode }) {
  const noop = () => {};
  const value: MyJourneyValue = {
    data,
    loading: false,
    userId: "preview-user",
    myUnlockedAchievementIds: new Set<string>(),
    reload: async () => data,
    patchLocal: noop,
    setAlbum: noop,
    setTrack: noop,
    setArtist: noop,
  };
  return <MyJourneyContext.Provider value={value}>{children}</MyJourneyContext.Provider>;
}
```
(`MyJourneyContext`/`MyJourneyValue` already exist in this file; just reference them.)

- [ ] **Step 2:** in `Preview.tsx`, import `MockJourneyProvider` + `Editor`, and add a section that renders the Editor against `sampleJourney`:
```tsx
      <section>
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">Editor (mission control)</div>
        <MockJourneyProvider data={sampleJourney}>
          <Editor />
        </MockJourneyProvider>
      </section>
```

- [ ] **Step 3:** `npm run typecheck && npm run build && npm run test` → PASS. Commit `chore(dev): preview the Editor via a mock journey provider`.

*(Controller then screenshots the Editor section as the BEFORE baseline.)*

---

## Task 2: Header + stats strip + roster-first imports

**Files:** `src/pages/Editor.tsx`

- [ ] **Step 1: stats strip.** Add a module-scope `Stat` component and a strip under the intro `<p>`:
```tsx
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-edge bg-panel/70 px-4 py-3">
      <div className="font-display text-2xl font-black leading-none text-fg">{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">{label}</div>
      {sub && <div className="text-[11px] text-fg-faint">{sub}</div>}
    </div>
  );
}
```
Compute `const stats = computeStats(data);` once after `const uid = userId;` (reuse it in the intro `<p>`), then render after the intro:
```tsx
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Artists" value={String(data.artists.length)} />
        <Stat label="Albums" value={String(stats.albumsTotal)} />
        <Stat label="Logged" value={fmtHours(stats.hoursListened)} sub={`of ${fmtHours(stats.totalRuntimeHours)}`} />
        <Stat label="Avg score" value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"} />
      </div>
```

- [ ] **Step 2: import disclosure.** Add `const [importOpen, setImportOpen] = useState(false);` with the other hooks, and an effect to auto-open when empty: `useEffect(() => { if (data) setImportOpen(data.artists.length === 0); }, []);` (place before the early return; import `useEffect`). Wrap the two import `<Panel>`s in a disclosure with a toggle button ("▾/▸ Add / import artists"), gated on `importOpen`. Keep the Panels' internals identical.

- [ ] **Step 3:** `npm run typecheck && npm run build` → PASS. Commit `feat(editor): mission-control stats + roster-first import disclosure`.

---

## Task 3: Cohesive filter toolbar + empty states

**Files:** `src/pages/Editor.tsx`

- [ ] **Step 1:** group the Roster heading + search + the favorites/expand buttons + the Selects into one cohesive toolbar `<Panel className="… p-3">` (or a bordered bar), so they read as a unit rather than two loose rows. Keep all existing controls + handlers; just restructure the container + spacing for a tidy command bar. Style the active "⭐ Favorites" + filter chips consistently (active = `bg-gold text-on-accent`, inactive = `border border-edge text-fg-muted`).
- [ ] **Step 2:** nicer empty state — when `shownArtists.length === 0`, render a centered panel with an icon + the existing contextual message + (when the roster is truly empty) a button that opens the import disclosure.
- [ ] **Step 3:** `npm run typecheck && npm run build` → PASS. Commit `feat(editor): cohesive filter toolbar + friendlier empty state`. *(Controller screenshots.)*

---

## Task 4: Richer artist cards + polished album rows

**Files:** `src/pages/Editor.tsx`

- [ ] **Step 1: artist header.** Add a `gradient(artist.color)` monogram (import `gradient` from `../lib/format`) before the artist name, and a slim `ProgressBar pct={artistProgress(artist)*100}` (import `artistProgress` from `../lib/stats`, `ProgressBar` already imported) under the name showing discography completion. Keep the Marathon/Library toggle + Actions menu.
- [ ] **Step 2: album row.** In the collapsed album button, replace the tiny status dot with a small `StatusBadge status={al.status}` (import already present) and keep the mini score; tidy the row spacing. In the expanded controls, make the rating a big live number next to the slider (mirror the Verdict composer): show `al.rating?.toFixed(1) ?? "—"` in `font-display text-2xl text-gold` beside the slider.
- [ ] **Step 3:** `npm run typecheck && npm run build && npm run test` → PASS. Commit `feat(editor): artist monogram + progress, status badges + tactile album rating`. *(Controller screenshots both skins.)*

---

## Task 5: QA

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 2: Code review** — NO data-logic change (handlers/state/API identical); `MockJourneyProvider` is dev-only (used only in Preview, which is `import.meta.env.DEV`-gated + tree-shaken); `computeStats` computed once; tokens throughout (both skins); monogram `text-white` is on-media over the gradient.
- [ ] **Step 3 (controller, visual):** screenshot the Editor section of `#/__preview` in Paper AND Midnight — stats strip, collapsed/expanded import disclosure, filter toolbar, artist cards (monogram + progress), album rows (status badge + tactile rating) all render correctly and legibly. Iterate on anything that looks off.
- [ ] **Step 4 (user, live):** confirm interactive flows (import, rate, filter, add) still work in the real Editor.

---

## Self-Review
**Coverage:** comprehensive Editor elevation (header/stats, roster-first imports, filter toolbar, artist cards, album rows) — presentation only, all logic preserved; made screenshot-verifiable via a dev-only mock provider. Both skins, reduced-motion-safe. ✓
**Placeholder scan:** concrete code for the enabling + additive parts; Tasks 3–4 give precise design direction the controller verifies by screenshot. ✓
**Type consistency:** `MockJourneyProvider(data)` supplies the existing `MyJourneyValue`; `Stat`, `computeStats`, `gradient`, `artistProgress`, `StatusBadge`, `ProgressBar` all real. ✓
