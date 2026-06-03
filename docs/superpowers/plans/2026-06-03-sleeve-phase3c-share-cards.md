# Sleeve — Phase 3c: Shareable Verdict Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a user download a beautiful **Verdict card** (cover gradient + score + pull-quote + DeanDB branding) from an album page — a self-contained image built to escape the app and pull people back in.

**Architecture:** A new `src/components/ShareCard.tsx` (`VerdictCard`, `forwardRef`) renders a fixed-size, **fixed-palette** card (so the exported PNG looks identical regardless of the user's skin) using the album's stored gradient — **no external `<img>`, so no canvas/CORS issue**. `AlbumDetail` mounts one offscreen and a "Share card" button captures it with `html-to-image` → triggers a download. A preview section renders the card visibly so the design is screenshot-verifiable.

**Tech Stack:** React 18 + TS strict · `html-to-image` (new dep, ~14KB) · Fraunces/Inter (already global).

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green; visual by screenshotting the card in `#/__preview`.

**Out of scope / follow-ups:** "Season Wrapped" recap card and Hall-of-Fame poster (log to `docs/superpowers/follow-ups.md`); OG link-unfurl previews (needs an Edge Function — Phase 5).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `package.json` | Modify | Add `html-to-image`. |
| `src/components/ShareCard.tsx` | Create | `VerdictCard` (forwardRef) — fixed-palette, gradient-based downloadable card template. |
| `src/pages/AlbumDetail.tsx` | Modify | Offscreen `VerdictCard` + a "Share card" button that exports it to PNG. |
| `src/pages/Preview.tsx` | Modify | Render a visible `VerdictCard` so the design is screenshot-verifiable. |
| `docs/superpowers/follow-ups.md` | Modify | Note Wrapped/poster + OG-unfurl follow-ups. |

---

## Task 1: Install html-to-image

- [ ] **Step 1:** `npm i html-to-image`  → adds to dependencies.
- [ ] **Step 2:** `npm run build` → PASS.
- [ ] **Step 3:** commit
```bash
git add package.json package-lock.json
git commit -m "chore: add html-to-image for downloadable share cards"
```

---

## Task 2: The VerdictCard component

**Files:** Create `src/components/ShareCard.tsx`

- [ ] **Step 1: write `src/components/ShareCard.tsx`** (complete file). Fixed palette + inline styles so the export is deterministic.

```tsx
import { forwardRef } from "react";
import { gradient } from "../lib/format";
import { scoreColor } from "./ui";

export const CARD_W = 540;
export const CARD_H = 675;

export interface VerdictCardProps {
  title: string;
  artist: string;
  rating: number | null;
  review: string;
  cover: [string, string];
  meterName: string;
}

/** A self-contained, fixed-palette share card (deterministic export, no external images). */
export const VerdictCard = forwardRef<HTMLDivElement, VerdictCardProps>(function VerdictCard(
  { title, artist, rating, review, cover, meterName },
  ref,
) {
  const score = rating == null ? "—" : rating.toFixed(1);
  const accent = scoreColor(rating);
  const quote = review.trim().length > 180 ? review.trim().slice(0, 177) + "…" : review.trim();
  return (
    <div
      ref={ref}
      style={{
        width: CARD_W,
        height: CARD_H,
        background: "#120f17",
        color: "#f4f1ea",
        fontFamily: "'Inter Variable', Inter, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Cover hero (gradient + vinyl) */}
      <div style={{ height: 300, position: "relative", background: gradient(cover) }}>
        <div
          style={{
            position: "absolute",
            right: "-12%",
            top: "50%",
            transform: "translateY(-50%)",
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: "radial-gradient(circle, #1a1a1a 38%, #0c0c0c 39%, #1a1a1a 40%, #0c0c0c 60%)",
            opacity: 0.9,
          }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.1), rgba(18,15,23,0.95))" }} />
        <div style={{ position: "absolute", left: 32, bottom: 24, right: 32 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase", color: "#ffd166", fontWeight: 800 }}>
            The Verdict
          </div>
          <div style={{ fontFamily: "'Fraunces Variable', Fraunces, serif", fontWeight: 900, fontSize: 40, lineHeight: 1.02, marginTop: 6 }}>
            {title}
          </div>
          <div style={{ fontSize: 16, color: "#cfc9be", marginTop: 4 }}>{artist}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "26px 32px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "'Fraunces Variable', Fraunces, serif", fontWeight: 900, fontSize: 64, lineHeight: 1, color: accent }}>
            {score}
          </span>
          <span style={{ fontSize: 18, color: "#8d8678", fontWeight: 700 }}>/ 10 · {meterName} Meter</span>
        </div>
        {quote && (
          <p style={{ fontFamily: "'Fraunces Variable', Fraunces, serif", fontStyle: "italic", fontSize: 19, lineHeight: 1.45, color: "#e7e2d8", marginTop: 18 }}>
            “{quote}”
          </p>
        )}
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Fraunces Variable', Fraunces, serif", fontWeight: 900, fontSize: 20 }}>
            <span style={{ background: "#f5c518", color: "#000", padding: "2px 8px", borderRadius: 7 }}>Dean</span>
            <span style={{ marginLeft: 5 }}>DB</span>
          </span>
          <span style={{ fontSize: 13, color: "#8d8678" }}>deandb.app</span>
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 2:** `npm run typecheck` → PASS (file unused yet is fine). Commit:
```bash
git add src/components/ShareCard.tsx
git commit -m "feat(share): VerdictCard template (fixed-palette, gradient-based, export-safe)"
```

---

## Task 3: Download button on AlbumDetail

**Files:** Modify `src/pages/AlbumDetail.tsx`

- [ ] **Step 1: imports + ref + handler**

Add imports:
```ts
import { useRef } from "react";
import { toPng } from "html-to-image";
import { VerdictCard } from "../components/ShareCard";
```
(Merge `useRef` into the existing `react` import if one exists.)

Inside the component, near the other hooks, add:
```ts
  const cardRef = useRef<HTMLDivElement>(null);
  const downloadCard = async () => {
    if (!cardRef.current) return;
    const url = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artist?.name ?? "album"} - ${album?.title ?? "verdict"} — DeanDB.png`;
    a.click();
  };
```
(Place AFTER the `artist`/`album` consts are defined so they're in scope; if they're only defined after the not-found early return, declare `cardRef` before the early return and define `downloadCard` after the early return, or guard with optional chaining as shown.)

- [ ] **Step 2: add the button (next to Recommend) and the offscreen card**

In the Actions row (where the `✉️ Recommend` / `✎ Edit` buttons live), add a Share button for any signed-in viewer (reuse the same `user &&` gate as Recommend), e.g. right after the Recommend button:
```tsx
          <button
            onClick={downloadCard}
            className="rounded-lg border border-edge px-3 py-1.5 text-sm font-semibold text-fg-muted hover:text-gold"
            title="Download a shareable Verdict card"
          >
            ⬇️ Share card
          </button>
```
Then, at the very end of the component's returned JSX (just before the outermost closing `</div>`), mount the card offscreen so it can be captured:
```tsx
      <div style={{ position: "fixed", left: -9999, top: 0, pointerEvents: "none" }} aria-hidden>
        <VerdictCard
          ref={cardRef}
          title={album.title}
          artist={artist.name}
          rating={album.rating}
          review={album.review}
          cover={album.cover}
          meterName={data.listener.meterName}
        />
      </div>
```

- [ ] **Step 3:** `npm run typecheck` → PASS; `npm run build` → PASS; `npm run test` → PASS.
- [ ] **Step 4:** commit
```bash
git add src/pages/AlbumDetail.tsx
git commit -m "feat(share): download a Verdict card from the album page"
```

---

## Task 4: Preview the card + follow-ups

**Files:** Modify `src/pages/Preview.tsx`, `docs/superpowers/follow-ups.md`

- [ ] **Step 1:** in `Preview.tsx`, import `VerdictCard` and add a labeled section rendering it visibly with a completed/rated fixture album (e.g. Frank Ocean — Blonde):
```tsx
      <section>
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-fg-faint">Share card — Verdict</div>
        <VerdictCard
          title="Blonde"
          artist="Frank Ocean"
          rating={10}
          review="A masterpiece of modern R&B that refuses easy categorisation — alien and warm at once."
          cover={["#5a2bd0", "#b1244a"]}
          meterName="Dean"
        />
      </section>
```
- [ ] **Step 2:** append to `docs/superpowers/follow-ups.md` under "Minor / polish":
```md
- [ ] **More share artifacts:** "Season Wrapped" (calendar-year recap) card and a Hall-of-Fame poster, plus OG link-unfurl previews (needs a Supabase Edge Function — Phase 5). Phase 3c shipped only the Verdict card.
```
- [ ] **Step 3:** `npm run typecheck && npm run build && npm run test` → PASS. Commit:
```bash
git add src/pages/Preview.tsx docs/superpowers/follow-ups.md
git commit -m "chore(dev): preview the Verdict share card + log share follow-ups"
```

---

## Task 5: QA

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 2: Code review** — card uses NO external `<img>` (gradient only, export-safe); fixed palette (deterministic regardless of skin); offscreen mount doesn't shift layout; download filename sane; button gated to signed-in viewers.
- [ ] **Step 3 (controller, visual):** screenshot the "Share card — Verdict" section in `#/__preview` — confirm the card looks polished (cover gradient + vinyl, score in the ramp color, Fraunces pull-quote, DeanDB wordmark + deandb.app).

---

## Self-Review

**Spec coverage (§6 shareable artifacts):** downloadable Verdict card via html-to-image, gradient-based (CORS-safe), fixed palette for consistent export. Wrapped/poster/OG explicitly deferred + logged. ✓
**Placeholder scan:** complete component + integration code; Task 5 Step 3 is an explicit controller visual check. ✓
**Type consistency:** `VerdictCard` props match the call sites; `toPng` from html-to-image; reuses `gradient`, `scoreColor`. ✓
