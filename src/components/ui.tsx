import type { ReactNode } from "react";
import type { AlbumStatus } from "../types";

// ── The Dean Meter ──────────────────────────────────────────────
// A circular score gauge, IMDb-rating energy but Dean-branded.
export function DeanMeter({
  value,
  size = 56,
}: {
  value: number | null;
  size?: number;
}) {
  const pct = value == null ? 0 : value / 10;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color =
    value == null
      ? "#3a3a45"
      : value >= 9
        ? "#f5c518"
        : value >= 7
          ? "#7ee081"
          : value >= 5
            ? "#ffb84d"
            : "#ff5a3c";
  return (
    <div
      className="relative grid place-items-center shrink-0"
      style={{ width: size, height: size }}
      title={value == null ? "Unrated" : `Dean Meter: ${value.toFixed(1)}/10`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#26262e" strokeWidth={stroke} fill="none" />
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

// ── Star rating for individual songs ────────────────────────────
export function Stars({
  value,
  onChange,
  size = 18,
}: {
  value: number | null;
  onChange?: (v: number) => void;
  size?: number;
}) {
  return (
    <div className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={!onChange}
            onClick={() => onChange?.(value === n ? 0 : n)}
            className={onChange ? "cursor-pointer transition-transform hover:scale-125" : "cursor-default"}
            style={{ lineHeight: 0 }}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
          >
            <span style={{ fontSize: size, color: filled ? "#f5c518" : "#3a3a45" }}>★</span>
          </button>
        );
      })}
    </div>
  );
}

const STATUS_META: Record<AlbumStatus, { label: string; cls: string }> = {
  completed: { label: "✓ Completed", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  listening: { label: "▶ Now Spinning", cls: "bg-gold/15 text-gold-soft ring-gold/30" },
  want: { label: "☆ On the List", cls: "bg-white/5 text-zinc-400 ring-white/10" },
};

export function StatusBadge({ status }: { status: AlbumStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${m.cls}`}>
      {m.label}
    </span>
  );
}

export function ProgressBar({ pct, className = "" }: { pct: number; className?: string }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-white/8 ${className}`}>
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
      <h2 className="font-display text-2xl font-black tracking-tight text-white">{title}</h2>
    </div>
  );
}
