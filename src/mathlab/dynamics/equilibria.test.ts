import { describe, it, expect } from "vitest";
import { norm, sub, type Vec } from "../linear/vector.ts";
import { makeSystem, evalField } from "./system.ts";
import { findEquilibria } from "./equilibria.ts";

// Does `pts` contain a point within `tol` of `target`?
const has = (pts: Vec[], target: Vec, tol = 1e-4): boolean =>
  pts.some((p) => norm(sub(p, target)) < tol);

describe("findEquilibria (continuous)", () => {
  it("logistic field x*(1-x) → {0, 1}", () => {
    const sys = makeSystem(["x"], ["x*(1-x)"], {}, "continuous");
    const { points } = findEquilibria(sys);
    expect(has(points, [0])).toBe(true);
    expect(has(points, [1])).toBe(true);
    for (const p of points) expect(norm(evalField(sys, p))).toBeLessThan(1e-8);
  });

  it("linear field [-x, -2y] → single equilibrium at the origin", () => {
    const sys = makeSystem(["x", "y"], ["-x", "-2*y"], {}, "continuous");
    const { points } = findEquilibria(sys);
    expect(has(points, [0, 0])).toBe(true);
    expect(points.length).toBe(1);
  });

  it("pendulum [y, -sin(x)] → contains (0,0) and (pi,0)", () => {
    const sys = makeSystem(["x", "y"], ["y", "-sin(x)"], {}, "continuous");
    const { points } = findEquilibria(sys);
    expect(has(points, [0, 0])).toBe(true);
    expect(has(points, [Math.PI, 0])).toBe(true);
    for (const p of points) expect(norm(evalField(sys, p))).toBeLessThan(1e-8);
  });

  it("honest note flags the result as numerical candidates, not a proof", () => {
    const sys = makeSystem(["x"], ["x*(1-x)"], {}, "continuous");
    const { note } = findEquilibria(sys);
    expect(note).toMatch(/NUMERICAL CANDIDATES/);
    expect(note).toMatch(/not a proof/i);
  });

  it("explicit seeds steer Newton to the requested roots", () => {
    const sys = makeSystem(["x"], ["x*(1-x)"], {}, "continuous");
    const { points } = findEquilibria(sys, { seeds: [[0.4], [1.3]] });
    expect(has(points, [0])).toBe(true);
    expect(has(points, [1])).toBe(true);
  });
});

describe("findEquilibria (discrete)", () => {
  it("logistic map r*x*(1-x), r=2 → fixed points 0 and 0.5", () => {
    const sys = makeSystem(["x"], ["r*x*(1-x)"], { r: 2 }, "discrete");
    const { points } = findEquilibria(sys);
    expect(has(points, [0])).toBe(true);
    expect(has(points, [0.5])).toBe(true);
    // fixed point ⇒ residual f(x)-x ≈ 0
    for (const p of points) expect(norm(sub(evalField(sys, p), p))).toBeLessThan(1e-8);
  });
});
