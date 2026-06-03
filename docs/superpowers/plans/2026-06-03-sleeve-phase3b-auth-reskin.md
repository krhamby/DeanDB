# Sleeve — Phase 3b: Auth Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the auth screens an editorial Sleeve identity — a branded `Dean`-pill wordmark and a warm per-mode subtitle — without changing any of the sign-in/up/forgot/MFA/set-password/confirm logic.

**Architecture:** A single header swap in `src/pages/Login.tsx`: replace the headphones emoji + bare title with the gold wordmark + Fraunces title + a `subtitle` derived from `mode`. The form bodies, handlers, and state machine are untouched. Token-driven (Paper + Midnight).

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens.

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green; visual by screenshotting `http://localhost:5173/#/login` in both skins.

**Out of scope:** share cards, onboarding (separate plans). No logic/state changes.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/pages/Login.tsx` | Modify | Add a `subtitle` map; replace the header block with the branded editorial header. |

---

## Task 1: Editorial auth header

**Files:** Modify `src/pages/Login.tsx`

- [ ] **Step 1: add a `subtitle` next to `title`**

After the `const title = …` block (ends with `: "Sign in to DeanDB";`), add:
```tsx
  const subtitle =
    mode === "signup"
      ? "Start your discography marathon."
      : mode === "forgot"
        ? "We'll email a link to set a new password."
        : mode === "mfa"
          ? "One more step to keep your journey yours."
          : mode === "setpw"
            ? "Choose a password for your account."
            : mode === "confirm"
              ? "Almost there."
              : "Pick up where you left off.";
```

- [ ] **Step 2: replace the header block**

Replace:
```tsx
        <div className="text-center">
          <div className="text-5xl">🎧</div>
          <h1 className="mt-2 font-display text-2xl font-black text-fg">{title}</h1>
        </div>
```
with:
```tsx
        <div className="text-center">
          <div className="inline-flex items-center font-display text-2xl leading-none">
            <span className="rounded-lg bg-gold px-2.5 py-1 text-on-accent">Dean</span>
            <span className="ml-1.5 text-fg">DB</span>
          </div>
          <h1 className="mt-5 font-display text-2xl font-black text-fg">{title}</h1>
          <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
        </div>
```

- [ ] **Step 3: verify**

Run `npm run typecheck` → PASS. `npm run build` → PASS. `npm run test` → PASS.

- [ ] **Step 4: commit**

```bash
git add src/pages/Login.tsx
git commit -m "feat(auth): editorial Sleeve header (wordmark + per-mode subtitle)"
```

---

## Task 2: QA

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 2: Code review** — only the header + `subtitle` const changed; no handler/state-machine edits; tokens only (`bg-gold`, `text-on-accent`, `text-fg`, `text-fg-muted`); `title` still used.
- [ ] **Step 3 (controller, visual):** screenshot `#/login` in Paper and Midnight; toggle to sign-up via "Create account" and confirm the subtitle changes; confirm wordmark/title/subtitle legible in both skins.

---

## Self-Review

**Spec coverage (§5.1 auth reskin):** branded editorial header + warm copy; flow preserved. ✓
**Placeholder scan:** complete code; Task 2 Step 3 is an explicit controller visual check. ✓
**Type consistency:** `subtitle` mirrors the existing `title` ternary over the same `mode` union; no new symbols. ✓
