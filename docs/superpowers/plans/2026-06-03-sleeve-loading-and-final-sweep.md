# Sleeve — Loading States + Final Consistency Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Add the premium **cover-art loading experience** (shimmer-while-loading + graceful fade-in) the user asked for at brainstorming, and close the last two consistency gaps — the Artists list input/motion and a Settings success-color AA miss — so the Sleeve treatment is uniform across the whole app.

**Architecture:** Three surgical, presentation-only changes. (1) `Cover` (used by every card/grid/hero thumbnail) gains a tiny load state machine: the album's own gradient stays as the colored placeholder, a shimmer sweep plays over it while the real art loads, then the `<img>` fades in; reduced-motion-safe via the existing `.animate-shimmer` reduced-motion gate + `.rm-no-transition`. (2) `Artists` search input adopts the standard `edge-strong` border + focus-visible ring, and the card grids get `stagger-children`. (3) `Settings` swaps raw `text-emerald-400` for the skin-aware `text-status-done` token. No logic/handler/API/state-shape changes anywhere.

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens · existing `.animate-shimmer` / `.rm-no-transition` / `.stagger-children` keyframes in `index.css`.

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green; visual via `#/__preview` in both skins — covers still render (gradient placeholder + art), Artists input shows edge-strong + ring, Settings "Saved." reads legibly on Paper. The shimmer is transient on load (verify on reload / throttled network); the fade-in opacity classes are confirmed in the DOM.

---

## Task 1: Cover loading shimmer + graceful fade-in

**Files:** `src/components/cards.tsx`

**Context:** `Cover` has three branches — `xs` thumbnail, `coverUrl` present (main), and the generated vinyl-poster (no art). Today, when `coverUrl` is set the `<img>` renders immediately over the gradient and snaps in when the bytes arrive. We want: gradient stays as the colored placeholder, a shimmer sweep plays over it while loading, the image fades in on load, and on error the shimmer stops and the gradient shows. The generated (no-`coverUrl`) branch is unchanged.

- [ ] **Step 1:** Add the `useState` import at the top of the file: change `import { gradient } from "../lib/format";` group — add a React import line `import { useState } from "react";` as the first import.

- [ ] **Step 2:** Replace the entire `Cover` function (currently lines ~10–93) with this version. The `xs` and `coverUrl` branches now share an `imgState` machine and a `shimmer` overlay; the generated branch is byte-for-byte unchanged.

```tsx
export function Cover({
  colors,
  title,
  coverUrl,
  size = "md",
}: {
  colors: [string, string];
  title: string;
  coverUrl?: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? 220 : size === "sm" ? 96 : size === "xs" ? 44 : 150;
  const [imgState, setImgState] = useState<"loading" | "loaded" | "error">("loading");

  // Real art fades in over the album's own gradient. While it loads, a shimmer
  // sweep plays over the gradient as a tasteful placeholder; on error the gradient
  // simply shows through. (.animate-shimmer + .rm-no-transition are reduced-motion gated.)
  const imgClass =
    `rm-no-transition h-full w-full object-cover transition-opacity duration-500 ${
      imgState === "loaded" ? "opacity-100" : "opacity-0"
    }`;
  const shimmer =
    coverUrl && imgState === "loading" ? (
      <div
        aria-hidden
        className="animate-shimmer pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.22) 50%, transparent 60%)",
        }}
      />
    ) : null;

  // Compact thumbnail (e.g. an editor row): real art when present, else a clean
  // gradient swatch. The vinyl + title overlay would be illegible this small.
  if (size === "xs") {
    return (
      <div
        className="relative shrink-0 overflow-hidden rounded-md shadow"
        style={{ background: gradient(colors), width: dim, height: dim }}
      >
        {coverUrl && (
          <img
            src={coverUrl}
            alt={title}
            loading="lazy"
            onLoad={() => setImgState("loaded")}
            onError={() => setImgState("error")}
            className={imgClass}
          />
        )}
        {shimmer}
      </div>
    );
  }

  // Real cover art (e.g. Cover Art Archive) when we have it — no CORS needed
  // for <img> display. The gradient stays as the backdrop while it loads.
  if (coverUrl) {
    return (
      <div
        className="relative overflow-hidden rounded-xl shadow-lg"
        style={{ background: gradient(colors), width: dim, height: dim }}
      >
        <img
          src={coverUrl}
          alt={title}
          loading="lazy"
          onLoad={() => setImgState("loaded")}
          onError={() => setImgState("error")}
          className={imgClass}
        />
        {shimmer}
      </div>
    );
  }

  return (
    <div
      className="relative grid place-items-center overflow-hidden rounded-xl shadow-lg"
      style={{ background: gradient(colors), width: dim, height: dim }}
    >
      {/* vinyl disc */}
      <div
        className="absolute right-[-22%] grid place-items-center rounded-full opacity-90"
        style={{
          width: dim * 0.78,
          height: dim * 0.78,
          background: "radial-gradient(circle, #1a1a1a 38%, #0c0c0c 39%, #1a1a1a 40%, #0c0c0c 60%)",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06)",
        }}
      >
        <div className="rounded-full" style={{ width: dim * 0.2, height: dim * 0.2, background: gradient(colors, 90) }} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-white/10" />
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <div className="font-display text-sm font-black uppercase leading-tight tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          {title}
        </div>
      </div>
    </div>
  );
}
```

