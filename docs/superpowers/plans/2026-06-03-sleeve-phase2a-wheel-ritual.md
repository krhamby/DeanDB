# Sleeve — Phase 2a: The Wheel Ritual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Marathon Wheel (`NextSpinner.tsx`) from a silent carousel into a *ritual* — synthesized tick-tick-tick during the spin, a landing chime + (Android) haptic when it stops, a dramatic winner reveal, and a "why this one" beat — without changing its selection logic.

**Architecture:** A new dependency-free `src/lib/sfx.ts` synthesizes all sound with the Web Audio API (no audio files, no network; every call is a safe no-op when Web Audio is unavailable, so SSR/tests never throw). `NextSpinner.tsx` schedules a decelerating series of ticks across the existing `SPIN_MS` window, fires the chime+haptic in the existing land timeout, and adds a reveal animation + context line. All visual flourish respects `prefers-reduced-motion`; sound only ever starts from the user's Spin click (the gesture that unlocks `AudioContext`).

**Tech Stack:** React 18 + TS strict · Web Audio API (`OscillatorNode`/`GainNode`) · Vibration API (feature-detected) · Vitest (pure-guard tests) · Tailwind v4 tokens.

**Verification model:** `npm run test` (Vitest guards for sfx) + `npm run typecheck` + `npm run build` must stay green. The Wheel renders only for a signed-in user with eligible marathon artists, so **live visual/audio verification requires a populated journey** (see the session checkpoint) — code review + the gate are the automated gates here.

**Out of scope (other Phase 2 plans):** the marathon hero + Dean Meter redesign, the Verdict composer, Hall of Fame + the Summit celebration + badge toasts.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/sfx.ts` | Create | Synthesized `tick()`, `landChime()`, `haptic()`, `prefersReducedMotion()`; lazy `AudioContext`; all safe no-ops without Web Audio. |
| `src/lib/sfx.test.ts` | Create | Vitest: calls never throw with no `AudioContext`/`navigator.vibrate`; `prefersReducedMotion()` returns a boolean. |
| `src/index.css` | Modify | `@keyframes wheel-reveal` (winner pop+glow), gated by `prefers-reduced-motion`. |
| `src/components/NextSpinner.tsx` | Modify | Schedule decelerating ticks during spin; chime+haptic on land; winner reveal animation; "why this one" context line; reduced-motion gating; clean up timers. |

---

## Task 1: The sound + haptics module

**Files:** Create `src/lib/sfx.ts`, `src/lib/sfx.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/sfx.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { tick, landChime, haptic, prefersReducedMotion } from "./sfx";

// Vitest's default environment is node: no AudioContext, no window.matchMedia,
// no navigator.vibrate. Every function must be a safe no-op there.
describe("sfx", () => {
  it("tick() does not throw without Web Audio", () => {
    expect(() => tick()).not.toThrow();
  });
  it("landChime() does not throw without Web Audio", () => {
    expect(() => landChime()).not.toThrow();
  });
  it("haptic() does not throw without navigator.vibrate", () => {
    expect(() => haptic()).not.toThrow();
    expect(() => haptic([10, 20, 10])).not.toThrow();
  });
  it("prefersReducedMotion() returns a boolean", () => {
    expect(typeof prefersReducedMotion()).toBe("boolean");
  });
});
```

- [ ] **Step 2: Run tests, confirm they FAIL**

Run: `npm run test`
Expected: FAIL — `./sfx` does not exist.

- [ ] **Step 3: Implement `src/lib/sfx.ts`**

```ts
// Synthesized sound + haptics for the Marathon Wheel. No audio files, no network.
// Every export is a safe no-op when Web Audio / Vibration aren't available
// (SSR, tests, iOS Safari for haptics) so callers never need to guard.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  // AudioContext starts suspended until a user gesture; the Spin click is one.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** True when the user asked the OS to minimize motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A short percussive tick — the reel clicking past an artist. */
export function tick(volume = 0.05): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(150, t);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}

/** A bright C–E–G arpeggio when the wheel lands. */
export function landChime(): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const dt = i * 0.08;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t + dt);
    gain.gain.setValueAtTime(0.0001, t + dt);
    gain.gain.exponentialRampToValueAtTime(0.12, t + dt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.5);
    osc.connect(gain).connect(ac.destination);
    osc.start(t + dt);
    osc.stop(t + dt + 0.5);
  });
}

/** Best-effort haptic. Android Chrome buzzes; iOS Safari has no Vibration API → no-op. */
export function haptic(pattern: number | number[] = 18): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}
```

- [ ] **Step 4: Run tests, confirm they PASS**

Run: `npm run test`
Expected: PASS (the 4 sfx tests + the 4 existing themes tests = 8).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add src/lib/sfx.ts src/lib/sfx.test.ts
git commit -m "feat(wheel): synthesized sfx + haptics module (safe no-ops, vitest-covered)"
```

---

## Task 2: Reveal animation keyframe

**Files:** Modify `src/index.css`

- [ ] **Step 1: Add the keyframe + reduced-motion guard**

Append to `src/index.css` (after the existing `@keyframes pop-in` / `.animate-pop` block):

