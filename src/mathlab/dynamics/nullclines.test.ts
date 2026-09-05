import { describe, it, expect } from "vitest";
import { makeSystem } from "./system.ts";
import { nullclines } from "./nullclines.ts";

describe("nullclines", () => {
  it("returns empty for discrete systems (no nullcline notion)", () => {
    const sys = makeSystem(["x"], ["2*x"], {}, "discrete");
    const r = nullclines(sys);
    expect(r.xNullcline.samples.length).toBe(0);
    expect(r.yNullcline.samples.length).toBe(0);
  });

  it("rejects non-2-D systems", () => {
    const sys = makeSystem(["x"], ["-x"], {}, "continuous");
    expect(() => nullclines(sys)).toThrow(/2-D/);
  });

  it("finds x-nullcline samples along a horizontal line for ẋ = y - 1, ẏ = -x", () => {
    // f = y - 1; nullcline f=0 ⟺ y = 1. Multiple scan rows should bracket y=1.
    const sys = makeSystem(["x", "y"], ["y - 1", "-x"], {}, "continuous");
    const r = nullclines(sys, { xMin: -3, xMax: 3, yMin: -3, yMax: 3, rows: 24, cols: 40 });
    expect(r.xNullcline.samples.length).toBeGreaterThan(0);
    for (const s of r.xNullcline.samples) expect(Math.abs(s[1] - 1)).toBeLessThan(1e-3);
  });

  it("finds y-nullcline samples along a vertical line for ẋ = y, ẏ = x - 2", () => {
    // g = x - 2; nullcline g=0 ⟺ x = 2. Multiple scan columns should bracket x=2.
    const sys = makeSystem(["x", "y"], ["y", "x - 2"], {}, "continuous");
    const r = nullclines(sys, { xMin: -3, xMax: 3, yMin: -3, yMax: 3, rows: 40, cols: 24 });
    expect(r.yNullcline.samples.length).toBeGreaterThan(0);
    for (const s of r.yNullcline.samples) expect(Math.abs(s[0] - 2)).toBeLessThan(1e-3);
  });

  it("intersections of the two nullclines coincide with equilibrium candidates", () => {
    // Pendulum: ẋ = y, ẏ = -sin(x). x-nullcline: y=0. y-nullcline: sin(x)=0 → x = nπ.
    const sys = makeSystem(["x", "y"], ["y", "-sin(x)"], {}, "continuous");
    const r = nullclines(sys, { xMin: -4, xMax: 4, yMin: -4, yMax: 4, rows: 80, cols: 80 });
    // All xNullcline points near y=0; all yNullcline points near x=kπ.
    for (const s of r.xNullcline.samples) expect(Math.abs(s[1])).toBeLessThan(1e-3);
    for (const s of r.yNullcline.samples) {
      const k = s[0] / Math.PI;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(0.05);
    }
  });
});