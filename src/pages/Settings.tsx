import { useEffect, useState } from "react";
import { Armchair, Check, Copy, Globe, Lock, Moon, Mountain, Newspaper } from "lucide-react";
import { useAuth, useThemeControl } from "../lib/store";
import { navigate, profilePath } from "../lib/router";
import { firstWord, fmtTimeAgo } from "../lib/format";
import { DEFAULT_THEME, PRESETS, contrastRatio, isHexColor, legible, resolveTheme, type Theme } from "../lib/themes";
import { Panel, SectionTitle } from "../components/ui";
import { Avatar } from "../components/social";
import * as api from "../lib/api";
import type { BlockedUser, Visibility } from "../types";

const inputCls =
  "w-full rounded-lg border border-[var(--color-edge-strong)] bg-panel-2 px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold";

// Usernames are the shareable handle (in the URL), so keep them link-safe:
// letters, numbers and underscores only — matching the signup trigger's set.
const USERNAME_MAX = 24;
const sanitizeUsername = (v: string) => v.replace(/[^A-Za-z0-9_]/g, "").slice(0, USERNAME_MAX);
function validateUsername(name: string): string | null {
  const u = name.trim();
  if (!u) return "Username is required.";
  if (u.length > USERNAME_MAX) return `Username must be ${USERNAME_MAX} characters or fewer.`;
  if (!/^[A-Za-z0-9_]+$/.test(u))
    return "Username can only contain letters, numbers and underscores (no spaces).";
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">
      {label}
      {children}
    </label>
  );
}

/** Account security: TOTP two-factor, change password, sign out everywhere.
 *  These act on Supabase Auth directly (not the profile), so they have their own
 *  buttons and don't go through the profile Save flow. */
