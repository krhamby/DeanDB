import { describe, it, expect } from "vitest";
import { tick, landChime, haptic, prefersReducedMotion } from "./sfx";

// Vitest default env is node: no AudioContext, no window.matchMedia, no
// navigator.vibrate. Every function must be a safe no-op there.
describe("sfx", () => {
  it("tick() does not throw without Web Audio", () => {
    expect(() => tick()).not.toThrow();
  });
  it("landChime() does not throw without Web Audio", () => {
    expect(() => landChime()).not.toThrow();
  });
  it("haptic() does not throw without navigator.vibrate", () => {
    expect(() => haptic()).not.toThrow();
    expect(() => haptic([10, 20, 10])).not.toThrow();
  });
  it("prefersReducedMotion() returns a boolean", () => {
    expect(typeof prefersReducedMotion()).toBe("boolean");
  });
});
