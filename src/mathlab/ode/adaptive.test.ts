import { describe, it, expect } from "vitest";
import { rkf45 } from "./adaptive.ts";
import { solveODE, ODE_METHODS } from "./registry.ts";
import { InvalidInputError } from "../core/errors.ts";
import type { ODEProblem, ODEResult } from "./types.ts";
import type { Vec } from "../linear/vector.ts";

const finalY = (r: ODEResult): Vec => r.y[r.y.length - 1];
const finalErr = (p: ODEProblem, opts: object, exact: Vec): number => {
  const got = finalY(rkf45.solve(p, opts));
  return Math.max(...got.map((yi, i) => Math.abs(yi - exact[i])));
};

const grow: ODEProblem = { f: (_t, y) => [y[0]], y0: [1], t0: 0, t1: 1 };
const decay: ODEProblem = { f: (_t, y) => [-y[0]], y0: [1], t0: 0, t1: 20 };
const harmonic: ODEProblem = { f: (_t, [y, v]) => [v, -y], y0: [1, 0], t0: 0, t1: 2 * Math.PI };
const logisticExact = (t: number, y0 = 0.1, r = 1) => y0 / (y0 + (1 - y0) * Math.exp(-r * t));
const logistic = (t1: number): ODEProblem => ({ f: (_t, y) => [y[0] * (1 - y[0])], y0: [0.1], t0: 0, t1 });

const dts = (r: ODEResult): number[] => r.t.slice(1).map((ti, i) => ti - r.t[i]);

describe("RKF45 — analytical cross-checks meet the requested tolerance", () => {
  it("y'=y ⇒ eᵗ: final error ≲ small multiple of tol", () => {
    const tol = 1e-8;
    expect(finalErr(grow, { absTol: tol, relTol: tol }, [Math.E])).toBeLessThan(1e3 * tol);
  });
  it("y'=-y ⇒ e^{-t}: final error ≲ tol scale", () => {
    const tol = 1e-8;
    expect(finalErr(decay, { absTol: tol, relTol: tol }, [Math.exp(-20)])).toBeLessThan(1e3 * tol);
  });
  it("harmonic returns to (1,0) after a full period", () => {
    const [y, v] = finalY(rkf45.solve(harmonic, { absTol: 1e-9, relTol: 1e-9 }));
    expect(y).toBeCloseTo(1, 6);
    expect(v).toBeCloseTo(0, 6);
  });
  it("logistic matches closed form at t=3", () => {
    expect(finalErr(logistic(3), { absTol: 1e-9, relTol: 1e-9 }, [logisticExact(3)])).toBeLessThan(1e-6);
  });
  it("logistic approaches carrying capacity 1", () => {
    expect(finalY(rkf45.solve(logistic(30), { absTol: 1e-8, relTol: 1e-8 }))[0]).toBeCloseTo(1, 6);
  });
});

describe("RKF45 — step bookkeeping", () => {
  it("accepted + rejected === steps, rejected ≥ 0", () => {
    const r = rkf45.solve(grow, { absTol: 1e-10, relTol: 1e-10 });
    expect(r.accepted! + r.rejected!).toBe(r.steps);
    expect(r.rejected!).toBeGreaterThanOrEqual(0);
  });
  it("errorEstimate is a finite non-negative number", () => {
    const r = rkf45.solve(grow, { absTol: 1e-8, relTol: 1e-8 });
    expect(Number.isFinite(r.errorEstimate!)).toBe(true);
    expect(r.errorEstimate!).toBeGreaterThanOrEqual(0);
  });
  it("tightening tolerance increases accepted steps AND reduces error", () => {
    const loose = rkf45.solve(grow, { absTol: 1e-6, relTol: 1e-6 });
    const tight = rkf45.solve(grow, { absTol: 1e-11, relTol: 1e-11 });
    expect(tight.accepted!).toBeGreaterThan(loose.accepted!);
    const eLoose = Math.abs(finalY(loose)[0] - Math.E);
    const eTight = Math.abs(finalY(tight)[0] - Math.E);
    expect(eTight).toBeLessThan(eLoose);
  });
  it("step sizes VARY over a decaying transient (min dt < max dt)", () => {
    const d = dts(rkf45.solve(decay, { absTol: 1e-8, relTol: 1e-8 }));
    const mn = Math.min(...d), mx = Math.max(...d);
    expect(mn).toBeLessThan(mx);
    // fast early transient ⇒ first step smaller than the last (relaxed) step
    expect(d[0]).toBeLessThan(d[d.length - 1]);
  });
});

describe("RKF45 — metadata, registry, guards", () => {
  it("self-describes: rkf45, order 5, adaptive, converged, reached-t1", () => {
    const r = rkf45.solve(grow, { absTol: 1e-8, relTol: 1e-8 });
    expect(r.method).toBe("rkf45");
    expect(r.order).toBe(5);
    expect(rkf45.adaptive).toBe(true);
    expect(r.converged).toBe(true);
    expect(r.termination).toBe("reached-t1");
    expect(r.t[0]).toBe(0);
    expect(r.t[r.t.length - 1]).toBeCloseTo(1, 10);
    expect(r.y.length).toBe(r.t.length);
  });
  it("registered and reachable via solveODE", () => {
    expect(ODE_METHODS["rkf45"]).toBe(rkf45);
    expect(finalY(solveODE("rkf45", grow, { absTol: 1e-9, relTol: 1e-9 }))[0]).toBeCloseTo(Math.E, 7);
  });
  it("non-finite guard: y'=y² blows up ⇒ termination 'non-finite', not converged", () => {
    const blow: ODEProblem = { f: (_t, y) => [y[0] * y[0]], y0: [1], t0: 0, t1: 5 };
    const r = rkf45.solve(blow, { absTol: 1e-6, relTol: 1e-6 });
    expect(r.termination).toBe("non-finite");
    expect(r.converged).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
    for (const yi of r.y) expect(Number.isFinite(yi[0])).toBe(true);
  });
  it("respects a small maxSteps ⇒ graceful 'max-steps', converged=false", () => {
    const r = rkf45.solve(grow, { absTol: 1e-13, relTol: 1e-13, maxSteps: 3 });
    expect(r.termination).toBe("max-steps");
    expect(r.converged).toBe(false);
    expect(r.steps).toBeLessThanOrEqual(3);
  });
  it("t1 <= t0 → InvalidInputError", () => {
    expect(() => rkf45.solve({ ...grow, t1: 0 })).toThrow(InvalidInputError);
  });
  it("non-finite y0 → InvalidInputError", () => {
    expect(() => rkf45.solve({ ...grow, y0: [Infinity] })).toThrow(InvalidInputError);
  });
  it("initial h <= 0 → InvalidInputError", () => {
    expect(() => rkf45.solve(grow, { h: -0.1 })).toThrow(InvalidInputError);
  });
  it("absTol/relTol <= 0 → InvalidInputError", () => {
    expect(() => rkf45.solve(grow, { absTol: 0 })).toThrow(InvalidInputError);
  });
});
