import { describe, it, expect } from "vitest";
import { easeOutCubic } from "./useCountUp";

describe("easeOutCubic", () => {
  it("maps 0→0 and 1→1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it("is past-midpoint at t=0.5 (ease-OUT front-loads progress)", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
  it("is monotonic increasing", () => {
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const v = easeOutCubic(i / 10);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
