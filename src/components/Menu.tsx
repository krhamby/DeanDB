import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface MenuAction {
  label: ReactNode;
  onSelect: () => void;
  /** Greyed out and non-interactive (e.g. an in-flight action). */
  disabled?: boolean;
  /** Renders in the destructive (red) style — for Remove/Delete. */
  danger?: boolean;
  title?: string;
}

/**
 * A compact dropdown action menu. Collapses a growing row of secondary buttons
 * into one control — opens a small anchored panel under the trigger, closes on
 * outside-click or Escape, and exposes `role="menu"`/`menuitem` semantics.
 * Built to keep dense toolbars (and mobile layouts) from overflowing.
 */
export function Menu({
  label = "Actions",
  actions,
  align = "right",
  className = "",
}: {
  label?: ReactNode;
  actions: MenuAction[];
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-fg-muted hover:text-fg"
      >
        {label}
        <span aria-hidden className="text-[10px] text-fg-faint">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-1 min-w-44 overflow-hidden rounded-xl border border-edge bg-panel-2 py-1 shadow-xl shadow-black/40 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              title={a.title}
              onClick={() => {
                if (a.disabled) return;
                setOpen(false);
                a.onSelect();
              }}
              className={`block w-full px-3 py-2 text-left text-xs font-semibold transition-colors disabled:cursor-default disabled:opacity-40 ${
                a.danger
                  ? "text-dean hover:bg-dean/10"
                  : "text-fg-muted hover:bg-fg/5 hover:text-fg"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
