import { describe, it, expect } from "vitest";
import { heat1d } from "./heat1d.ts";
import { NumericalInstabilityError, InvalidInputError, ResourceLimitError } from "../core/errors.ts";
import type { Grid1D } from "./types.ts";

// Cross-validation against the ANALYTICAL solution (spec §69/§70), never against
// hardcoded solver output. On [0,1] with u(x,0)=sin(πx), Dirichlet 0 ends and α=1,
// the exact solution is u(x,t)=e^{−π²t}·sin(πx) (a single decaying Fourier mode).
const unit: Grid1D = { xMin: 0, xMax: 1, nx: 21 }; // dx = 0.05
const sinMode = (x: number) => Math.sin(Math.PI * x);
const exact = (x: number, t: number) => Math.exp(-Math.PI * Math.PI * t) * Math.sin(Math.PI * x);
const maxAbs = (a: number[]) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe("heat1d — FTCS vs analytical e^{−π²t}·sin(πx)", () => {
  it("matches the analytical profile to < 1% of peak at t=0.1 (r=0.4)", () => {
    const r = heat1d({ grid: unit, alpha: 1, dt: 0.001, steps: 100, initial: sinMode, boundary: { left: 0, right: 0 } });
    expect(r.stabilityNumber).toBeCloseTo(0.4, 12);
    const tEnd = r.t[r.t.length - 1];
    expect(tEnd).toBeCloseTo(0.1, 12);
    const num = r.u[r.u.length - 1];
    const err = maxAbs(num.map((v, i) => v - exact(r.x[i], tEnd)));
    // peak analytical value at tEnd is e^{−π²·0.1}·1 ≈ 0.373; assert error well under 1% of it.
    expect(err).toBeLessThan(3e-3);
  });

  it("carries the right result shape (method, stable, dimensions)", () => {
    const r = heat1d({ grid: unit, alpha: 1, dt: 0.001, steps: 10, initial: sinMode, boundary: { left: 0, right: 0 } });
    expect(r.method).toBe("FTCS");
    expect(r.stable).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.u.length).toBe(11); // steps + 1 rows
    expect(r.t.length).toBe(11);
    expect(r.x.length).toBe(21);
    expect(r.u.every((row) => row.length === 21)).toBe(true);
  });
});

describe("heat1d — stability discipline (spec §27, refuse above r=1/2)", () => {
  it("throws NumericalInstabilityError when r > 0.5 (r=0.6)", () => {
    // dt = 0.6·dx²/α = 0.6·0.05²/1 = 0.0015 ⇒ r = 0.6
    expect(() => heat1d({ grid: unit, alpha: 1, dt: 0.0015, steps: 5, initial: sinMode, boundary: { left: 0, right: 0 } }))
      .toThrow(NumericalInstabilityError);
  });

  it("names r and the 0.5 limit in the instability message", () => {
    let msg = "";
    try {
      heat1d({ grid: unit, alpha: 1, dt: 0.0015, steps: 5, initial: sinMode, boundary: { left: 0, right: 0 } });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/0\.5/);
    expect(msg.toLowerCase()).toContain("r=");
  });

  it("accepts exactly r = 0.5 (the stability boundary is allowed)", () => {
    // dt = 0.5·dx²/α = 0.00125 ⇒ r = 0.5 exactly
    const r = heat1d({ grid: unit, alpha: 1, dt: 0.00125, steps: 5, initial: sinMode, boundary: { left: 0, right: 0 } });
    expect(r.stabilityNumber).toBeCloseTo(0.5, 12);
  });
});

describe("heat1d — physical behaviour", () => {
  it("a hot bar with cold Dirichlet ends cools monotonically (max never rises)", () => {
    const r = heat1d({ grid: unit, alpha: 1, dt: 0.001, steps: 60, initial: () => 100, boundary: { left: 0, right: 0 } });
    const rowMax = r.u.map(maxAbs);
    for (let n = 1; n < rowMax.length; n++) expect(rowMax[n]).toBeLessThanOrEqual(rowMax[n - 1] + 1e-9);
    expect(rowMax[rowMax.length - 1]).toBeLessThan(rowMax[0]); // strictly cooled overall
  });

  it("holds Dirichlet boundary values fixed at every step", () => {
    const r = heat1d({ grid: unit, alpha: 1, dt: 0.001, steps: 40, initial: () => 50, boundary: { left: 3, right: 7 } });
    const last = r.x.length - 1;
    for (const row of r.u) {
      expect(row[0]).toBe(3);
      expect(row[last]).toBe(7);
    }
  });
});

describe("heat1d — input validation", () => {
  it("rejects non-positive dt", () => {
    expect(() => heat1d({ grid: unit, alpha: 1, dt: 0, steps: 5, initial: sinMode, boundary: { left: 0, right: 0 } }))
      .toThrow(InvalidInputError);
  });
  it("rejects a non-integer / non-positive step count", () => {
    expect(() => heat1d({ grid: unit, alpha: 1, dt: 0.001, steps: 0, initial: sinMode, boundary: { left: 0, right: 0 } }))
      .toThrow(InvalidInputError);
  });
  it("rejects a grid coarser than 3 points", () => {
    expect(() => heat1d({ grid: { xMin: 0, xMax: 1, nx: 2 }, alpha: 1, dt: 0.001, steps: 5, initial: sinMode, boundary: { left: 0, right: 0 } }))
      .toThrow(InvalidInputError);
  });
  it("rejects a space-time grid that would blow the memory budget", () => {
    // nx=2048 (=MAX_GRID) × many steps ⇒ cells > MAX_CELLS
    expect(() => heat1d({ grid: { xMin: 0, xMax: 1, nx: 2048 }, alpha: 1, dt: 1e-9, steps: 3000, initial: sinMode, boundary: { left: 0, right: 0 } }))
      .toThrow(ResourceLimitError);
  });
});
