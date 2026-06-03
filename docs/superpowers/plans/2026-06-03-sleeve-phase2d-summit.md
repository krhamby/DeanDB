# Sleeve — Phase 2d: The Summit + Hall of Fame Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the marathon a flagship payoff — when the goal is reached, the dashboard hero becomes a celebratory **Summit** moment (rationed neon) — and elevate the Hall of Fame top 3 into a gold/silver/bronze podium. Add a preview variant so the summit state is screenshot-verifiable.

**Architecture:** In `Dashboard.tsx`, when `stats.goalPct >= 100` the hero renders a celebratory Summit banner instead of the climb meter (token-driven, reduced-motion-aware glow). In `HallOfFame.tsx`, the top-3 rows get rank-colored accents. The preview harness gains a "Summit reached" Dashboard rendered against a derived all-completed journey.

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens.

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green; visual via `#/__preview` (new Summit section + Hall of Fame), both skins.

**Out of scope / follow-ups:** live badge-unlock toast system (global state + portal) — logged to `docs/superpowers/follow-ups.md`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/pages/Dashboard.tsx` | Modify | Hero shows a Summit celebration when `goalPct >= 100`, else the climb meter. |
| `src/pages/HallOfFame.tsx` | Modify | Rank-colored gold/silver/bronze accent on the top-3 rows. |
| `src/pages/Preview.tsx` | Modify | Add a "Dashboard — Summit reached" section using a derived all-completed journey. |
| `docs/superpowers/follow-ups.md` | Modify | Add the badge-toast follow-up item. |

---

## Task 1: The Summit celebration in the hero

**Files:** Modify `src/pages/Dashboard.tsx`

The hero Panel (from Phase 2b) currently always shows the climb meter. Make it conditional on the summit.

- [ ] **Step 1: branch the hero meter on summit**

Inside the hero `<Panel className="mt-6 overflow-hidden p-6 sm:p-7"> … </Panel>`, the content is the `<div className="flex flex-wrap items-end justify-between gap-4"> … </div>` (the hours/% row) followed by the `<div className="relative mt-5"> … </div>` (the climb meter). Wrap so that when summit is reached we show the celebration instead. Replace the Panel's children with:

```tsx
          {stats.goalPct >= 100 ? (
            <div
              className="animate-pop relative overflow-hidden rounded-xl border border-gold/50 bg-gradient-to-r from-gold/20 via-dean/10 to-transparent p-6 text-center"
              style={{ boxShadow: "0 0 32px -6px color-mix(in srgb, var(--color-gold) 50%, transparent)" }}
            >
              <div className="font-display text-[11px] uppercase tracking-[0.3em] text-gold">
                The Summit — conquered 👑
              </div>
              <div className="mt-2 font-display text-4xl font-black leading-none text-fg sm:text-5xl">
                🏔️ {fmtHours(animatedHours)}
              </div>
              <div className="mt-2 text-sm text-fg-muted">
                Every hour of the marathon, complete. The whole discography, conquered.
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint">
                    Total time logged
                  </div>
                  <div className="font-display text-5xl font-black leading-none text-gold sm:text-6xl">
                    {fmtHours(animatedHours)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-3xl font-black leading-none text-fg">
                    {animatedPct.toFixed(1)}%
                  </div>
                  <div className="mt-1 text-xs text-fg-faint">to the Summit</div>
                </div>
              </div>
              <div className="relative mt-5">
                <div className="relative h-4 w-full overflow-hidden rounded-full bg-fg/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-dean via-gold to-gold-soft transition-[width] duration-700"
                    style={{
                      width: `${Math.max(2, Math.min(100, stats.goalPct))}%`,
                      boxShadow: "0 0 16px color-mix(in srgb, var(--color-gold) 55%, transparent)",
                    }}
                  />
                  {[25, 50, 75].map((m) => (
                    <span key={m} className="absolute top-0 h-full w-px bg-fg/20" style={{ left: `${m}%` }} />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-xs text-fg-faint">
                  <span>0h</span>
                  <span>{fmtHours(stats.totalRuntimeHours)} — The Summit 👑</span>
                </div>
              </div>
            </>
          )}
```

- [ ] **Step 2:** `npm run typecheck` → PASS; `npm run build` → PASS.
- [ ] **Step 3: commit**
```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(summit): celebratory hero state when the marathon goal is reached"
```

---

## Task 2: Hall of Fame podium colors

**Files:** Modify `src/pages/HallOfFame.tsx`

Give ranks 1/2/3 gold/silver/bronze accents (today all top-3 share one gold treatment).

- [ ] **Step 1: add a rank-accent helper + apply it**

In `HallOfFame.tsx`, just before the `return`, add:
```tsx
  // Gold / silver / bronze accents for the podium; subtle edge for the rest.
  const rankClass = (i: number) =>
    i === 0
      ? "border-gold/60 bg-gradient-to-r from-gold/15 to-transparent"
      : i === 1
        ? "border-zinc-400/50 bg-gradient-to-r from-zinc-400/10 to-transparent"
        : i === 2
          ? "border-amber-700/50 bg-gradient-to-r from-amber-700/10 to-transparent"
          : "border-edge/70 bg-panel/70";
```
Then in the ranked `.map`, replace the row `className` template that currently does the `i < 3 ? "border-gold/40 …" : "border-edge/70 …"` ternary with `rankClass(i)`:
```tsx
                className={`flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 ${rankClass(i)}`}
```
(These silver/bronze tints read on both skins — they're translucent over the surface. Leave the medal emoji + `DeanMeter` as-is.)

- [ ] **Step 2:** `npm run typecheck` → PASS; `npm run build` → PASS.
- [ ] **Step 3: commit**
```bash
git add src/pages/HallOfFame.tsx
git commit -m "feat(hof): gold/silver/bronze podium accents for the top three"
```

---

## Task 3: Preview the Summit state

**Files:** Modify `src/pages/Preview.tsx`

- [ ] **Step 1: derive an all-completed journey + render a summit Dashboard**

In `src/pages/Preview.tsx`, after the `sampleJourney` import, build a summit variant (every non-excluded marathon album completed → `goalPct` 100). Add near the top of the component:
```tsx
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
```
(Import `DeanDBData` from `../types` if not already imported.) Then add a labeled section (place it right after the existing Dashboard section):
```tsx
      <section>
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">Dashboard — Summit reached</div>
        <Dashboard data={summitJourney} basePath="/__preview-summit" canEdit />
      </section>
```
(Match the existing section wrapper styling in Preview.tsx — reuse whatever label pattern the other sections use.)

- [ ] **Step 2:** `npm run typecheck` → PASS (the `as const` keeps `status` a valid `AlbumStatus`); `npm run build` → PASS.
- [ ] **Step 3: commit**
```bash
git add src/pages/Preview.tsx
git commit -m "chore(dev): preview the Summit-reached dashboard state"
```

---

## Task 4: follow-up note + QA

- [ ] **Step 1: log the badge-toast follow-up** — append to `docs/superpowers/follow-ups.md` under "Minor / polish":
```md
- [ ] **Live badge-unlock toasts:** when `useMyJourney` detects a newly unlocked achievement, surface a transient neon toast (portal + the existing `detectAndRecord` diff). Deferred from Phase 2d (needs global toast state).
```
Then `git add docs/superpowers/follow-ups.md && git commit -m "docs: note badge-toast follow-up"`.

- [ ] **Step 2: Gate** — `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 3 (controller, visual):** in `#/__preview`, screenshot the new "Summit reached" Dashboard (both skins) — confirm the celebratory banner with glow — and the Hall of Fame podium (gold/silver/bronze top three).

---

## Self-Review

**Spec coverage (§5.5):** Summit full-moment celebration (Task 1), Hall of Fame podium (Task 2); badge toasts explicitly deferred with a logged follow-up (Task 4). Neon rationed to the Summit/podium accents. ✓
**Placeholder scan:** complete code in each step; Task 4 Step 3 is an explicit controller visual check. ✓
**Type consistency:** reuses `stats`, `animatedHours`, `animatedPct`, `fmtHours` (Phase 2b) in Task 1; `status: "completed" as const` keeps `AlbumStatus` valid in Task 3. ✓
