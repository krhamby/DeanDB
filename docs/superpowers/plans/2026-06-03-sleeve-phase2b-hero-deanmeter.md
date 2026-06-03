# Sleeve — Phase 2b: Marathon Hero + Dean Meter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the dashboard's marathon hero the "look how far I've come" centerpiece — animated count-up stats and a bolder "climb to the Summit" meter — and give the Dean Meter a signature reward glow at top scores.

**Architecture:** A tiny `useCountUp` hook (built on a pure `easeOutCubic`) animates numbers from 0→target on mount, respecting `prefers-reduced-motion`. The Dashboard hero is restyled with tokens (works in both skins) into a richer meter with milestone ticks + a glowing fill. The `DeanMeter` gains an opt-in-by-value accent glow for scores ≥ 9 (rationed "neon as reward"). All changes are token-driven and reduced-motion-aware.

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens · Vitest (pure easing) · `requestAnimationFrame`.

**Verification model:** `npm run test` + `npm run typecheck` + `npm run build` green; visual via the `#/__preview` harness (Dashboard section, both skins).

**Out of scope:** the Verdict composer, Hall of Fame/Summit/badges (separate plans).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/useCountUp.ts` | Create | `easeOutCubic(t)` (pure) + `useCountUp(target, ms?)` hook (RAF count-up, reduced-motion aware). |
| `src/lib/useCountUp.test.ts` | Create | Vitest for `easeOutCubic` boundaries/monotonicity. |
| `src/pages/Dashboard.tsx` | Modify | Restyle the hero `<section>` meter: count-up hours + %, taller glowing fill, milestone ticks, Summit framing; tokens. |
| `src/components/ui.tsx` | Modify | `DeanMeter` — accent drop-shadow glow when `value >= 9`. |

---

## Task 1: useCountUp hook (+ pure easing test)

**Files:** Create `src/lib/useCountUp.ts`, `src/lib/useCountUp.test.ts`

- [ ] **Step 1: failing test** — `src/lib/useCountUp.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { easeOutCubic } from "./useCountUp";

