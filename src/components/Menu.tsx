import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
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
 * outside-click, Escape, or scroll, and exposes `role="menu"`/`menuitem`
 * semantics. Built to keep dense toolbars (and mobile layouts) from overflowing.
 *
 * The open panel renders in a PORTAL to <body>, position:fixed at the trigger's
 * rect. This is load-bearing: `Panel` uses backdrop-blur, which creates a
 * stacking context, so an absolutely-positioned dropdown inside one can never
 * paint above later sibling panels no matter its z-index — it was clipping
 * behind page content (e.g. the Safety menu over a message thread).
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
  const [pos, setPos] = useState<{ top: number; left: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, left: r.left, right: window.innerWidth - r.right });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // The panel is fixed-positioned, so it would float away from its trigger on
    // scroll — close instead (capture: true also catches scrolling containers).
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-fg-muted hover:text-fg"
      >
        {label}
        <ChevronDown aria-hidden className="h-3 w-3 text-fg-faint" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={align === "right" ? { top: pos.top, right: pos.right } : { top: pos.top, left: pos.left }}
            className="fixed z-50 min-w-44 overflow-hidden rounded-xl border border-edge bg-panel-2 py-1 shadow-xl shadow-black/40"
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
          </div>,
          document.body,
        )}
    </div>
  );
}
