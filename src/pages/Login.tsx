import { useState } from "react";
import { useStore } from "../lib/store";
import { navigate } from "../lib/router";
import { Panel } from "../components/ui";

export function Login() {
  const { login, isEditor } = useStore();
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (isEditor) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-300">You&apos;re logged in as the editor. 🎧</p>
        <button onClick={() => navigate("/editor")} className="mt-4 text-gold hover:underline">
          Go to the Editor →
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!passcode.trim()) return;
    setBusy(true);
    setError("");
    const ok = await login(passcode.trim());
    setBusy(false);
    if (ok) navigate("/editor");
    else setError("That passcode didn't match. Try again, Dean.");
  };

  return (
    <div className="mx-auto max-w-md py-12">
      <Panel className="space-y-4 p-8 text-center">
        <div className="text-5xl">🔒</div>
        <h1 className="font-display text-2xl font-black text-white">Editor Login</h1>
        <p className="text-sm text-zinc-400">
          DeanDB is view-only for everyone. Enter the editor passcode to unlock adding and rating.
        </p>
        <input
          type="password"
          autoFocus
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Editor passcode"
          className="w-full rounded-xl border border-edge bg-panel-2 px-4 py-2.5 text-center text-white outline-none placeholder:text-zinc-600 focus:border-gold/50"
        />
        <button
          onClick={submit}
          disabled={busy || !passcode.trim()}
          className="w-full rounded-xl bg-gold px-5 py-2.5 font-bold text-black transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Checking…" : "Unlock editing"}
        </button>
        {error && <p className="text-sm font-semibold text-dean">{error}</p>}
      </Panel>
    </div>
  );
}
