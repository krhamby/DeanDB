// Synthesized sound + haptics for the Marathon Wheel. No audio files, no network.
// Every export is a safe no-op when Web Audio / Vibration aren't available
// (SSR, tests, iOS Safari for haptics) so callers never need to guard.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  // AudioContext starts suspended until a user gesture; the Spin click is one.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** True when the user asked the OS to minimize motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A short percussive tick — the reel clicking past an artist. */
export function tick(volume = 0.05): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(150, t);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}

/** A bright C–E–G arpeggio when the wheel lands. */
export function landChime(): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const dt = i * 0.08;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t + dt);
    gain.gain.setValueAtTime(0.0001, t + dt);
    gain.gain.exponentialRampToValueAtTime(0.12, t + dt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.5);
    osc.connect(gain).connect(ac.destination);
    osc.start(t + dt);
    osc.stop(t + dt + 0.5);
  });
}

/** Best-effort haptic. Android Chrome buzzes; iOS Safari has no Vibration API → no-op. */
export function haptic(pattern: number | number[] = 18): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}
