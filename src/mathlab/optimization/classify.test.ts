import { describe, it, expect } from "vitest";
import { classifyCritical } from "./classify.ts";
import { makeObjective } from "./objective.ts";

describe("classifyCritical — Hessian eigenvalue-sign test (§11)", () => {
  it("x²+y² at the origin → minimum (positive-definite)", () => {
    const c = classifyCritical(makeObjective(["x", "y"], "x^2 + y^2"), [0, 0]);
    expect(c.type).toBe("minimum");
    expect(c.eigenvalues).toEqual([2, 2]);
    expect(c.hessian).toEqual([[2, 0], [0, 2]]);
    expect(c.confidence).toBe("numerical");
  });

  it("-(x²+y²) at the origin → maximum (negative-definite)", () => {
    const c = classifyCritical(makeObjective(["x", "y"], "-(x^2 + y^2)"), [0, 0]);
    expect(c.type).toBe("maximum");
    expect(c.eigenvalues).toEqual([-2, -2]);
  });

  it("x²-y² at the origin → saddle (indefinite)", () => {
    const c = classifyCritical(makeObjective(["x", "y"], "x^2 - y^2"), [0, 0]);
    expect(c.type).toBe("saddle");
    expect(c.eigenvalues.slice().sort((a, b) => b - a)).toEqual([2, -2]);
  });

  it("asymmetric bowl 3x²+7y² → minimum, eigenvalues match diagonal Hessian", () => {
    const c = classifyCritical(makeObjective(["x", "y"], "3*x^2 + 7*y^2"), [0, 0]);
    expect(c.type).toBe("minimum");
    expect(c.hessian).toEqual([[6, 0], [0, 14]]);
    expect(c.eigenvalues.slice().sort((a, b) => a - b)).toEqual([6, 14]);
  });

  it("degenerate x²+y³ at the origin → inconclusive (a zero eigenvalue)", () => {
    const c = classifyCritical(makeObjective(["x", "y"], "x^2 + y^3"), [0, 0]);
    expect(c.type).toBe("inconclusive");
    expect(c.eigenvalues).toContain(0); // Hessian is [[2,0],[0,0]]
    expect(c.hessian).toEqual([[2, 0], [0, 0]]);
  });

  it("degenerate monkey-saddle-ish x²+y⁴ at the origin → inconclusive", () => {
    const c = classifyCritical(makeObjective(["x", "y"], "x^2 + y^4"), [0, 0]);
    expect(c.type).toBe("inconclusive");
    expect(c.hessian).toEqual([[2, 0], [0, 0]]);
  });

  it("1D x² at 0 → minimum", () => {
    const c = classifyCritical(makeObjective(["x"], "x^2"), [0]);
    expect(c.type).toBe("minimum");
    expect(c.eigenvalues).toEqual([2]);
  });

  it("1D -x² at 0 → maximum", () => {
    const c = classifyCritical(makeObjective(["x"], "-x^2"), [0]);
    expect(c.type).toBe("maximum");
    expect(c.eigenvalues).toEqual([-2]);
  });

  it("1D x³ at 0 → inconclusive (Hessian is zero there)", () => {
    const c = classifyCritical(makeObjective(["x"], "x^3"), [0]);
    expect(c.type).toBe("inconclusive");
    expect(c.hessian).toEqual([[0]]);
  });

  it("verdict is scale-invariant: 1e6·(x²+y²) is still a minimum", () => {
    const c = classifyCritical(makeObjective(["x", "y"], "1000000*(x^2 + y^2)"), [0, 0]);
    expect(c.type).toBe("minimum");
    expect(c.eigenvalues).toEqual([2000000, 2000000]);
  });
});
