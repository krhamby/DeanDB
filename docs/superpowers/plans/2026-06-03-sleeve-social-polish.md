# Sleeve — Social/Utility Surfaces Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Bring Feed, People, Recommendations, Discover to full Sleeve consistency — input a11y standard, the stagger motion, a naming fix, and subtle card hover — without redesigning what already works. Make them previewable.

**Scope note:** these surfaces are already token-correct and well-structured; this is deliberately *light, low-risk* polish, not a rebuild.

**Verification:** `npm run typecheck` + `npm run build` + `npm run test` green; the four added to `#/__preview` (they render headers/inputs/empty states logged-out) for a visual pass; populated states are the user's live check.

---

## Task 1: Consistency + motion polish

**Files:** `src/pages/People.tsx`, `src/pages/Discover.tsx`, `src/pages/Feed.tsx`, `src/pages/Recommendations.tsx`

- [ ] **People.tsx:**
  - Title fix: `<SectionTitle kicker="Find your people" title="Discover" />` → `title="People"` (it currently collides with the real Discover page).
  - Search input: replace `border border-edge ... focus:border-gold/50` with `border border-[var(--color-edge-strong)] ... focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold`.
  - Wrap the search-results list and the Following list `<div className="... space-y-2">` containers with an added ` stagger-children` class.
- [ ] **Discover.tsx:**
  - Textarea: add `border-[var(--color-edge-strong)]` (replace `border-edge`) + ` focus-visible:ring-2 focus-visible:ring-gold`.
  - Suggestions grid `<div className="grid gap-3 sm:grid-cols-2">` → append ` stagger-children`.
  - Suggestion `<Panel>` → add ` transition hover:-translate-y-0.5 hover:border-gold/30` (subtle lift; Panel already rounded/bordered).
- [ ] **Feed.tsx:**
  - Wrap the mapped feed items in a dedicated container so only the cards stagger: change the structure so the `items.map(...)` output sits inside a `<div className="space-y-4 stagger-children">…</div>` (the `SectionTitle` stays outside it, the loading/empty branches stay as-is).
  - Album-activity `<Panel>` (the non-achievement card) → add ` transition hover:border-gold/30` for a subtle interactive feel.
- [ ] **Recommendations.tsx:**
  - Wrap the `inbox.map(...)` output in a `<div className="space-y-4 stagger-children">` (SectionTitle + loading/empty branches stay outside).
- [ ] **Verify + commit:** `npm run typecheck && npm run build && npm run test` → PASS. `git commit -am "feat(social): consistency + motion polish for Feed/People/Recs/Discover"`.

---

## Task 2: Preview the four surfaces

**Files:** `src/pages/Preview.tsx`

- [ ] Import `Feed`, `People`, `Recommendations`, `Discover` and add four labeled sections rendering each (they read from hooks that no-op when logged out, so they render headers + inputs + empty states — safe in the preview). Match Preview's existing section/label markup. (Discover reads `useMyJourney` → null data in preview → renders its prompt panel; fine.)
- [ ] **Verify + commit:** `npm run typecheck && npm run build && npm run test` → PASS. `git commit -am "chore(dev): preview Feed/People/Recommendations/Discover"`.

---

## Task 3: QA

- [ ] Gate: `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] Code review: only styling/structure + the preview additions; no hook/handler/API changes; tokens throughout; `stagger-children` wraps only the card lists (not section titles, except where harmless).
- [ ] Controller visual: screenshot the four preview sections (both skins) — headers, inputs (focus-ring/edge-strong), empty states, Discover prompt panel render correctly. Populated card states = user's live check.

---

## Self-Review
**Coverage:** Feed/People/Recs/Discover consistency (input a11y, naming), motion (stagger + hover), previewability. Light + low-risk by design. ✓
**Type consistency:** pure JSX/className + preview imports; no new types. ✓
