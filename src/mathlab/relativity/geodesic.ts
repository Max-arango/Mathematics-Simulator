// Geodesic integration (Layer 2) — the equation of motion of GR.
//
//   d²x^μ/dτ² + Γ^μ_{αβ} (dx^α/dτ)(dx^β/dτ) = 0
//
// Written as a first-order system in the state y = [x^0..x^3, u^0..u^3] (length 8):
//
//   dx^μ/dτ = u^μ
//   du^μ/dτ = −Γ^μ_{αβ} u^α u^β
//
// integrated by the SHARED ODE registry (mathlab/ode, RK4) — no second integrator.
// The Christoffel symbols come from the generic geometry engine (metric.ts), so this
// works for ANY MetricModel. Leaving the valid chart (model.domain) or going
// non-finite halts the run and is reported, never silently continued (spec).
import { solveODE } from "../ode/registry.ts";
import { christoffelAt } from "./metric.ts";
import { DIM, type Coord, type MetricModel, type GeodesicResult } from "./types.ts";

/**
 * Integrate a geodesic from position x0 with 4-velocity u0 over affine parameter
 * [0, tauEnd] using `steps` fixed RK4 steps. Timelike u0 should satisfy
 * g_{μν}u^μu^ν = −1, null geodesics = 0 (see fourVelocityNorm) — but the integrator
 * does not enforce it; the norm is a conserved quantity you can check.
 */
export function geodesic(model: MetricModel, x0: Coord, u0: Coord, tauEnd: number, steps: number): GeodesicResult {
  const f = (_t: number, y: number[]): number[] => {
    const x = y.slice(0, DIM), u = y.slice(DIM, 2 * DIM);
    if (!model.domain(x).ok) return new Array<number>(2 * DIM).fill(NaN); // halt via the solver's non-finite guard
    const G = christoffelAt(model, x);
    const out = new Array<number>(2 * DIM);
    for (let m = 0; m < DIM; m++) out[m] = u[m];
    for (let m = 0; m < DIM; m++) {
      let s = 0;
      for (let a = 0; a < DIM; a++) for (let b = 0; b < DIM; b++) s += G[m][a][b] * u[a] * u[b];
      out[DIM + m] = -s;
    }
    return out;
  };

  const res = solveODE("rk4", { f, y0: [...x0, ...u0], t0: 0, t1: tauEnd }, { steps });

  // If the solver reached t1 it stayed in the (finite) chart the whole way. If it
  // stopped early, the RHS went non-finite — which for these models means the geodesic
  // ran into a coordinate boundary (horizon / pole): report "left-domain", not a bland
  // "reached-tau". An explicit in-loop domain hit refines this further.
  const x: Coord[] = [], u: Coord[] = [], cartesian: [number, number, number][] = [];
  let termination: GeodesicResult["termination"] = res.termination === "reached-t1" ? "reached-tau" : "left-domain";
  for (const y of res.y) {
    if (!y.every(Number.isFinite)) { termination = "non-finite"; break; }
    const xi = y.slice(0, DIM);
    if (!model.domain(xi).ok) { termination = "left-domain"; break; }
    x.push(xi);
    u.push(y.slice(DIM, 2 * DIM));
    cartesian.push(model.toCartesian(xi));
  }
  return { tau: res.t.slice(0, x.length), x, u, cartesian, termination, ok: termination === "reached-tau" };
}

/** g_{μν} u^μ u^ν — the conserved norm of the 4-velocity (−1 timelike, 0 null, +1 spacelike). */
export function fourVelocityNorm(model: MetricModel, x: Coord, u: Coord): number {
  const g = model.g(x);
  let s = 0;
  for (let a = 0; a < DIM; a++) for (let b = 0; b < DIM; b++) s += g[a][b] * u[a] * u[b];
  return s;
}
