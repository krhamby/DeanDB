import { describe, it, expect } from "vitest";
import { legible, contrastRatio, darken, SKIN_SURFACE } from "./themes";
import { scoreColor } from "../components/ui";

const MIDNIGHT = SKIN_SURFACE.midnight; // "#15151a"
const PAPER = SKIN_SURFACE.paper;       // off-white

describe("contrast math", () => {
  it("clears 4.5:1 against the dark surface by lightening", () => {
    const out = legible("#3a2c00", MIDNIGHT); // very dark gold
    expect(contrastRatio(out, MIDNIGHT)).toBeGreaterThanOrEqual(4.5);
  });

  it("clears 4.5:1 against the light Paper surface by darkening", () => {
    const out = legible("#f5c518", PAPER); // bright gold is illegible on cream
    expect(contrastRatio(out, PAPER)).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves an already-legible color essentially unchanged", () => {
    const out = legible("#e9e9ee", MIDNIGHT);
    expect(out.toLowerCase()).toBe("#e9e9ee");
  });

  it("darken moves a color toward black", () => {
    expect(contrastRatio(darken("#ffffff", 0.5), "#ffffff")).toBeGreaterThan(1);
  });
});
describe("scoreColor legibility", () => {
  it("clamps the ramp legible on Paper", () => {
    for (const v of [9.5, 8, 6, 3]) {
      const c = scoreColor(v, SKIN_SURFACE.paper);
      expect(contrastRatio(c, SKIN_SURFACE.paper)).toBeGreaterThanOrEqual(4.4);
    }
  });
  it("keeps bright values when no surface is given (export)", () => {
    expect(scoreColor(9.5).toLowerCase()).toBe("#f5c518");
  });
});
