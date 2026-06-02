import { useState } from "react";
import { useAuth } from "../lib/store";
import { navigate } from "../lib/router";
import { Panel } from "../components/ui";

export function Login() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  if (session) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-300">You&apos;re signed in. 🎧</p>
        <button onClick={() => navigate("/me")} className="mt-4 text-gold hover:underline">
          Go to my journey →
        </button>
      </div>
    );
  }

  const submit = async () => {
    const e = email.trim();
    if (!e) return;
    setBusy(true);
    setError("");
    const res = await signIn(e);
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(res.error ?? "Couldn't send the link. Try again.");
  };

  return (
    <div className="mx-auto max-w-md py-12">
      <Panel className="space-y-4 p-8 text-center">
        <div className="text-5xl">🎧</div>
        <h1 className="font-display text-2xl font-black text-white">Sign in to DeanDB</h1>
        {sent ? (
          <p className="text-sm text-zinc-300">
            Check <span className="text-gold">{email}</span> for a magic link. Click it to finish signing in —
            you can close this tab.
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">
              Track your own listening journey and share it with friends. Enter your email and we&apos;ll send a
              one-tap sign-in link — no password needed.
            </p>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-edge bg-panel-2 px-4 py-2.5 text-center text-white outline-none placeholder:text-zinc-600 focus:border-gold/50"
            />
            <button
              onClick={submit}
              disabled={busy || !email.trim()}
              className="w-full rounded-xl bg-gold px-5 py-2.5 font-bold text-black transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send magic link"}
            </button>
            {error && <p className="text-sm font-semibold text-dean">{error}</p>}
          </>
        )}
      </Panel>
    </div>
  );
}
