import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./sfx";

/** Standard ease-out cubic on [0,1]. */
export function easeOutCubic(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - c, 3);
}

/**
 * Animate a number from 0 up to `target` once on mount (and whenever `target`
 * changes), over `ms`. Returns `target` immediately when the user prefers
 * reduced motion, so the final value is always correct/accessible.
 */
export function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const raf = useRef<number | null>(null);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    start.current = null;
    const step = (ts: number) => {
      if (start.current === null) start.current = ts;
      const t = (ts - start.current) / ms;
      if (t >= 1) {
        setValue(target);
        return;
      }
      setValue(target * easeOutCubic(t));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, ms]);

  return value;
}
