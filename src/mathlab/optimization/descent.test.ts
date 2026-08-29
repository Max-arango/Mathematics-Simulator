import { describe, it, expect } from "vitest";
import { gradientDescent, newton } from "./descent.ts";
import { makeObjective } from "./objective.ts";
import { norm, sub, distance } from "../linear/vector.ts";

const bowl = makeObjective(["x", "y"], "x^2 + y^2");
// Rosenbrock: global min at (1,1), f=0; a narrow curved valley (classic hard case).
const rosen = makeObjective(["x", "y"], "(1 - x)^2 + 100*(y - x^2)^2");
const quad = makeObjective(["x", "y"], "(x - 3)^2 + 2*(y + 1)^2"); // min at (3,-1)

describe("gradientDescent — steepest descent to a LOCAL minimum", () => {
  it("bowl x²+y² from (3,4) → (0,0), gradientNorm≈0, converged", () => {
    const r = gradientDescent(bowl, [3, 4]);
    expect(r.converged).toBe(true);
    expect(r.termination).toBe("gradient-tol");
    expect(r.solution[0]).toBeCloseTo(0, 8);
    expect(r.solution[1]).toBeCloseTo(0, 8);
    expect(r.gradientNorm).toBeLessThan(1e-8);
  });

  it("metadata: trajectory[0]==x0, trajectory[last]==solution, method set", () => {
    const r = gradientDescent(bowl, [3, 4]);
    expect(r.trajectory[0]).toEqual([3, 4]);
    expect(r.trajectory[r.trajectory.length - 1]).toEqual(r.solution);
    expect(r.method).toBe("gradient-descent");
    expect(typeof r.termination).toBe("string");
  });
});

describe("newton — damped Newton to a LOCAL minimum", () => {
  it("on a quadratic converges to the exact minimum in very few iterations", () => {
    const r = newton(quad, [-5, 5]);
    expect(r.converged).toBe(true);
    expect(r.solution[0]).toBeCloseTo(3, 8);
    expect(r.solution[1]).toBeCloseTo(-1, 8);
    expect(r.iterations).toBeLessThanOrEqual(3); // full Newton step is exact on a quadratic
  });

  it("on ROSENBROCK from (-1.2, 1) reaches (1,1) to ≤ 1e-3", () => {
    const r = newton(rosen, [-1.2, 1]);
    expect(r.converged).toBe(true);
    expect(distance(r.solution, [1, 1])).toBeLessThanOrEqual(1e-3);
  });
});

describe("gradient descent vs Newton on Rosenbrock — honest about GD's slowness", () => {
  it("GD strictly decreases f and ends closer than it started (but need NOT reach (1,1))", () => {
    const x0: number[] = [-1.2, 1];
    const f0 = 24.2; // (1-(-1.2))² + 100(1-1.44)²
    const r = gradientDescent(rosen, x0);
    expect(r.objective).toBeLessThan(f0);                 // strictly decreased
    expect(r.objective).toBeLessThan(f0 / 10);            // by an order of magnitude+
    expect(distance(r.solution, [1, 1]))
      .toBeLessThan(distance(x0, [1, 1]));                // closer than the start
  });
});

describe("cross-validation (§70): Newton and gradient descent find the SAME minimum", () => {
  it("both reach (0,0) on the bowl, agreeing to 1e-4", () => {
    const g = gradientDescent(bowl, [2, -3]);
    const n = newton(bowl, [2, -3]);
    expect(norm(sub(g.solution, n.solution))).toBeLessThan(1e-4);
    expect(norm(g.solution)).toBeLessThan(1e-4);
    expect(norm(n.solution)).toBeLessThan(1e-4);
  });
});
