import type { ReactNode } from "react";
import type { AlbumStatus } from "../types";
import { useMeterName, useThemeControl } from "../lib/store";
import { legible } from "../lib/themes";

/** 0-10 color ramp. Pass `surface` to clamp legible for the active skin (UI);
 *  omit it to get the bright base colors (e.g. the fixed-palette share card). */
export function scoreColor(value: number | null, surface?: string): string {
  if (value == null) return "var(--color-fg-faint)";
  const base = value >= 9 ? "#f5c518" : value >= 7 ? "#7ee081" : value >= 5 ? "#ffb84d" : "#ff5a3c";
  return surface ? legible(base, surface) : base;
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
  const { surface } = useThemeControl();
  const label = name ?? ctxName;
  const pct = value == null ? 0 : value / 10;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = scoreColor(value, surface);
  return (
    <div
      className="relative grid place-items-center shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        // A high-score glow that fades cleanly as a circle (a drop-shadow on the
        // SVG circle clips to its square viewport — box-shadow on the round wrapper
        // doesn't).
        boxShadow: value != null && value >= 9 ? `0 0 15px -3px ${color}` : undefined,
      }}
      title={value == null ? "Unrated" : `${label} Meter: ${value.toFixed(1)}/10`}
    >
      {value != null && value >= 9 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: `radial-gradient(circle, ${color} 0%, transparent 72%)`, opacity: 0.35 }}
        />
      )}
      <svg width={size} height={size} className="relative -rotate-90">
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
          className="rm-no-transition"
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
  const { surface } = useThemeControl();
  const color = scoreColor(value, surface);
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
        className="h-11 w-16 rounded-md border border-[var(--color-edge-strong)] bg-panel-2 px-2 text-right text-base font-bold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-gold sm:h-9 sm:w-14 sm:text-sm"
        style={{ color }}
        aria-label="Song score out of 10"
      />
      <span className="text-xs text-fg-faint">/10</span>
    </span>
  );
}

// Each status has two looks: `cls` for badges on a panel/surface (skin-aware —
// dark text on Paper, light on Midnight), and `onMediaCls` for badges layered
// over a dark cover-art hero (always light text, both skins).
const STATUS_META: Record<AlbumStatus, { label: string; cls: string; onMediaCls: string }> = {
  completed: {
    label: "✓ Completed",
    cls: "bg-emerald-500/15 text-[var(--color-status-done)] ring-emerald-500/30",
    onMediaCls: "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30",
  },
  listening: {
    label: "▶ Now Spinning",
    cls: "bg-gold/15 text-gold-soft ring-gold/30",
    onMediaCls: "bg-white/15 text-[#ffe082] ring-white/25",
  },
  want: {
    label: "☆ On the List",
    cls: "bg-fg/10 text-fg ring-fg/10",
    onMediaCls: "bg-white/15 text-zinc-100 ring-white/25",
  },
};

export function StatusBadge({ status, onMedia = false }: { status: AlbumStatus; onMedia?: boolean }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
        onMedia ? m.onMediaCls : m.cls
      }`}
    >
      {m.label}
    </span>
  );
}

/** Marks an artist as an already-heard "Library" pick rather than a marathon one.
 *  Pass `onMedia` when it sits over a dark cover-art hero. */
export function LoggedBadge({ className = "", onMedia = false }: { className?: string; onMedia?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
        onMedia
          ? "bg-violet-500/25 text-violet-200 ring-violet-400/30"
          : "bg-violet-500/15 text-[var(--color-status-lib)] ring-violet-500/30"
      } ${className}`}
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
      className={`sleeve-panel rounded-2xl border border-edge/70 bg-panel/80 backdrop-blur-sm ${className}`}
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
        className="w-full cursor-pointer appearance-none rounded-lg border border-[var(--color-edge-strong)] bg-panel-2 py-2 pl-3 pr-8 text-xs font-semibold text-fg outline-none transition-colors hover:border-gold/40 focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold"
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
