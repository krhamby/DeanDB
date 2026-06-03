import { useEffect, useState } from "react";
import { useAuth, useThemeControl } from "../lib/store";
import { navigate } from "../lib/router";
import { firstWord } from "../lib/format";
import { DEFAULT_THEME, PRESETS, SURFACE, contrastRatio, isHexColor, legible, resolveTheme, type Theme } from "../lib/themes";
import { Panel, SectionTitle } from "../components/ui";
import type { Visibility } from "../types";

const inputCls =
  "w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-white/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
      {label}
      {children}
    </label>
  );
}

export function Settings() {
  const { profile, updateProfile } = useAuth();
  const [form, setForm] = useState(() => ({
    username: profile?.username ?? "",
    displayName: profile?.displayName ?? "",
    meterName: profile?.meterName ?? "",
    handle: profile?.handle ?? "",
    tagline: profile?.tagline ?? "",
    bio: profile?.bio ?? "",
    avatarUrl: profile?.avatarUrl ?? "",
    season: profile?.season ?? "",
    goalHours: profile?.goalHours ?? 250,
  }));
  const [visibility, setVisibility] = useState<Visibility>(profile?.visibility ?? "private");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Live-preview the theme while editing; cleared on leave (saved colors then
  // apply globally via the updated profile).
  const { setThemeOverride } = useThemeControl();
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(profile));
  // Resync from the profile when it first resolves / its identity changes (the
  // useState initializer only runs once). Keyed on id so in-page edits and
  // post-save updates (same id) don't clobber what the user is editing.
  useEffect(() => {
    setTheme(resolveTheme(profile));
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setThemeOverride(theme);
    return () => setThemeOverride(null);
  }, [theme, setThemeOverride]);

  if (!profile) return null;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await updateProfile({
      username: form.username.trim(),
      displayName: form.displayName.trim() || form.username.trim(),
      meterName: form.meterName.trim() || null,
      handle: form.handle.trim() || null,
      tagline: form.tagline,
      bio: form.bio,
      avatarUrl: form.avatarUrl.trim() || null,
      season: form.season,
      goalHours: Number(form.goalHours) || 250,
      visibility,
      themeAccent: isHexColor(theme.accent) ? theme.accent : null,
      themeSecondary: isHexColor(theme.secondary) ? theme.secondary : null,
    });
    setSaving(false);
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error ?? "Save failed." });
  };

  const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}#/u/${form.username}`;
  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  // What the colors actually render as: each is clamped to stay legible on the
  // dark surface, so we preview the *applied* color and flag any auto-lightening.
  const appliedAccent = legible(theme.accent);
  const appliedSecondary = legible(theme.secondary);
  const accentRatio = contrastRatio(appliedAccent, SURFACE);
  const adjusted =
    appliedAccent.toLowerCase() !== theme.accent.toLowerCase() ||
    appliedSecondary.toLowerCase() !== theme.secondary.toLowerCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SectionTitle kicker="Your account" title="Settings" />

      <Panel className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Username (your link)">
            <input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <Field label="Display name">
            <input className={inputCls} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </Field>
          <Field label="Meter name (labels)">
            <input
              className={inputCls}
              value={form.meterName}
              onChange={(e) => setForm({ ...form, meterName: e.target.value })}
              placeholder={firstWord(form.displayName) || "e.g. Kevin"}
              maxLength={40}
            />
          </Field>
          <Field label="Handle">
            <input className={inputCls} value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="@you" />
          </Field>
          <Field label="Avatar URL">
            <input className={inputCls} value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://…" />
          </Field>
          <Field label="Season label">
            <input className={inputCls} value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} />
          </Field>
          <Field label="Goal hours">
            <input type="number" min={1} className={inputCls} value={form.goalHours} onChange={(e) => setForm({ ...form, goalHours: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Tagline">
          <input className={inputCls} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        </Field>
        <Field label="Bio">
          <textarea rows={3} className={inputCls} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </Field>
      </Panel>

      {/* Visibility + Share */}
      <Panel className="space-y-3 p-5">
        <h3 className="font-display text-lg font-black text-white">Sharing</h3>
        <div className="flex flex-wrap items-center gap-2">
          {(["private", "public"] as Visibility[]).map((v) => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${
                visibility === v ? "bg-gold text-black" : "border border-edge text-zinc-400 hover:text-white"
              }`}
            >
              {v === "private" ? "🔒 Private" : "🌍 Public"}
            </button>
          ))}
          <span className="text-xs text-zinc-500">
            {visibility === "public"
              ? "Anyone with your link can view your journey."
              : "Only you and accepted followers can view your journey."}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 truncate rounded bg-black/40 px-2 py-1.5 text-xs text-gold">{shareUrl}</code>
          <button onClick={share} className="rounded-lg border border-edge px-3 py-1.5 text-sm font-semibold text-zinc-300 hover:text-white">
            {copied ? "Copied!" : "📋 Copy link"}
          </button>
        </div>
      </Panel>

      {/* Theme */}
      <Panel className="space-y-3 p-5">
        <h3 className="font-display text-lg font-black text-white">Theme</h3>
        <p className="text-xs text-zinc-500">
          Recolor the accents — changes preview live, Save to keep them. Friends see your colors on your profile.
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active =
              theme.accent.toLowerCase() === p.theme.accent.toLowerCase() &&
              theme.secondary.toLowerCase() === p.theme.secondary.toLowerCase();
            return (
              <button
                key={p.id}
                onClick={() => setTheme(p.theme)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                  active ? "border-gold text-white" : "border-edge text-zinc-400 hover:text-white"
                }`}
              >
                <span className="flex overflow-hidden rounded-full ring-1 ring-black/30">
                  <span className="h-4 w-4" style={{ background: p.theme.accent }} />
                  <span className="h-4 w-4" style={{ background: p.theme.secondary }} />
                </span>
                {p.name}
                {active && <span aria-hidden className="text-gold">✓</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Accent
            <input
              type="color"
              value={theme.accent}
              onChange={(e) => setTheme({ ...theme, accent: e.target.value })}
              className="h-8 w-12 cursor-pointer rounded border border-edge bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Secondary
            <input
              type="color"
              value={theme.secondary}
              onChange={(e) => setTheme({ ...theme, secondary: e.target.value })}
              className="h-8 w-12 cursor-pointer rounded border border-edge bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            />
          </label>
          <button
            onClick={() => setTheme(DEFAULT_THEME)}
            className="rounded text-xs text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            Reset to default
          </button>
        </div>

        {/* Live preview + contrast read-out so the chosen colors are WYSIWYG. */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-edge/60 bg-panel-2/60 p-3">
          <span
            className="rounded-md px-3 py-1.5 text-sm font-bold text-black"
            style={{ background: appliedAccent }}
          >
            Button
          </span>
          <span className="text-sm font-bold" style={{ color: appliedAccent }}>
            Accent text
          </span>
          <span
            className="h-5 w-5 rounded-full ring-1 ring-black/30"
            style={{ background: appliedSecondary }}
            title="Secondary"
          />
          <span className="text-xs text-zinc-500">
            contrast {accentRatio.toFixed(1)}:1 {accentRatio >= 4.5 ? "· AA ✓" : ""}
          </span>
        </div>
        {adjusted && (
          <p className="text-[11px] text-zinc-500">
            Dark colors are lightened automatically so accent text and buttons stay readable.
          </p>
        )}
      </Panel>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !form.username.trim()}
          className="rounded-xl bg-gold px-5 py-2.5 font-bold text-black hover:brightness-110 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button onClick={() => navigate("/me")} className="text-sm text-zinc-400 hover:text-white">
          ← Back to my journey
        </button>
        {msg && <span className={`text-sm font-semibold ${msg.ok ? "text-emerald-400" : "text-dean"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
