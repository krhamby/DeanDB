# Sleeve — Phase 2c: The Verdict Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make rating an album feel like writing a record review — display the verdict as an editorial Fraunces pull-quote, and make the score control tactile with a big live number (the hero Dean Meter dial already updates live as you slide).

**Architecture:** Two surgical changes in `src/pages/AlbumDetail.tsx`: (1) the read-only review becomes an editorial `<blockquote>` set in `font-display` (Fraunces) italic with an oversized accent quote mark; (2) the editor's rating range gets a big live score readout + 0/10 anchors. The album hero already renders a large `DeanMeter` bound to `album.rating`, and edits are optimistic, so sliding the score animates that dial live — no new wiring needed. All token-driven (Paper + Midnight).

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens (`font-display` now maps to Fraunces).

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green; visual via `#/__preview` (Album section, both skins, view + edit).

**Out of scope:** Hall of Fame/Summit/badges (separate plan). No data-model changes.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/pages/AlbumDetail.tsx` | Modify | Editorial pull-quote review display; tactile rating control with live big score + anchors. |

---

## Task 1: Editorial verdict + tactile score

**Files:** Modify `src/pages/AlbumDetail.tsx`

- [ ] **Step 1: Editorial pull-quote for the read-only review**

Find the review render branch inside the Review `<Panel>` (currently):
```tsx
        ) : album.review ? (
          <p className="whitespace-pre-wrap leading-relaxed text-fg-muted">“{album.review}”</p>
        ) : (
          <p className="italic text-fg-faint">No review yet.</p>
        )}
```
Replace it with:
```tsx
        ) : album.review ? (
          <blockquote className="relative pl-6">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-3 left-0 select-none font-display text-6xl leading-none text-gold/40"
            >
              “
            </span>
            <p className="whitespace-pre-wrap font-display text-lg italic leading-relaxed text-fg sm:text-xl">
              {album.review}
            </p>
          </blockquote>
        ) : (
          <p className="italic text-fg-faint">No review yet.</p>
        )}
```

- [ ] **Step 2: Tactile rating control in the editor**

Find the editor's rating block (currently):
```tsx
            <div>
              <label className="text-sm font-semibold uppercase tracking-wide text-fg-faint sm:text-xs">
                {data.listener.meterName} Meter: <span className="text-gold">{album.rating?.toFixed(1) ?? "—"}</span>
              </label>
              <input
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={album.rating ?? 0}
                onChange={(e) => patchAlbum({ rating: Number(e.target.value) })}
                className="mt-1 h-6 w-full cursor-pointer accent-gold"
              />
            </div>
```
Replace it with:
```tsx
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-fg-faint">
                  {data.listener.meterName} Meter
                </label>
                <span className="font-display text-3xl font-black leading-none text-gold">
                  {album.rating?.toFixed(1) ?? "—"}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={album.rating ?? 0}
                onChange={(e) => patchAlbum({ rating: Number(e.target.value) })}
                className="h-6 w-full cursor-pointer accent-gold"
                aria-label="Album score out of 10"
              />
              <div className="mt-0.5 flex justify-between text-[10px] font-semibold text-fg-faint">
                <span>0</span>
                <span>10</span>
              </div>
            </div>
```

- [ ] **Step 3: Verify**

Run `npm run typecheck` → PASS. Run `npm run build` → PASS. Run `npm run test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AlbumDetail.tsx
git commit -m "feat(verdict): editorial pull-quote review + tactile live score control"
```

---

## Task 2: QA

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 2: Code review** — tokens only (no `text-white`/`text-zinc`/hex); `font-display` (Fraunces) used for the quote; the hero `DeanMeter` still bound to `album.rating`; aria-label present on the range; nothing else in AlbumDetail changed.
- [ ] **Step 3 (controller, visual):** in `#/__preview` (Album section), confirm in both skins: the review renders as a Fraunces italic pull-quote with the accent quote mark; clicking **Edit** shows the big live score that updates the hero Dean Meter as the slider moves.

---

## Self-Review

**Spec coverage (§5.3):** editorial verdict styling (Step 1), tactile score + live Dean Meter dial connection (Step 2 + existing hero meter). Two-tap casual path preserved (status buttons + single slider). ✓
**Placeholder scan:** full code in both steps; Task 2 Step 3 is an explicit controller visual check. ✓
**Type consistency:** uses existing `patchAlbum`, `album.rating`, `data.listener.meterName`; no new symbols. ✓
