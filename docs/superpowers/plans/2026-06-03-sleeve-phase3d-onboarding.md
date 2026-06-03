# Sleeve — Phase 3d: Gentle Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A new signed-in user with an empty journey lands on a warm "start with one artist" picker (a curated default set + a search escape hatch) that imports the chosen artist's full discography and drops them on a populated dashboard — the "aha" before any chore.

**Architecture:** A new `src/pages/Onboarding.tsx` reuses the EXACT import path the Editor uses (`lookupArtist` → `api.importArtistFromMatch` → `reload`). It renders where the bare `EmptyState` did — in `Dashboard`'s `canEdit && data.artists.length === 0` branch — so a brand-new owner sees onboarding instead of an empty shell. On import, `reload()` repopulates `useMyJourney`, the Dashboard re-renders with the new artist. Token-driven; curated starter set is a tasteful default (editable later).

**Tech Stack:** React 18 + TS strict · existing `lib/musicbrainz` + `lib/api` import flow · Tailwind v4 tokens.

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green; visual by screenshotting the picker in `#/__preview` (live import needs auth+network, but reuses the Editor's tested path).

**Out of scope:** changing the import internals; multi-artist onboarding (one artist by design).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/pages/Onboarding.tsx` | Create | Starter-artist picker + search; imports via the existing flow; loading/error states. |
| `src/pages/Dashboard.tsx` | Modify | Render `<Onboarding />` in the `canEdit` empty-journey branch (was `<EmptyState />`). |
| `src/pages/Preview.tsx` | Modify | Add an "Onboarding" section rendering `<Onboarding />`. |

---

## Task 1: The Onboarding page

**Files:** Create `src/pages/Onboarding.tsx`

- [ ] **Step 1: write `src/pages/Onboarding.tsx`** (complete file)

```tsx
import { useState } from "react";
import { useMyJourney } from "../lib/store";
import { navigate } from "../lib/router";
import { lookupArtist } from "../lib/musicbrainz";
import { GRADIENT_PALETTE, gradient, pickGradient } from "../lib/format";
import * as api from "../lib/api";

// A tasteful, broad-appeal default starter set (acclaimed, deep discographies
// across genres). Editable later — this is just the day-one on-ramp.
const STARTERS: { name: string; genre: string }[] = [
  { name: "Radiohead", genre: "Art rock" },
  { name: "Frank Ocean", genre: "R&B" },
  { name: "Kendrick Lamar", genre: "Hip-hop" },
  { name: "Stevie Wonder", genre: "Soul" },
  { name: "Fleetwood Mac", genre: "Rock" },
  { name: "Daft Punk", genre: "Electronic" },
  { name: "Tame Impala", genre: "Psych-pop" },
  { name: "Sade", genre: "Quiet storm" },
];

/** Day-one on-ramp: pick one artist, we import their discography. */
export function Onboarding() {
  const { userId, reload } = useMyJourney();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [custom, setCustom] = useState("");

  const start = async (name: string) => {
    if (!userId || busy) return;
    setError("");
    setBusy(name);
    try {
      const match = await lookupArtist(name);
      if (!match) {
        setError(`Couldn't find "${name}" on MusicBrainz — try another spelling or pick one below.`);
        setBusy(null);
        return;
      }
      await api.importArtistFromMatch(userId, match, pickGradient(), pickGradient);
      await reload(); // Dashboard re-renders, now populated.
    } catch (e) {
      console.error("onboarding import failed", e);
      setError("Something went wrong importing that artist. Please try again.");
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-8 text-center">
      <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">Welcome to DeanDB</div>
      <h1 className="mx-auto mt-3 max-w-xl font-display text-4xl font-black leading-tight text-fg sm:text-5xl">
        Start with one artist.
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-fg-muted">
        Pick someone you love — we&apos;ll pull their whole discography so you can start rating right away.
        You can add more anytime.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STARTERS.map((s, i) => (
          <button
            key={s.name}
            onClick={() => start(s.name)}
            disabled={busy != null}
            className="group rounded-2xl border border-edge bg-panel/70 p-4 text-left transition hover:-translate-y-1 hover:border-gold/50 disabled:opacity-50"
          >
            <div
              className="h-16 w-16 rounded-xl shadow"
              style={{ background: gradient(GRADIENT_PALETTE[i % GRADIENT_PALETTE.length]) }}
            />
            <div className="mt-3 font-display text-base font-black text-fg">
              {busy === s.name ? "Adding…" : s.name}
            </div>
            <div className="text-xs text-fg-faint">{s.genre}</div>
          </button>
        ))}
      </div>

      <div className="mt-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Someone else?</div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && custom.trim() && start(custom.trim())}
            placeholder="Search any artist…"
            className="w-64 rounded-xl border border-edge bg-panel-2 px-4 py-2.5 text-fg outline-none placeholder:text-fg-faint focus:border-gold/50"
            aria-label="Search for an artist to start with"
          />
          <button
            onClick={() => custom.trim() && start(custom.trim())}
            disabled={busy != null || !custom.trim()}
            className="rounded-xl bg-gold px-5 py-2.5 font-bold text-on-accent transition hover:brightness-110 disabled:opacity-40"
          >
            Start →
          </button>
        </div>
        <button
          onClick={() => navigate("/editor")}
          className="mt-4 text-sm text-fg-muted hover:text-gold"
        >
          Or build your journey manually in the Editor →
        </button>
      </div>

      {busy && (
        <p className="mt-6 text-sm text-fg-muted">Pulling {busy}&apos;s discography from MusicBrainz…</p>
      )}
      {error && <p className="mt-4 text-sm font-semibold text-dean">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2:** `npm run typecheck` → PASS. Commit:
```bash
git add src/pages/Onboarding.tsx
git commit -m "feat(onboarding): gentle one-artist starter picker (curated set + search)"
```

---

## Task 2: Wire it into the empty-journey branch

**Files:** Modify `src/pages/Dashboard.tsx`

- [ ] **Step 1: swap EmptyState → Onboarding**

In `Dashboard.tsx`, the empty branch currently is:
```tsx
      {data.artists.length === 0 ? (
        canEdit ? (
          <EmptyState />
        ) : (
```
Change `<EmptyState />` to `<Onboarding />`. Update imports: remove the `EmptyState` import and add:
```ts
import { Onboarding } from "./Onboarding";
```
(If `EmptyState` is now imported nowhere else, that's fine — leave the `EmptyState.tsx` file in place; just remove its now-unused import from Dashboard so `noUnusedLocals` stays happy. Verify with `grep -rn "EmptyState" src` — if Dashboard was the only importer, the file is simply unused, which is not a TS error.)

- [ ] **Step 2:** `npm run typecheck` → PASS (no unused import); `npm run build` → PASS; `npm run test` → PASS.

- [ ] **Step 3:** commit
```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(onboarding): show the starter picker for an empty own journey"
```

---

## Task 3: Preview + QA

**Files:** Modify `src/pages/Preview.tsx`

- [ ] **Step 1:** import `Onboarding` and add a labeled section rendering it (matching Preview's existing section pattern):
```tsx
      <section>
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">Onboarding (empty journey)</div>
        <Onboarding />
      </section>
```

- [ ] **Step 2:** `npm run typecheck && npm run build && npm run test` → PASS. Commit:
```bash
git add src/pages/Preview.tsx
git commit -m "chore(dev): preview the onboarding starter picker"
```

- [ ] **Step 3: QA gate** — `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 4: Code review** — import path reuses `lookupArtist`/`importArtistFromMatch`/`reload` (no new import internals); `start` guards on `userId`/`busy`; tokens only; disabled states correct; escape hatch + manual-Editor link present.
- [ ] **Step 5 (controller, visual):** screenshot the "Onboarding (empty journey)" section in `#/__preview`, both skins — confirm the welcome hero, the curated starter grid (gradient swatches + names + genres), and the search row render and are legible.

---

## Self-Review

**Spec coverage (§5.1 gentle onboarding):** one artist from a curated starter set (resolved decision), search escape hatch, imports the discography → populated dashboard, manual-Editor fallback. ✓
**Placeholder scan:** complete component + wiring; Task 3 Step 5 is an explicit controller visual check. ✓
**Type consistency:** reuses `useMyJourney` (`userId`/`reload`), `lookupArtist`, `api.importArtistFromMatch`, `pickGradient`/`gradient`/`GRADIENT_PALETTE`, `navigate` — all existing exports. Renders in Dashboard's existing `canEdit` empty branch. ✓
