import { describe, it, expect } from "vitest";
import { simpson } from "./integrate.ts";

describe("simpson", () => {
  it("∫₀^π sin = 2", () => expect(simpson(Math.sin, 0, Math.PI)).toBeCloseTo(2, 8));
  it("∫₀^1 x² = 1/3", () => expect(simpson((x) => x * x, 0, 1)).toBeCloseTo(1 / 3, 10));
  it("is signed / reversed bounds negate", () => {
    expect(simpson((x) => x * x, 1, 0)).toBeCloseTo(-1 / 3, 10);
  });
  it("zero-width interval is 0", () => expect(simpson(Math.exp, 2, 2)).toBe(0));
  it("NaN when the integrand blows up inside", () => {
    expect(Number.isNaN(simpson((x) => 1 / x, -1, 1))).toBe(true);
  });
});