**Note for the implementer:** on error we no longer mutate `style.display` (the previous behavior) — `opacity-0` keeps the broken `<img>` invisible and the gradient shows through, which is equivalent and avoids imperative DOM mutation. This is intentional, not an omission.

- [ ] **Step 3:** `npm run typecheck && npm run build && npm run test` → PASS. Commit `feat(cards): cover shimmer-while-loading + graceful fade-in`.

---

## Task 2: Artists list — input a11y + staggered grids

**Files:** `src/pages/Artists.tsx`

- [ ] **Step 1:** The search input (currently `className="flex-1 rounded-xl border border-edge bg-panel px-4 py-2 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-gold/50"`) → replace `border border-edge` with `border border-[var(--color-edge-strong)]` and append ` focus-visible:ring-2 focus-visible:ring-gold` to match the app-wide standard (People/Discover/Settings).

- [ ] **Step 2:** In the `section` helper, the card grid `<div className="grid gap-3 md:grid-cols-2">` → append ` stagger-children`.

- [ ] **Step 3:** `npm run typecheck && npm run build` → PASS. Commit `feat(artists): edge-strong search input + staggered roster grids`.

---

## Task 3: Settings — skin-aware success color

**Files:** `src/pages/Settings.tsx`

**Context:** Three success messages use raw `text-emerald-400`, which is ~1.4:1 on the Paper surface (fails AA). The skin-aware `--color-status-done` token (Paper `#065f46`, Midnight `#6ee7b7`) was built during the a11y pass for exactly this; its Tailwind utility is `text-status-done`.

- [ ] **Step 1:** Replace all three `text-emerald-400` occurrences with `text-status-done`:
  - `SecuritySection` "✓ On (authenticator app)" span (`className="text-sm text-emerald-400"`).
  - `SecuritySection` message line (`className={\`text-sm font-semibold ${msg.ok ? "text-emerald-400" : "text-dean"}\`}`) → `msg.ok ? "text-status-done" : "text-dean"`.
  - `Settings` footer save message (`className={\`text-sm font-semibold ${msg.ok ? "text-emerald-400" : "text-dean"}\`}`) → `msg.ok ? "text-status-done" : "text-dean"`.

- [ ] **Step 2:** `npm run typecheck && npm run build` → PASS. Commit `fix(settings): skin-aware success color (AA on Paper)`.

---

## Task 4: QA

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 2: Code review** — presentation-only; no handler/state/API/`DeanDBData` changes; `Cover`'s single `useState` is called unconditionally before the branch returns (Rules of Hooks); tokens throughout; shimmer + fade respect reduced motion (`.animate-shimmer` gate + `.rm-no-transition`); `text-status-done` resolves in both skins.
- [ ] **Step 3 (controller, visual):** screenshot `#/__preview` in Paper AND Midnight — covers render (gradient placeholder + art, no broken layout), Artists input shows the stronger border + ring, Settings save flow color is legible on Paper. Confirm a cover's `<img>` carries the `transition-opacity` + `opacity-*` classes (DOM check) since the shimmer is transient.

---

## Self-Review
**Coverage:** the brainstorm-requested cover loading placeholder (shimmer + fade) ✓; Artists consistency (input a11y + motion) ✓; Settings success-color AA ✓. Layout deliberately untouched (already swept; high-risk shared component). ✓
**Placeholder scan:** concrete code for the substantive change (Cover); precise one-line edits for Tasks 2–3. ✓
**Type consistency:** `imgState: "loading" | "loaded" | "error"`; `useState` imported; `text-status-done` / `--color-edge-strong` are real tokens in `index.css`. ✓
