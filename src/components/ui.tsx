import type { ReactNode } from "react";
import type { AlbumStatus } from "../types";
import { useMeterName } from "../lib/store";

/** Shared 0–10 color ramp used by the Dean Meter and per-song scores. */
export function scoreColor(value: number | null): string {
  if (value == null) return "var(--color-fg-faint)";
  if (value >= 9) return "#f5c518";
  if (value >= 7) return "#7ee081";
  if (value >= 5) return "#ffb84d";
  return "#ff5a3c";
}

// ── The Dean Meter ──────────────────────────────────────────────
// A circular score gauge, IMDb-rating energy but Dean-branded.
export function DeanMeter({
  value,
  size = 56,
  name,
}: {
  value: number | null;
  size?: number;
  /** Persona name for the tooltip — defaults to the surrounding journey's. */
  name?: string;
}) {
  const ctxName = useMeterName();
  const label = name ?? ctxName;
  const pct = value == null ? 0 : value / 10;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = scoreColor(value);
  return (
    <div
      className="relative grid place-items-center shrink-0"
      style={{ width: size, height: size }}
      title={value == null ? "Unrated" : `${label} Meter: ${value.toFixed(1)}/10`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-edge)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span
          className="font-display font-black"
          style={{ color, fontSize: size * 0.3 }}
        >
          {value == null ? "—" : value.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// ── 0–10 score for individual songs ─────────────────────────────
// Same scale as the Dean Meter. Editable as a compact number field;
// read-only renders just the colored value.
export function Score10({
  value,
  onChange,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
}) {
  const color = scoreColor(value);
  if (!onChange) {
    return (
      <span className="font-display text-base font-black tabular-nums sm:text-sm" style={{ color }}>
        {value == null ? "—" : value.toFixed(1)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={10}
        step={0.1}
        value={value ?? ""}
        placeholder="—"
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Math.max(0, Math.min(10, Number(v))));
        }}
        // Roomy tap target on phones; trims back down on ≥sm screens.
        className="h-10 w-16 rounded-md border border-edge bg-panel-2 px-2 text-right text-base font-bold tabular-nums outline-none focus:border-gold/50 sm:h-8 sm:w-14 sm:text-sm"
        style={{ color }}
        aria-label="Song score out of 10"
      />
      <span className="text-xs text-fg-faint">/10</span>
    </span>
  );
}

const STATUS_META: Record<AlbumStatus, { label: string; cls: string }> = {
  completed: { label: "✓ Completed", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  listening: { label: "▶ Now Spinning", cls: "bg-gold/15 text-gold-soft ring-gold/30" },
  want: { label: "☆ On the List", cls: "bg-fg/5 text-fg-muted ring-fg/10" },
};

export function StatusBadge({ status }: { status: AlbumStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${m.cls}`}>
      {m.label}
    </span>
  );
}

/** Marks an artist as an already-heard "Library" pick rather than a marathon one. */
export function LoggedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-violet-300 ring-1 ring-violet-500/30 ${className}`}
      title="Already listened — kept for ratings & Hall of Fame, but out of the marathon"
    >
      📚 Library
    </span>
  );
}

export function ProgressBar({ pct, className = "" }: { pct: number; className?: string }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-fg/10 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-dean via-gold to-gold-soft transition-[width] duration-700"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-edge/70 bg-panel/80 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <div className="mb-4">
      {kicker && (
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold/80">
          {kicker}
        </div>
      )}
      <h2 className="font-display text-2xl font-black tracking-tight text-fg">{title}</h2>
    </div>
  );
}

// ── Themed native <select> ──────────────────────────────────────
// Wraps a native <select> — so it keeps full keyboard + screen-reader behavior —
// but strips the OS chrome (`appearance-none`) and paints it with our tokens plus
// a custom chevron. Without this, the closed control renders as a raw macOS/Safari
// dropdown that clashes with the rest of the dark UI (Bug 3).
export function Select({
  value,
  onChange,
  children,
  className = "",
  title,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={`relative inline-flex ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={title}
        aria-label={ariaLabel ?? title}
        className="w-full cursor-pointer appearance-none rounded-lg border border-edge bg-panel-2 py-2 pl-3 pr-8 text-xs font-semibold text-fg outline-none transition-colors hover:border-gold/40 focus:border-gold/50"
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-fg-faint"
      >
        ▾
      </span>
    </div>
  );
}