function SecuritySection() {
  const { updatePassword, signOut } = useAuth();
  const [factors, setFactors] = useState<api.MfaFactor[]>([]);
  const [enroll, setEnroll] = useState<{ factorId: string; qrCode?: string; secret?: string } | null>(null);
  const [code, setCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () => api.listMfaFactors().then(setFactors).catch(() => setFactors([]));
  useEffect(() => {
    void refresh();
  }, []);

  const verified = factors.find((f) => f.status === "verified");

  const startEnroll = async () => {
    setMsg(null);
    setBusy(true);
    const res = await api.enrollTotp("Authenticator");
    setBusy(false);
    if (!res.ok || !res.factorId) {
      setMsg({ ok: false, text: res.error ?? "Couldn't start enrollment." });
      return;
    }
    setEnroll({ factorId: res.factorId, qrCode: res.qrCode, secret: res.secret });
    setCode("");
  };

  const cancelEnroll = async () => {
    // Remove the lingering unverified factor so a retry can re-enroll cleanly.
    if (enroll) await api.unenrollTotp(enroll.factorId).catch(() => {});
    setEnroll(null);
    setCode("");
  };

  const confirmEnroll = async () => {
    if (!enroll || code.length < 6) return;
    setBusy(true);
    const res = await api.verifyTotpEnrollment(enroll.factorId, code.trim());
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error ?? "That code didn't match." });
      return;
    }
    setEnroll(null);
    setCode("");
    setMsg({ ok: true, text: "Two-factor authentication is on." });
    void refresh();
  };

  const disable = async () => {
    if (!verified || !window.confirm("Turn off two-factor authentication?")) return;
    setBusy(true);
    const res = await api.unenrollTotp(verified.id);
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Two-factor turned off." } : { ok: false, text: res.error ?? "Couldn't disable." });
    void refresh();
  };

  const changePw = async () => {
    setMsg(null);
    if (newPw.length < 8) {
      setMsg({ ok: false, text: "Use a password of at least 8 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setMsg({ ok: false, text: "Passwords don't match." });
      return;
    }
    setBusy(true);
    const res = await updatePassword(newPw);
    setBusy(false);
    if (res.ok) {
      setNewPw("");
      setConfirmPw("");
    }
    setMsg(res.ok ? { ok: true, text: "Password updated." } : { ok: false, text: res.error ?? "Couldn't update." });
  };

  const signOutAll = async () => {
    if (!window.confirm("Sign out of DeanDB on all devices?")) return;
    await signOut("global");
    navigate("/login");
  };

  return (
    <Panel className="space-y-4 p-5">
      <h3 className="font-display text-lg font-black text-fg">Security</h3>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Two-factor authentication</div>
        {verified ? (
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--color-status-done)]"><Check className="h-4 w-4" aria-hidden /> On (authenticator app)</span>
            <button onClick={disable} disabled={busy} className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-dean hover:brightness-110 disabled:opacity-40">
              Turn off
            </button>
          </div>
        ) : enroll ? (
          <div className="space-y-2 rounded-xl border border-edge/60 bg-panel-2/60 p-3">
            <p className="text-sm text-fg-muted">Scan this in your authenticator app, then enter the 6-digit code.</p>
            {enroll.qrCode && (
              <img
                // Supabase returns qr_code as a ready-to-use `data:image/svg+xml`
                // URI — render it as-is. Re-encoding it produced a double-encoded
                // src that silently failed to load, so the QR never appeared.
                src={enroll.qrCode}
                alt="TOTP QR code"
                className="h-40 w-40 rounded bg-white p-2"
              />
            )}
            {enroll.secret && (
              <p className="break-all text-xs text-fg-faint">
                Or enter this key manually: <code className="text-gold">{enroll.secret}</code>
              </p>
            )}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className={`${inputCls} text-center tracking-[0.3em]`}
            />
            <div className="flex gap-2">
              <button onClick={confirmEnroll} disabled={busy || code.length < 6} className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-on-accent hover:brightness-110 disabled:opacity-40">
                Verify &amp; enable
              </button>
              <button onClick={cancelEnroll} className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-fg-muted hover:text-fg">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg-muted">Require a code from an authenticator app at sign-in.</span>
            <button onClick={startEnroll} disabled={busy} className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-gold hover:brightness-110 disabled:opacity-40">
              Enable
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-edge/60 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Change password</div>
        <input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" className={inputCls} />
        <input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Confirm new password" className={inputCls} />
        <button onClick={changePw} disabled={busy || !newPw} className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-gold hover:brightness-110 disabled:opacity-40">
          Update password
        </button>
      </div>

      <div className="border-t border-edge/60 pt-3">
        <button onClick={signOutAll} className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-fg-muted hover:text-fg">
          Sign out everywhere
        </button>
      </div>

      {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-[var(--color-status-done)]" : "text-dean"}`}>{msg.text}</p>}
    </Panel>
  );
}

/** People you've blocked — review and unblock. Blocking itself happens from a
 *  profile or DM thread; the server severs follows and refuses new contact. */
function BlockedSection() {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api
      .listBlockedUsers()
      .then((list) => active && setBlocked(list))
      .catch(() => active && setBlocked([]))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [user]);

  const unblock = async (id: string) => {
    if (!user) return;
    setBlocked((list) => list.filter((b) => b.id !== id));
    try {
      await api.unblockUser(user.id, id);
    } catch (e) {
      console.error("unblock failed", e);
    }
  };

  if (!loaded || blocked.length === 0) return null;

  return (
    <Panel className="space-y-3 p-5">
      <h3 className="font-display text-lg font-black text-fg">Blocked users</h3>
      <p className="text-xs text-fg-faint">
        Blocked people can't follow you, message you, or send you recommendations.
      </p>
      <div className="space-y-2">
        {blocked.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-xl border border-edge/60 bg-panel-2/60 p-3">
            <Avatar profile={b} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-fg">{b.displayName}</div>
              <div className="truncate text-xs text-fg-faint">
                @{b.username} · blocked {fmtTimeAgo(b.blockedAt)}
              </div>
            </div>
            <button
              onClick={() => unblock(b.id)}
              className="shrink-0 rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-fg-muted hover:text-fg"
            >
              Unblock
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function Settings() {
  const { profile, updateProfile } = useAuth();
  const [form, setForm] = useState(() => ({
    username: profile?.username ?? "",
    displayName: profile?.displayName ?? "",
    meterName: profile?.meterName ?? "",
    tagline: profile?.tagline ?? "",
    bio: profile?.bio ?? "",
    avatarUrl: profile?.avatarUrl ?? "",
    season: profile?.season ?? "",
    goalHours: profile?.goalHours ?? 250,
  }));
  const [visibility, setVisibility] = useState<Visibility>(profile?.visibility ?? "private");
  const [lockOwnTheme, setLockOwnTheme] = useState(profile?.lockOwnTheme ?? false);
  const [marathonEnabled, setMarathonEnabled] = useState(profile?.marathonEnabled ?? true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Live-preview the theme while editing; cleared on leave (saved colors then
  // apply globally via the updated profile).
  const { setThemeOverride, surface, skin, setSkin } = useThemeControl();
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
    const usernameError = validateUsername(form.username);
    if (usernameError) {
      setMsg({ ok: false, text: usernameError });
      return;
    }
    setSaving(true);
    setMsg(null);
    const res = await updateProfile({
      username: form.username.trim(),
      displayName: form.displayName.trim() || form.username.trim(),
      meterName: form.meterName.trim() || null,
      tagline: form.tagline,
      bio: form.bio,
      avatarUrl: form.avatarUrl.trim() || null,
      season: form.season,
      goalHours: Number(form.goalHours) || 250,
      visibility,
      marathonEnabled,
      themeAccent: isHexColor(theme.accent) ? theme.accent : null,
      themeSecondary: isHexColor(theme.secondary) ? theme.secondary : null,
      lockOwnTheme,
    });
    setSaving(false);
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error ?? "Save failed." });
  };

  const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}#${profilePath(form.username)}`;
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
  const appliedAccent = legible(theme.accent, surface);
  const appliedSecondary = legible(theme.secondary, surface);
  const accentRatio = contrastRatio(appliedAccent, surface);
  const adjusted =
    appliedAccent.toLowerCase() !== theme.accent.toLowerCase() ||
    appliedSecondary.toLowerCase() !== theme.secondary.toLowerCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SectionTitle kicker="Your account" title="Settings" />

      <Panel className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Username (your link)">
            <input
              className={inputCls}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: sanitizeUsername(e.target.value) })}
              maxLength={USERNAME_MAX}
              placeholder="e.g. thedean"
            />
            <span className="text-[11px] font-normal normal-case tracking-normal text-fg-faint">
              Letters, numbers and underscores — no spaces.
            </span>
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

      {/* Journey style — marathon vs. chill */}
      <Panel className="space-y-3 p-5">
        <h3 className="font-display text-lg font-black text-fg">Journey style</h3>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { on: true, label: "Marathon", Icon: Mountain },
              { on: false, label: "Chill", Icon: Armchair },
            ] as const
          ).map(({ on, label, Icon }) => (
            <button
              key={label}
              onClick={() => setMarathonEnabled(on)}
              aria-pressed={marathonEnabled === on}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                marathonEnabled === on ? "bg-gold text-on-accent" : "border border-edge text-fg-muted hover:text-fg"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </button>
          ))}
          <span className="text-xs text-fg-faint">
            {marathonEnabled
              ? "Chase the Summit — goal meter, progress and the Marathon Wheel."
              : "Just log, rate and share — no goal, no meter, no pressure. Nothing is lost if you switch back."}
          </span>
        </div>
      </Panel>

      {/* Visibility + Share */}
      <Panel className="space-y-3 p-5">
        <h3 className="font-display text-lg font-black text-fg">Sharing</h3>
        <div className="flex flex-wrap items-center gap-2">
          {(["private", "public"] as Visibility[]).map((v) => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${
                visibility === v ? "bg-gold text-on-accent" : "border border-edge text-fg-muted hover:text-fg"
              }`}
            >
              {v === "private" ? (
                <>
                  <Lock className="h-4 w-4" aria-hidden /> Private
                </>
              ) : (
                <>
                  <Globe className="h-4 w-4" aria-hidden /> Public
                </>
              )}
            </button>
          ))}
          <span className="text-xs text-fg-faint">
            {visibility === "public"
              ? "Anyone with your link can view your journey."
              : "Only you and accepted followers can view your journey."}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 truncate rounded bg-fg/5 px-2 py-1.5 text-xs text-gold">{shareUrl}</code>
          <button onClick={share} className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
            {copied ? (
              "Copied!"
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden /> Copy link
              </>
            )}
          </button>
        </div>
      </Panel>

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
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold transition ${
                skin === s ? "bg-gold text-on-accent" : "border border-edge text-fg-muted hover:text-fg"
              }`}
            >
              {s === "paper" ? (
                <>
                  <Newspaper className="h-4 w-4" aria-hidden /> Paper
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4" aria-hidden /> Midnight
                </>
              )}
            </button>
          ))}
        </div>
      </Panel>

      {/* Theme */}
      <Panel className="space-y-3 p-5">
        <h3 className="font-display text-lg font-black text-fg">Theme</h3>
        <p className="text-xs text-fg-faint">
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
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50 ${
                  active ? "border-gold text-fg" : "border-edge text-fg-muted hover:text-fg"
                }`}
              >
                <span className="flex overflow-hidden rounded-full ring-1 ring-black/30">
                  <span className="h-4 w-4" style={{ background: p.theme.accent }} />
                  <span className="h-4 w-4" style={{ background: p.theme.secondary }} />
                </span>
                {p.name}
                {active && <Check className="h-4 w-4 text-gold" aria-hidden />}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">
            Accent
            <input
              type="color"
              value={theme.accent}
              onChange={(e) => setTheme({ ...theme, accent: e.target.value })}
              className="h-8 w-12 cursor-pointer rounded border border-edge bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">
            Secondary
            <input
              type="color"
              value={theme.secondary}
              onChange={(e) => setTheme({ ...theme, secondary: e.target.value })}
              className="h-8 w-12 cursor-pointer rounded border border-edge bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50"
            />
          </label>
          <button
            onClick={() => setTheme(DEFAULT_THEME)}
            className="rounded text-xs text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50"
          >
            Reset to default
          </button>
        </div>

        {/* Live preview + contrast read-out so the chosen colors are WYSIWYG. */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-edge/60 bg-panel-2/60 p-3">
          <span
            className="rounded-md px-3 py-1.5 text-sm font-bold text-on-accent"
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
          <span className="inline-flex items-center gap-1 text-xs text-fg-faint">
            contrast {accentRatio.toFixed(1)}:1
            {accentRatio >= 4.5 && (
              <>
                · AA <Check className="h-3 w-3" aria-hidden />
              </>
            )}
          </span>
        </div>
        {adjusted && (
          <p className="text-[11px] text-fg-faint">
            Dark colors are lightened automatically so accent text and buttons stay readable.
          </p>
        )}
        <label className="flex cursor-pointer items-start gap-2 border-t border-edge/60 pt-3 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={lockOwnTheme}
            onChange={(e) => setLockOwnTheme(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-gold"
          />
          <span>
            <span className="font-semibold text-fg">Always use my own theme</span>
            <span className="block text-xs text-fg-faint">
              Accessibility: keep these colors everywhere and never apply other people&apos;s profile
              themes when viewing their journeys.
            </span>
          </span>
        </label>
      </Panel>

      <BlockedSection />

      <SecuritySection />

      <div className="flex items-center justify-between gap-3">
        <button onClick={() => navigate("/me")} className="text-sm text-fg-muted hover:text-fg">
          ← Back to my journey
        </button>
        <div className="flex items-center gap-3">
          {msg && <span className={`text-sm font-semibold ${msg.ok ? "text-[var(--color-status-done)]" : "text-dean"}`}>{msg.text}</span>}
          <button
            onClick={save}
            disabled={saving || !form.username.trim()}
            className="min-h-11 rounded-xl bg-gold px-5 py-2.5 font-bold text-on-accent hover:brightness-110 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
