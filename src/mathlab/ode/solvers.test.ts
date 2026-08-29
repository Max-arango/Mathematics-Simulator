import { describe, it, expect } from "vitest";
import { euler, heun, rk2, rk4 } from "./solvers.ts";
import { solveODE, ODE_METHODS } from "./registry.ts";
import { InvalidInputError, ResourceLimitError } from "../core/errors.ts";
import type { ODEMethod, ODEProblem } from "./types.ts";
import type { Vec } from "../linear/vector.ts";

// Cross-validation against ANALYTICAL solutions (never hardcoded solver output).
const finalY = (r: { y: Vec[] }): Vec => r.y[r.y.length - 1];
const finalErr = (m: ODEMethod, p: ODEProblem, opts: object, exact: Vec): number => {
  const got = finalY(m.solve(p, opts));
  return Math.max(...got.map((yi, i) => Math.abs(yi - exact[i])));
};

// y' = y, y(0)=1  ⇒  y(t) = e^t
const grow: ODEProblem = { f: (_t, y) => [y[0]], y0: [1], t0: 0, t1: 1 };
// y' = -y, y(0)=1 ⇒  y(t) = e^{-t}
const decay: ODEProblem = { f: (_t, y) => [-y[0]], y0: [1], t0: 0, t1: 1 };
// [y,v]' = [v,-y], (1,0) ⇒ (cos t, -sin t)   (harmonic oscillator)
const harmonic: ODEProblem = { f: (_t, [y, v]) => [v, -y], y0: [1, 0], t0: 0, t1: 2 * Math.PI };
// logistic y' = r y(1-y), r=1, y0=0.1  ⇒  y(t) = y0 / (y0 + (1-y0) e^{-r t})
const logisticExact = (t: number, y0 = 0.1, r = 1) => y0 / (y0 + (1 - y0) * Math.exp(-r * t));
const logistic = (t1: number): ODEProblem => ({ f: (_t, y) => [y[0] * (1 - y[0])], y0: [0.1], t0: 0, t1 });

describe("fixed-step ODE solvers — exponential y'=y ⇒ eᵗ", () => {
  it("RK4 error at t=1 is < 1e-6", () => {
    expect(finalErr(rk4, grow, { steps: 100 }, [Math.E])).toBeLessThan(1e-6);
  });
  it("Euler is far LESS accurate than RK4 at equal steps", () => {
    const e = finalErr(euler, grow, { steps: 100 }, [Math.E]);
    const r = finalErr(rk4, grow, { steps: 100 }, [Math.E]);
    expect(e).toBeGreaterThan(1e-3);     // Euler error visibly large
    expect(e).toBeGreaterThan(r * 1000); // RK4 orders of magnitude better
  });
  it("Heun (order 2) beats Euler, loses to RK4", () => {
    const e = finalErr(euler, grow, { steps: 100 }, [Math.E]);
    const h = finalErr(heun, grow, { steps: 100 }, [Math.E]);
    const r = finalErr(rk4, grow, { steps: 100 }, [Math.E]);
    expect(h).toBeLessThan(e);
    expect(r).toBeLessThan(h);
  });
});

describe("fixed-step ODE solvers — decay y'=-y ⇒ e^{-t}", () => {
  it("RK4 final ≈ e^{-1}", () => {
    expect(finalY(rk4.solve(decay, { steps: 100 }))[0]).toBeCloseTo(Math.exp(-1), 8);
  });
  it("state stays positive and decreasing (cooling sanity)", () => {
    const { y } = rk4.solve(decay, { steps: 50 });
    for (let i = 1; i < y.length; i++) {
      expect(y[i][0]).toBeLessThan(y[i - 1][0]);
      expect(y[i][0]).toBeGreaterThan(0);
    }
  });
});

describe("fixed-step ODE solvers — harmonic oscillator system", () => {
  const r = rk4.solve(harmonic, { steps: 4000 });
  const at = (t: number): Vec => {
    const i = r.t.findIndex((ti) => ti >= t - 1e-9);
    return r.y[i];
  };
  it("y(π/2) ≈ (cos, -sin) = (0, -1)", () => {
    const [y, v] = at(Math.PI / 2);
    expect(y).toBeCloseTo(0, 5);
    expect(v).toBeCloseTo(-1, 5);
  });
  it("y(π) ≈ (-1, 0)", () => {
    const [y, v] = at(Math.PI);
    expect(y).toBeCloseTo(-1, 5);
    expect(v).toBeCloseTo(0, 5);
  });
  it("returns to (1,0) after a full period 2π", () => {
    const [y, v] = finalY(r);
    expect(y).toBeCloseTo(1, 4);
    expect(v).toBeCloseTo(0, 4);
  });
  it("ENERGY y²+v² stays ≈ 1 across the whole run (conservation)", () => {
    for (const [y, v] of r.y) expect(y * y + v * v).toBeCloseTo(1, 4);
  });
});

