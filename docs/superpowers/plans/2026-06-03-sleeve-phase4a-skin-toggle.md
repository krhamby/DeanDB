# Sleeve — Phase 4a: In-App Skin Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let users actually switch between **Paper** and **Midnight** from Settings (today the skin is only changeable via localStorage in dev).

**Architecture:** `ThemeProvider` already exposes `skin` + `setSkin` (localStorage-persisted, per-device) via `useThemeControl()`. Add an "Appearance" panel to `Settings` with a two-button segmented control calling `setSkin`. Zero new infra. (Cross-device persistence via a `profiles.skin` column is a deliberate later follow-up — localStorage is fine for v1.)

**Tech Stack:** React 18 + TS strict · Tailwind v4 tokens.

**Verification model:** `npm run typecheck` + `npm run build` + `npm run test` green. Visual: the skin-switch mechanism is already proven (the `#/__preview` toggle calls the same `setSkin`); confirm the Settings panel renders via code review (Settings needs auth, so no harness screenshot).

**Out of scope (needs your Supabase setup — separate plans):** `profiles.skin` cross-device sync (migration), cover-color extraction + Supabase Storage re-host.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/pages/Settings.tsx` | Modify | Pull `skin`/`setSkin` from `useThemeControl`; add an "Appearance" panel (Paper/Midnight). |

---

## Task 1: Appearance panel in Settings

**Files:** Modify `src/pages/Settings.tsx`

- [ ] **Step 1: extend the useThemeControl destructure**

Find:
```tsx
  const { setThemeOverride, surface } = useThemeControl();
```
Replace with:
```tsx
  const { setThemeOverride, surface, skin, setSkin } = useThemeControl();
```

- [ ] **Step 2: add the Appearance panel before the Theme panel**

Find the Theme panel opening:
```tsx
      {/* Theme */}
      <Panel className="space-y-3 p-5">
        <h3 className="font-display text-lg font-black text-fg">Theme</h3>
```
Insert this Appearance panel IMMEDIATELY BEFORE the `{/* Theme */}` comment:
```tsx
      {/* Appearance / skin */}
      <Panel className="space-y-3 p-5">
        <h3 className="font-display text-lg font-black text-fg">Appearance</h3>
        <p className="text-sm text-fg-muted">Pick your skin. Saved on this device.</p>
        <div className="flex gap-2">
          {(["paper", "midnight"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSkin(s)}
              aria-pressed={skin === s}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition ${
                skin === s ? "bg-gold text-on-accent" : "border border-edge text-fg-muted hover:text-fg"
              }`}
            >
              {s === "paper" ? "📰 Paper" : "🌙 Midnight"}
            </button>
          ))}
        </div>
      </Panel>

```

- [ ] **Step 3: verify**

Run `npm run typecheck` → PASS (no unused vars — both `skin` and `setSkin` are now used). `npm run build` → PASS. `npm run test` → PASS.

- [ ] **Step 4: commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat(appearance): in-app Paper/Midnight skin toggle in Settings"
```

---

## Task 2: QA

- [ ] **Step 1: Gate** — `npm run test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 2: Code review** — `setSkin` called with the literal union (`"paper"|"midnight"`); active state via `skin ===`; tokens only; the existing Theme/accent panel and all other Settings logic (Security, visibility, accent pickers, `SURFACE`/contrast preview) untouched.

---

## Self-Review

**Spec coverage (§5.6 theming / Phase 4 Midnight toggle):** the in-app skin switch is now user-reachable (localStorage-persisted). Cross-device `profiles.skin` sync explicitly deferred (needs a migration). ✓
**Placeholder scan:** complete code in both steps. ✓
**Type consistency:** `skin`/`setSkin` come from the existing `ThemeControl` (`SkinId`); `["paper","midnight"] as const` matches `SkinId`. ✓
