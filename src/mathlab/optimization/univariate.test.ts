import { describe, it, expect } from "vitest";
import { goldenSection } from "./univariate.ts";
import { InvalidInputError } from "../core/errors.ts";

describe("goldenSection — minimizes a unimodal f on [a,b] (LOCAL)", () => {
  it("(x-2)^2 on [0,5] → x=2 (§69 known minimum)", () => {
    const r = goldenSection((x) => (x - 2) ** 2, 0, 5);
    expect(r.solution[0]).toBeCloseTo(2, 5);
    expect(r.objective).toBeCloseTo(0, 8);
    expect(r.converged).toBe(true);
    expect(r.termination).toBe("interval-tol");
  });

  it("shifted unimodal (x+3)^2 + 1 on [-10, 0] → x=-3, f=1", () => {
    const r = goldenSection((x) => (x + 3) ** 2 + 1, -10, 0);
    expect(r.solution[0]).toBeCloseTo(-3, 5);
    expect(r.objective).toBeCloseTo(1, 6);
  });

  it("non-quadratic unimodal x^4 on [-2, 2] → x=0", () => {
    const r = goldenSection((x) => x ** 4, -2, 2);
    expect(r.solution[0]).toBeCloseTo(0, 4);
  });

  it("reports metadata: iterations>0, length-1 solution, trajectory brackets the answer", () => {
    const r = goldenSection((x) => (x - 2) ** 2, 0, 5);
    expect(r.iterations).toBeGreaterThan(0);
    expect(r.solution).toHaveLength(1);
    expect(r.method).toBe("golden-section");
    expect(r.gradientNorm).toBeNaN(); // derivative-free
    expect(r.trajectory[0]).toEqual([2.5]); // midpoint of initial [0,5]
    expect(r.trajectory[r.trajectory.length - 1]).toEqual(r.solution);
  });

  it("throws InvalidInputError when a >= b", () => {
    expect(() => goldenSection((x) => x * x, 5, 0)).toThrow(InvalidInputError);
    expect(() => goldenSection((x) => x * x, 1, 1)).toThrow(InvalidInputError);
  });
});
