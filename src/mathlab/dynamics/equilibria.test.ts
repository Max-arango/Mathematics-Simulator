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

describe("findEquilibria: distinguishing non-convergence from genuine absence", () => {
  it("reports 'did not converge' (not silently 'no equilibria') when every seed hits a singular Jacobian", () => {
    // Constant nonzero field: g(x) = field(x) = 1 everywhere (never near zero,
    // so Newton actually iterates) but J = [[0]] is singular at every point,
    // so every seed's very first step fails. Before this fix, this returned
    // { points: [], note: NOTE } — indistinguishable from a system that
    // genuinely has no equilibria in the search region.
    const sys = makeSystem(["x"], ["1"], {}, "continuous");
    const { points, note } = findEquilibria(sys, { seeds: [[1], [2], [3]], tol: 1e-15 });
    expect(points.length).toBe(0);
    expect(note).toMatch(/3\/3 seeds did not converge/);
    expect(note).toMatch(/singular Jacobian/);
    // Still honest about being numerical, not a proof.
    expect(note).toMatch(/NUMERICAL CANDIDATES/);
  });

  it("reports the vacuous case distinctly when no seeds were even attempted", () => {
    const sys = makeSystem(["x"], ["x*(1-x)"], {}, "continuous");
    const { points, note } = findEquilibria(sys, { seeds: [] });
    expect(points.length).toBe(0);
    expect(note).toMatch(/no equilibria found in search region/);
    expect(note).not.toMatch(/did not converge/);
  });

  it("normal 'found some' case keeps the original note (no false failure noise)", () => {
    const sys = makeSystem(["x"], ["x*(1-x)"], {}, "continuous");
    const { points, note } = findEquilibria(sys);
    expect(points.length).toBeGreaterThan(0);
    expect(note).toBe(
      "NUMERICAL CANDIDATES: equilibria found by Newton iteration from a finite seed set. " +
        "This is not a proof of existence or completeness — roots outside the seeds' basins are " +
        "missed and near-degenerate (singular-Jacobian) roots are skipped. Widen the range, raise " +
        "gridPoints, or pass explicit seeds to search more of state space.",
    );
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
