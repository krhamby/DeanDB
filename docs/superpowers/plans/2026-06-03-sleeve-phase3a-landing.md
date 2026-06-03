# Sleeve — Phase 3a: Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the bare signed-out `Landing()` with a real marketing landing — a living cover-wall, a value-prop hero with clear CTAs, a feature trio, a sample "climb to the Summit" meter, and the Dean origin story — so a curious stranger gets it in seconds.

**Architecture:** Extract `Landing` from `App.tsx` into `src/pages/Landing.tsx` (a self-contained, token-driven page; logged-out visitors see it in the default Paper skin, but it's fully skin-safe). Reuse `GRADIENT_PALETTE`/`gradient` from `format.ts` for generative "covers" and the existing `.animate-marquee` keyframe (now reduced-motion-disabled) for the drifting wall. No data, no new deps.

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens.

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green; visual by screenshotting `http://localhost:5173/` signed-out in both skins (no harness needed — it's the logged-out route).

**Out of scope (later Phase 3 plans):** onboarding, auth reskin, share cards.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/pages/Landing.tsx` | Create | The signed-out marketing landing (hero, cover wall, features, sample meter, origin story, CTA). |
| `src/App.tsx` | Modify | Remove the inline `Landing()` function; import `Landing` from `./pages/Landing`. |

---

## Task 1: Create the Landing page

**Files:** Create `src/pages/Landing.tsx`

- [ ] **Step 1: write `src/pages/Landing.tsx`** (complete file)

```tsx
import { navigate } from "../lib/router";
import { GRADIENT_PALETTE, gradient } from "../lib/format";

// A drifting wall of generative "covers" — evokes a shelf of records without
// any network images. Honors prefers-reduced-motion (the marquee is gated in CSS).
function CoverWall() {
  const covers = [...GRADIENT_PALETTE, ...GRADIENT_PALETTE, ...GRADIENT_PALETTE];
  return (
    <div className="relative mt-10 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <div className="flex w-max animate-marquee gap-4">
        {covers.map((c, i) => (
          <div
            key={i}
            className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl shadow-lg sm:h-32 sm:w-32"
            style={{ background: gradient(c) }}
          >
            <div
              className="absolute right-[-22%] top-1/2 h-20 w-20 -translate-y-1/2 rounded-full opacity-90 sm:h-24 sm:w-24"
              style={{ background: "radial-gradient(circle, #1a1a1a 38%, #0c0c0c 39%, #1a1a1a 40%, #0c0c0c 60%)" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: "🎡", title: "The Wheel", body: "Can't decide who's next? Spin the Marathon Wheel and let fate pick your next artist." },
  { icon: "🎚️", title: "Your verdict", body: "Score every album on the Dean Meter, rate the deep cuts, and write the review." },
  { icon: "🏆", title: "Hall of Fame", body: "Your highest-rated records, desert-island tracks, and unlockable achievements." },
];

/** Marketing landing for signed-out visitors. */
export function Landing() {
  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero */}
      <section className="animate-pop pt-10 text-center sm:pt-16">
        <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">A discography marathon, shared</div>
        <h1 className="mx-auto mt-3 max-w-3xl font-display text-5xl font-black leading-[1.02] tracking-tight text-fg sm:text-7xl">
          Listen to <span className="text-gold">everything.</span> Rate it all.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-fg-muted">
          DeanDB is an IMDb for your ears — work through an artist's entire catalog, score every album and track,
          climb to the Summit, and share the journey with friends.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => navigate("/login")}
            className="rounded-xl bg-gold px-7 py-3 text-base font-bold text-on-accent transition hover:brightness-110"
          >
            Start your journey →
          </button>
          <button
            onClick={() => navigate("/login")}
            className="rounded-xl border border-edge px-7 py-3 text-base font-semibold text-fg transition hover:border-gold/50"
          >
            Sign in
          </button>
        </div>
      </section>

      <CoverWall />

      {/* Feature trio */}
      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border border-edge bg-panel/70 p-6 text-left">
            <div className="text-3xl">{f.icon}</div>
            <div className="mt-3 font-display text-xl font-black text-fg">{f.title}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Sample climb meter */}
      <section className="mt-12 rounded-3xl border border-edge bg-panel/70 p-7 text-center sm:p-10">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Watch the marathon climb</div>
        <div className="mx-auto mt-4 max-w-xl">
          <div className="flex items-end justify-between">
            <span className="font-display text-4xl font-black leading-none text-gold sm:text-5xl">147h</span>
            <span className="font-display text-xl font-black leading-none text-fg">61%</span>
          </div>
          <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-fg/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-dean via-gold to-gold-soft"
              style={{ width: "61%", boxShadow: "0 0 16px color-mix(in srgb, var(--color-gold) 55%, transparent)" }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-fg-faint">
            <span>0h</span>
            <span>241h — The Summit 👑</span>
          </div>
        </div>
      </section>

      {/* Origin story */}
      <section className="mt-12 text-center">
        <blockquote className="mx-auto max-w-2xl">
          <span aria-hidden className="select-none font-display text-5xl leading-none text-gold/40">{"“"}</span>
          <p className="font-display text-xl italic leading-relaxed text-fg sm:text-2xl">
            Built for Dean — the realest music head we know — who set out to listen through it all. Now it's yours too.
          </p>
        </blockquote>
      </section>

      {/* Final CTA */}
      <section className="my-16 text-center">
        <button
          onClick={() => navigate("/login")}
          className="rounded-xl bg-gold px-8 py-3.5 text-base font-bold text-on-accent transition hover:brightness-110"
        >
          Start your journey →
        </button>
        <p className="mt-3 text-xs text-fg-faint">Free to start · sign in with email</p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: verify the new file compiles** — `npm run typecheck` will still pass (file not yet used); proceed to Task 2 to wire it.

---

## Task 2: Wire it into App.tsx

**Files:** Modify `src/App.tsx`

- [ ] **Step 1: import the new Landing**

Add to the imports in `src/App.tsx` (near the other page imports, e.g. after the `Profile` import):
```ts
import { Landing } from "./pages/Landing";
```

- [ ] **Step 2: delete the inline `Landing` function**

Remove the entire inline function block:
```tsx
/** Friendly landing for signed-out visitors. */
function Landing() {
  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      ...
    </div>
  );
}
```
(The two call sites — `authed ? <Feed /> : <Landing />` at the `case undefined` and `default` branches — now resolve to the imported `Landing`. Do not change those call sites.)

- [ ] **Step 3: verify**

Run `npm run typecheck` → PASS (no duplicate `Landing`, no unused import). Run `npm run build` → PASS. Run `npm run test` → PASS.

- [ ] **Step 4: commit**

```bash
git add src/pages/Landing.tsx src/App.tsx
git commit -m "feat(landing): marketing landing — hero, cover wall, features, climb, origin"
```

---

## Task 3: QA

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 2: Code review** — tokens only (no `text-white`/`text-zinc`/hex); CTAs route to `/login`; `animate-marquee`/`animate-pop` are reduced-motion-disabled (done in index.css); no unused imports left in App.tsx.
- [ ] **Step 3 (controller, visual):** screenshot `http://localhost:5173/` signed-out in **Paper** and **Midnight** — confirm hero + drifting cover wall + feature trio + sample meter + origin pull-quote all render and are legible, CTAs are amber/legible.

---

## Self-Review

**Spec coverage (§5.1 first impression — landing):** living cover wall, value-prop hero + clear CTA, feature trio, sample marathon meter, Dean origin story. ✓ (Onboarding/auth/share are separate Phase 3 plans.)
**Placeholder scan:** complete file in Task 1; Task 3 Step 3 is an explicit controller visual check. ✓
**Type consistency:** uses `navigate`, `GRADIENT_PALETTE`, `gradient` (all exist in `router.ts`/`format.ts`); replaces the inline `Landing` 1:1 so both call sites still resolve. ✓
