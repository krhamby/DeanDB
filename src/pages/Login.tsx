import { useEffect, useState } from "react";
import { useAuth } from "../lib/store";
import { navigate } from "../lib/router";
import * as api from "../lib/api";
import { Panel } from "../components/ui";
import { Wordmark } from "../components/Wordmark";

type Mode = "signin" | "signup" | "forgot" | "mfa" | "setpw" | "confirm";

const inputCls =
  "w-full rounded-xl border border-[var(--color-edge-strong)] bg-panel-2 px-4 py-2.5 text-fg outline-none placeholder:text-fg-faint focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold";

export function Login() {
  const { session, mfaPending, passwordRecovery, signIn, signUp, verifyMfa, requestPasswordReset, updatePassword } =
    useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [mfa, setMfa] = useState<{ factorId: string; challengeId: string } | null>(null);

  // A recovery link puts us in set-password mode regardless of anything else.
  useEffect(() => {
    if (passwordRecovery) setMode("setpw");
  }, [passwordRecovery]);

  // If the session is stuck at aal1 (e.g. reloaded mid-challenge), mint a fresh
  // challenge so the user can finish with their authenticator code.
  useEffect(() => {
    if (!mfaPending || passwordRecovery) return;
    if (mfa) {
      setMode("mfa");
      return;
    }
    let active = true;
    void (async () => {
      const factor = (await api.listMfaFactors()).find((f) => f.status === "verified");
      if (!factor) return;
      const ch = await api.challengeTotp(factor.id);
      if (active && ch.ok && ch.challengeId) {
        setMfa({ factorId: factor.id, challengeId: ch.challengeId });
        setMode("mfa");
      }
    })();
    return () => {
      active = false;
    };
  }, [mfaPending, passwordRecovery, mfa]);

  // Fully signed in → bounce to the journey.
  if (session && !mfaPending && !passwordRecovery) {
    return (
      <div className="py-16 text-center">
        <p className="text-fg-muted">You&apos;re signed in. 🎧</p>
        <button onClick={() => navigate("/me")} className="mt-4 text-gold hover:underline">
          Go to my journey →
        </button>
      </div>
    );
  }

  const reset = () => {
    setError("");
    setInfo("");
  };

  const doSignIn = async () => {
    reset();
    if (!email.trim() || !password) return;
    setBusy(true);
    const res = await signIn(email.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Sign-in failed.");
      return;
    }
    if (res.mfaRequired && res.factorId && res.challengeId) {
      setMfa({ factorId: res.factorId, challengeId: res.challengeId });
      setMode("mfa");
    }
    // Otherwise onAuthStateChange flips us to signed-in and the router re-renders.
  };

  const doSignUp = async () => {
    reset();
    if (!email.trim() || password.length < 8) {
      setError("Enter an email and a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await signUp(email.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Sign-up failed.");
      return;
    }
    if (res.needsConfirmation) setMode("confirm");
  };

  const doForgot = async () => {
    reset();
    if (!email.trim()) return;
    setBusy(true);
    await requestPasswordReset(email.trim());
    setBusy(false);
    setInfo("If that email has an account, a password link is on its way. Open it in this browser to continue.");
  };

  const doVerifyMfa = async () => {
    reset();
    if (!mfa || code.length < 6) return;
    setBusy(true);
    const res = await verifyMfa(mfa.factorId, mfa.challengeId, code.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "That code didn't match.");
      // Challenges are single-use — mint a fresh one for the retry.
      const ch = await api.challengeTotp(mfa.factorId);
      if (ch.ok && ch.challengeId) setMfa({ factorId: mfa.factorId, challengeId: ch.challengeId });
      setCode("");
    }
  };

  const doSetPw = async () => {
    reset();
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't set the password.");
      return;
    }
    navigate("/me");
  };

  const title =
    mode === "signup"
      ? "Create your account"
      : mode === "forgot"
        ? "Reset your password"
        : mode === "mfa"
          ? "Two-factor code"
          : mode === "setpw"
            ? "Set a new password"
            : mode === "confirm"
              ? "Confirm your email"
              : "Sign in to DeanDB";

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

  return (
    <div className="mx-auto max-w-md py-12">
      <Panel className="space-y-4 p-8">
        <div className="text-center">
          <Wordmark size="hero" />
          <h1 className="mt-5 font-display text-2xl font-black text-fg">{title}</h1>
          <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
        </div>

        {mode === "confirm" ? (
          <p className="text-center text-sm text-fg-muted">
            Check <span className="text-gold">{email}</span> to confirm your account, then come back and sign in.
          </p>
        ) : mode === "mfa" ? (
          <>
            <p className="text-center text-sm text-fg-muted">Enter the 6-digit code from your authenticator app.</p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && doVerifyMfa()}
              placeholder="123456"
              className={`${inputCls} text-center text-2xl tracking-[0.4em]`}
              aria-label="Authentication code"
            />
            <button
              onClick={doVerifyMfa}
              disabled={busy || code.length < 6}
              className="w-full rounded-xl bg-gold px-5 py-2.5 font-bold text-on-accent hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
          </>
        ) : mode === "setpw" ? (
          <>
            <input
              type="password"
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              aria-label="New password"
              className={inputCls}
            />
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSetPw()}
              placeholder="Confirm password"
              aria-label="Confirm new password"
              className={inputCls}
            />
            <button
              onClick={doSetPw}
              disabled={busy}
              className="w-full rounded-xl bg-gold px-5 py-2.5 font-bold text-on-accent hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Set password"}
            </button>
          </>
        ) : mode === "forgot" ? (
          <>
            <p className="text-center text-sm text-fg-muted">
              Enter your email and we&apos;ll send a link to set a new password.
            </p>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doForgot()}
              placeholder="you@example.com"
              aria-label="Email"
              className={inputCls}
            />
            <button
              onClick={doForgot}
              disabled={busy || !email.trim()}
              className="w-full rounded-xl bg-gold px-5 py-2.5 font-bold text-on-accent hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
            <button
              onClick={() => {
                reset();
                setMode("signin");
              }}
              className="block w-full text-center text-sm text-fg-muted hover:text-fg"
            >
              ← Back to sign in
            </button>
          </>
        ) : (
          <>
            <input
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email"
              className={inputCls}
            />
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (mode === "signup" ? doSignUp() : doSignIn())}
              placeholder="Password"
              aria-label="Password"
              className={inputCls}
            />
            {mode === "signup" && (
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSignUp()}
                placeholder="Confirm password"
                aria-label="Confirm password"
                className={inputCls}
              />
            )}
            <button
              onClick={mode === "signup" ? doSignUp : doSignIn}
              disabled={busy || !email.trim() || !password}
              className="w-full min-h-11 rounded-xl bg-gold px-5 py-2.5 font-bold text-on-accent hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                onClick={() => {
                  reset();
                  setConfirm("");
                  setMode(mode === "signup" ? "signin" : "signup");
                }}
                className="text-gold hover:underline"
              >
                {mode === "signup" ? "Have an account? Sign in" : "Create account"}
              </button>
              {mode === "signin" && (
                <button
                  onClick={() => {
                    reset();
                    setMode("forgot");
                  }}
                  className="text-fg-muted hover:text-fg"
                >
                  Forgot password?
                </button>
              )}
            </div>
            {mode === "signin" && (
              <p className="text-center text-xs text-fg-faint">
                Used a magic link before?{" "}
                <button
                  onClick={() => {
                    reset();
                    setMode("forgot");
                  }}
                  className="text-gold hover:underline"
                >
                  Set a password
                </button>{" "}
                to continue.
              </p>
            )}
          </>
        )}

        {error && <p className="text-center text-sm font-semibold text-dean">{error}</p>}
        {info && <p className="text-center text-sm text-[var(--color-status-done)]">{info}</p>}
      </Panel>
    </div>
  );
}
