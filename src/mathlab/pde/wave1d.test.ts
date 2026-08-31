import { describe, it, expect } from "vitest";
import { wave1d } from "./wave1d.ts";
import { NumericalInstabilityError, InvalidInputError } from "../core/errors.ts";
import type { Grid1D } from "./types.ts";

// Cross-validation against the ANALYTICAL standing wave (spec §69/§70). On [0,1] with
// u(x,0)=sin(πx), zero initial velocity, Dirichlet 0 ends and c=1, the exact solution
// is u(x,t)=cos(πt)·sin(πx): a mode oscillating with temporal period T=2.
const unit: Grid1D = { xMin: 0, xMax: 1, nx: 51 }; // dx = 0.02
const sinMode = (x: number) => Math.sin(Math.PI * x);
const maxAbs = (a: number[]) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
// dt=0.01 ⇒ Courant C = c·dt/dx = 0.5; 200 steps reach t = 2 = one full period.
const standing = () => wave1d({ grid: unit, c: 1, dt: 0.01, steps: 200, initial: sinMode, boundary: { left: 0, right: 0 } });

describe("wave1d — leapfrog vs analytical cos(πt)·sin(πx)", () => {
  it("returns near the initial profile after one period t=2 (within a few %)", () => {
    const r = standing();
    expect(r.t[200]).toBeCloseTo(2, 12);
    const back = r.u[200];
    const err = maxAbs(back.map((v, i) => v - sinMode(r.x[i])));
    expect(err).toBeLessThan(0.02); // dispersive phase drift only; ~2% ceiling
  });

  it("is inverted at the half period t=1 (u ≈ −sin(πx))", () => {
    const r = standing();
    const half = r.u[100];
    const err = maxAbs(half.map((v, i) => v + sinMode(r.x[i])));
    expect(err).toBeLessThan(0.02);
  });

  it("the midpoint traces cos(πt) through the oscillation", () => {
    const r = standing();
    const mid = r.x.indexOf(0.5) >= 0 ? r.x.indexOf(0.5) : 25;
    for (const n of [0, 50, 100, 150, 200]) {
      expect(r.u[n][mid]).toBeCloseTo(Math.cos(Math.PI * r.t[n]), 1); // 1 decimal ⇒ < 0.05
    }
  });

  it("carries the right result shape (method, stable, dimensions)", () => {
    const r = wave1d({ grid: unit, c: 1, dt: 0.01, steps: 10, initial: sinMode, boundary: { left: 0, right: 0 } });
    expect(r.method).toBe("leapfrog");
    expect(r.stable).toBe(true);
    expect(r.stabilityNumber).toBeCloseTo(0.5, 12);
    expect(r.u.length).toBe(11);
    expect(r.u.every((row) => row.length === 51)).toBe(true);
  });
});

describe("wave1d — stability discipline (spec §27, refuse above CFL C=1)", () => {
  it("throws NumericalInstabilityError when the Courant number > 1", () => {
    // c=1, dx=0.02, dt=0.03 ⇒ C = 1.5
    expect(() => wave1d({ grid: unit, c: 1, dt: 0.03, steps: 5, initial: sinMode, boundary: { left: 0, right: 0 } }))
      .toThrow(NumericalInstabilityError);
  });
  it("names the Courant number and the CFL limit in the message", () => {
    let msg = "";
    try {
      wave1d({ grid: unit, c: 1, dt: 0.03, steps: 5, initial: sinMode, boundary: { left: 0, right: 0 } });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg.toLowerCase()).toContain("cfl");
    expect(msg).toMatch(/C=/);
  });
  it("accepts exactly C = 1 (the dispersion-free 'magic' step)", () => {
    const r = wave1d({ grid: unit, c: 1, dt: 0.02, steps: 100, initial: sinMode, boundary: { left: 0, right: 0 } });
    expect(r.stabilityNumber).toBeCloseTo(1, 12);
    // at C=1 leapfrog is exact for this mode: round-trip error should be tiny.
    const back = r.u[100]; // t = 2
    expect(maxAbs(back.map((v, i) => v - sinMode(r.x[i])))).toBeLessThan(1e-6);
  });
});

describe("wave1d — boundaries and input validation", () => {
  it("holds Dirichlet boundary values fixed at every step", () => {
    const r = wave1d({ grid: unit, c: 1, dt: 0.01, steps: 40, initial: sinMode, boundary: { left: 2, right: -1 } });
    const last = r.x.length - 1;
    for (const row of r.u) {
      expect(row[0]).toBe(2);
      expect(row[last]).toBe(-1);
    }
  });
  it("rejects a non-positive wave speed", () => {
    expect(() => wave1d({ grid: unit, c: 0, dt: 0.01, steps: 5, initial: sinMode, boundary: { left: 0, right: 0 } }))
      .toThrow(InvalidInputError);
  });
});