describe("fixed-step ODE solvers — logistic growth", () => {
  it("approaches carrying capacity 1", () => {
    expect(finalY(rk4.solve(logistic(20), { steps: 2000 }))[0]).toBeCloseTo(1, 6);
  });
  it("matches closed form at t=1", () => {
    expect(finalY(rk4.solve(logistic(1), { steps: 100 }))[0]).toBeCloseTo(logisticExact(1), 8);
  });
  it("matches closed form at t=3", () => {
    expect(finalY(rk4.solve(logistic(3), { steps: 300 }))[0]).toBeCloseTo(logisticExact(3), 8);
  });
});

describe("convergence ORDER — halving h shrinks error by ≈ 2^order", () => {
  const ratio = (m: ODEMethod, n: number): number =>
    finalErr(m, grow, { steps: n }, [Math.E]) / finalErr(m, grow, { steps: 2 * n }, [Math.E]);
  it("RK4 error ratio ≈ 16 (band [8,32])", () => {
    const q = ratio(rk4, 10);
    expect(q).toBeGreaterThanOrEqual(8);
    expect(q).toBeLessThanOrEqual(32);
  });
  it("Euler error ratio ≈ 2 (band [1.5,3])", () => {
    const q = ratio(euler, 100);
    expect(q).toBeGreaterThanOrEqual(1.5);
    expect(q).toBeLessThanOrEqual(3);
  });
  it("Heun/RK2 (order 2) error ratio ≈ 4 (band [3,5])", () => {
    for (const m of [heun, rk2]) {
      const q = ratio(m, 40);
      expect(q).toBeGreaterThanOrEqual(3);
      expect(q).toBeLessThanOrEqual(5);
    }
  });
});

describe("result metadata", () => {
  it("t[0]=t0 and last t ≈ t1", () => {
    const r = rk4.solve(grow, { steps: 10 });
    expect(r.t[0]).toBe(0);
    expect(r.t[r.t.length - 1]).toBeCloseTo(1, 12);
  });
  it("steps option yields steps+1 aligned samples", () => {
    const r = rk4.solve(grow, { steps: 10 });
    expect(r.t.length).toBe(11);
    expect(r.y.length).toBe(r.t.length);
    expect(r.steps).toBe(10);
  });
  it("h option lands exactly on t1", () => {
    const r = rk4.solve(grow, { h: 0.03 }); // 1/0.03 is not integer
    expect(r.t[r.t.length - 1]).toBeCloseTo(1, 12);
  });
  it("reports correct method/order and converges on a clean run", () => {
    for (const m of [euler, heun, rk2, rk4]) {
      const r = m.solve(grow, { steps: 10 });
      expect(r.method).toBe(m.name);
      expect(r.order).toBe(m.order);
      expect(r.converged).toBe(true);
      expect(r.termination).toBe("reached-t1");
      expect(r.steps).toBeGreaterThan(0);
    }
  });
});

describe("non-finite guard — y'=y² blows up (pole)", () => {
  it("stops with termination 'non-finite', converged=false, warning", () => {
    const blow: ODEProblem = { f: (_t, y) => [y[0] * y[0]], y0: [1], t0: 0, t1: 5 };
    const r = euler.solve(blow, { steps: 50 });
    expect(r.termination).toBe("non-finite");
    expect(r.converged).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
    // no NaN/Inf emitted as a "truth" sample
    for (const yi of r.y) expect(Number.isFinite(yi[0])).toBe(true);
  });
});

describe("registry + input validation", () => {
  it("solveODE dispatches by name", () => {
    expect(finalY(solveODE("rk4", grow, { steps: 100 }))[0]).toBeCloseTo(Math.E, 6);
  });
  it("registry exposes the four fixed methods", () => {
    expect(Object.keys(ODE_METHODS).sort()).toEqual(["euler", "heun", "rk2", "rk4"]);
  });
  it("unknown method name → InvalidInputError", () => {
    expect(() => solveODE("nope", grow, { steps: 10 })).toThrow(InvalidInputError);
  });
  it("h <= 0 → InvalidInputError", () => {
    expect(() => rk4.solve(grow, { h: 0 })).toThrow(InvalidInputError);
    expect(() => rk4.solve(grow, { h: -1 })).toThrow(InvalidInputError);
  });
  it("t1 <= t0 → InvalidInputError", () => {
    expect(() => rk4.solve({ ...grow, t1: 0 }, { steps: 10 })).toThrow(InvalidInputError);
  });
  it("non-finite y0 → InvalidInputError", () => {
    expect(() => rk4.solve({ ...grow, y0: [NaN] }, { steps: 10 })).toThrow(InvalidInputError);
  });
  it("requesting > MAX_ODE_STEPS up front → ResourceLimitError", () => {
    expect(() => rk4.solve(grow, { h: 1e-9 })).toThrow(ResourceLimitError);
  });
});