```css
/* Marathon Wheel — winner reveal: a confident pop with an accent glow. */
@keyframes wheel-reveal {
  0%   { transform: scale(0.92); opacity: 0; }
  60%  { transform: scale(1.04); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.animate-wheel-reveal {
  animation: wheel-reveal 0.5s cubic-bezier(0.16, 1, 0.2, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .animate-wheel-reveal { animation: none; }
}
```

- [ ] **Step 2: Verify build + commit**

Run: `npm run build` → PASS.
```bash
git add src/index.css
git commit -m "feat(wheel): add reduced-motion-aware winner-reveal keyframe"
```

---

## Task 3: Wire the ritual into NextSpinner

**Files:** Modify `src/components/NextSpinner.tsx`

Reference: the component already has `spin()`, refs `timer`/`raf`, a `SPIN_MS = 2800` window, `picked` state, and an unmount cleanup effect. We add ticks across the spin, chime+haptic at the land, a reveal class on the result, and a context line.

- [ ] **Step 1: Import the sfx module**

Add to the imports at the top of `src/components/NextSpinner.tsx`:
```ts
import { tick, landChime, haptic, prefersReducedMotion } from "../lib/sfx";
```

- [ ] **Step 2: Add a ref to track tick timers**

Next to `const timer = useRef<number | null>(null);` add:
```ts
  const tickTimers = useRef<number[]>([]);
```

- [ ] **Step 3: Clear tick timers on unmount**

In the existing unmount cleanup effect (the one that clears `timer.current`/`raf.current`), also clear the tick timers. Replace that effect body with:
```ts
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
      tickTimers.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );
```

- [ ] **Step 4: Schedule ticks + land chime/haptic in `spin()`**

Inside `spin()`, AFTER `setReel(strip);` and BEFORE the `raf.current = requestAnimationFrame(...)` block, add the decelerating tick schedule:
```ts
    // Decelerating "tick-tick-tick" across the spin (ease-out, like a slowing reel).
    tickTimers.current.forEach((id) => window.clearTimeout(id));
    tickTimers.current = [];
    const TICKS = 22;
    for (let i = 1; i <= TICKS; i++) {
      const frac = i / TICKS;
      const at = SPIN_MS * (1 - Math.pow(1 - frac, 2)); // ease-out: dense → sparse
      tickTimers.current.push(window.setTimeout(() => tick(0.05), at));
    }
```
Then in the existing land timeout callback (`timer.current = window.setTimeout(() => { setSpinning(false); setAnimate(false); setPicked(target); }, SPIN_MS);`), add the chime + haptic so the callback becomes:
```ts
    timer.current = window.setTimeout(() => {
      setSpinning(false);
      setAnimate(false);
      setPicked(target);
      landChime();
      haptic([14, 40, 22]);
    }, SPIN_MS);
```

- [ ] **Step 5: Make the spin blur respect reduced motion**

The reel's inline style uses `filter: spinning ? "blur(0.6px)" : "none"`. Change it to skip the blur when reduced motion is requested:
```tsx
                filter: spinning && !prefersReducedMotion() ? "blur(0.6px)" : "none",
```

- [ ] **Step 6: Add the reveal animation + "why this one" context to the result block**

In the `picked ? ( … )` result block, (a) add `animate-wheel-reveal` to the winner name container and (b) add a context line under the name. Replace the inner `<div className="text-center"> … </div>` with:
```tsx
            <div className="text-center animate-wheel-reveal">
              <div className="text-xs font-semibold uppercase tracking-wide text-gold">🎉 Up next</div>
              <div className="font-display text-2xl font-black text-fg">{picked.name}</div>
              <div className="mt-1 text-xs text-fg-muted">
                {picked.genre} · {picked.catalogSize} album{picked.catalogSize === 1 ? "" : "s"} to conquer
              </div>
            </div>
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck` → PASS.
Run: `npm run build` → PASS.
Run: `npm run test` → PASS (8 tests).

- [ ] **Step 8: Commit**

```bash
git add src/components/NextSpinner.tsx
git commit -m "feat(wheel): ticking spin, landing chime + haptic, dramatic reveal + context"
```

---

## Task 4: QA

**Files:** none (verification only)

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → all PASS.
- [ ] **Step 2: Code review** the diff for: timers always cleared (no leak on spin-again or unmount), sound only triggered from the Spin gesture, reduced-motion respected, no change to the *selection* logic (`eligible`/`randomOf(target)` untouched), tokens used for any new colors.
- [ ] **Step 3 (deferred / needs a populated journey):** in a signed-in account with ≥2 unstarted marathon artists, spin and confirm: ticks decelerate, chime + (Android) haptic on land, the winner pops with a glow, and the context line reads correctly. Note in the PR if not yet manually verified.

---

## Self-Review

**Spec coverage (§5.4 The Wheel ritual):** ticks/sound (Task 1+3), haptics with iOS caveat (Task 1 `haptic` no-op), tuned reveal (Task 2+3), "why this one" beat (Task 3 Step 6). Animation/deceleration tuning reuses the existing `SPIN_MS` ease-out. ✓
**Placeholder scan:** every step has concrete code; Task 4 Step 3 is an explicit deferred-manual-verify with rationale, not a TODO. ✓
**Type consistency:** `tick`/`landChime`/`haptic`/`prefersReducedMotion` defined in Task 1 and used in Task 3; `tickTimers` ref added before use; `picked.genre`/`picked.catalogSize` exist on `Artist` (used already in `ReelCard`). ✓