describe("easeOutCubic", () => {
  it("maps 0→0 and 1→1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it("is past-midpoint at t=0.5 (ease-OUT front-loads progress)", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
  it("is monotonic increasing", () => {
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const v = easeOutCubic(i / 10);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
```

- [ ] **Step 2: run `npm run test` → FAIL** (module missing).

- [ ] **Step 3: implement `src/lib/useCountUp.ts`**

```ts
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./sfx";

/** Standard ease-out cubic on [0,1]. */
export function easeOutCubic(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - c, 3);
}

/**
 * Animate a number from 0 up to `target` once on mount (and whenever `target`
 * changes), over `ms`. Returns `target` immediately when the user prefers
 * reduced motion, so the final value is always correct/accessible.
 */
export function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const raf = useRef<number | null>(null);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    start.current = null;
    const step = (ts: number) => {
      if (start.current === null) start.current = ts;
      const t = (ts - start.current) / ms;
      if (t >= 1) {
        setValue(target);
        return;
      }
      setValue(target * easeOutCubic(t));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, ms]);

  return value;
}
```

- [ ] **Step 4: run `npm run test` → PASS** (3 new + existing).

- [ ] **Step 5: typecheck + commit**

Run `npm run typecheck` → PASS.
```bash
git add src/lib/useCountUp.ts src/lib/useCountUp.test.ts
git commit -m "feat(stats): useCountUp hook + easeOutCubic (reduced-motion aware, tested)"
```

---

## Task 2: Marathon hero redesign

**Files:** Modify `src/pages/Dashboard.tsx`

The current hero is the first `<section className="animate-pop">` (the season kicker, `<h1>`, tagline, and a `<Panel>` with "Total time logged" + goalPct + a `ProgressBar` + 0h/Summit labels). Replace that `<Panel>…</Panel>` (keep the kicker/h1/tagline) with a richer meter.

- [ ] **Step 1: import the hook**

Add to the imports in `src/pages/Dashboard.tsx`:
```ts
import { useCountUp } from "../lib/useCountUp";
```

- [ ] **Step 2: compute animated values**

Inside the `Dashboard` component, after `const stats = computeStats(data);` and the other derived consts, add:
```ts
  const animatedHours = useCountUp(stats.hoursListened);
  const animatedPct = useCountUp(stats.goalPct);
```
(Hooks run unconditionally at the top level of the component — these are before any early return, which is fine since `Dashboard` has no early return before the hero.)

- [ ] **Step 3: replace the hero Panel**

Find the hero `<Panel className="mt-6 p-6"> … </Panel>` block and replace the WHOLE `<Panel>…</Panel>` with:
```tsx
        <Panel className="mt-6 overflow-hidden p-6 sm:p-7">
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

          {/* Climb meter */}
          <div className="relative mt-5">
            <div className="relative h-4 w-full overflow-hidden rounded-full bg-fg/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-dean via-gold to-gold-soft transition-[width] duration-700"
                style={{
                  width: `${Math.max(2, Math.min(100, stats.goalPct))}%`,
                  boxShadow: "0 0 16px color-mix(in srgb, var(--color-gold) 55%, transparent)",
                }}
              />
              {/* milestone ticks */}
              {[25, 50, 75].map((m) => (
                <span
                  key={m}
                  className="absolute top-0 h-full w-px bg-fg/20"
                  style={{ left: `${m}%` }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-fg-faint">
              <span>0h</span>
              <span>{fmtHours(stats.totalRuntimeHours)} — The Summit 👑</span>
            </div>
          </div>
        </Panel>
```
(`fmtHours` is already imported in Dashboard.tsx.)

- [ ] **Step 4: verify**

Run `npm run typecheck` → PASS. Run `npm run build` → PASS.

- [ ] **Step 5: commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(hero): count-up stats + glowing climb-to-the-Summit meter (tokens, reduced-motion)"
```

---

## Task 3: Dean Meter reward glow

**Files:** Modify `src/components/ui.tsx`

Give the Dean Meter a subtle accent glow when the score is a standout (≥ 9) — "neon as a reward."

- [ ] **Step 1: add the glow to the progress arc**

In `DeanMeter` (`src/components/ui.tsx`), the second `<circle>` (the colored progress arc) has a `style={{ transition: "stroke-dashoffset 0.6s ease" }}`. Add a conditional glow filter. Change that `<circle>`'s `style` to:
```tsx
          style={{
            transition: "stroke-dashoffset 0.6s ease",
            filter: value != null && value >= 9 ? `drop-shadow(0 0 5px ${color})` : "none",
          }}
```
(`color` and `value` are already in scope from the component body.)

- [ ] **Step 2: verify**

Run `npm run typecheck` → PASS. Run `npm run build` → PASS. Run `npm run test` → PASS.

- [ ] **Step 3: commit**

```bash
git add src/components/ui.tsx
git commit -m "feat(deanmeter): accent glow on standout scores (>=9)"
```

---

## Task 4: QA

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → all PASS.
- [ ] **Step 2: Code review** — hooks unconditional; reduced-motion path returns final values; meter width clamps (never 0-width invisible); tokens used throughout (no `text-white`/`text-zinc`); glow only at ≥9.
- [ ] **Step 3 (controller, visual):** screenshot the Dashboard section of `#/__preview` in Paper and Midnight; confirm the count-up settles to the right numbers, the meter glows + shows milestone ticks, and a 9–10 Dean Meter (e.g. on a Latest Verdict) glows.

---

## Self-Review

**Spec coverage (§5.2 hero + Dean Meter):** count-up (Task 1+2), climb meter w/ Summit framing (Task 2), Dean Meter signature glow (Task 3). Reduced-motion honored via `useCountUp` + static glow. ✓
**Placeholder scan:** all steps have concrete code; Task 4 Step 3 is an explicit controller visual step. ✓
**Type consistency:** `easeOutCubic`/`useCountUp` defined in Task 1, used in Task 2; `fmtHours` already imported; `value`/`color` already in `DeanMeter` scope for Task 3. ✓
