// Geodesic ODE: state = [x^0..x^3, u^0..u^3] (u = dx/dtau), 8-dim Vec — same
// packing pattern already proven in dynamics3d/mathField.ts::stepMathTrajectory3D
// (pack -> solveODE -> unpack, one step at a time so termination can be checked
// between steps, mirroring dynamics3d/mathField.ts::traceMathTrajectory3D). No new
// integrator: this reuses ode/registry.solveODE exclusively.
//   dx^mu/dtau = u^mu
//   du^mu/dtau = -Γ^mu_(alpha beta) u^alpha u^beta   (Einstein summation)
import type { Vec } from "../linear/vector.ts";
import type { ODEFn } from "../ode/types.ts";
import { solveODE } from "../ode/registry.ts";
import { hasValue } from "../core/result.ts";
import type { MetricModel } from "./metric.ts";
import { christoffelSymbols } from "./christoffel.ts";

export type GeodesicIntegrator = "euler" | "heun" | "rk2" | "rk4" | "rkf45";

/** Small, flat termination vocabulary mirroring dynamics3d/mathField.ts::Termination3D. */
export type GeodesicTermination = "completed" | "non-finite" | "invalid-region" | "metric-singular" | "max-steps";

export interface GeodesicState { tau: number; x: number[]; u: number[]; }

export interface GeodesicOptions {
  method?: GeodesicIntegrator;
  tau0?: number;
  tau1?: number;
  h?: number;
  maxSteps?: number;
  absTol?: number;
  relTol?: number;
}

export interface GeodesicResult {
  states: GeodesicState[];
  termination: GeodesicTermination;
}

const DEFAULT_H = 0.01;
const DEFAULT_MAX_STEPS = 10_000;

// Signals a singular/invalid metric mid-step so the driving loop below can turn
// it into an honest termination reason instead of an uncaught exception.
class MetricSingularAtPoint extends Error {}

function unpackState(y: Vec, n: number): { x: number[]; u: number[] } {
  return { x: y.slice(0, n), u: y.slice(n, 2 * n) };
}

function geodesicField(model: MetricModel, n: number): ODEFn {
  return (_tau, y) => {
    const { x, u } = unpackState(y, n);
    const gammaRes = christoffelSymbols(model, x);
    if (!hasValue(gammaRes)) {
      const reason = "reason" in gammaRes ? gammaRes.reason : undefined;
      throw new MetricSingularAtPoint(reason ?? "metric singular");
    }
    const gamma = gammaRes.value; // gamma[mu][alpha][beta] = Γ^mu_(alpha beta)
    const dudTau = new Array<number>(n).fill(0);
    for (let mu = 0; mu < n; mu++) {
      let s = 0;
      for (let alpha = 0; alpha < n; alpha++) {
        for (let beta = 0; beta < n; beta++) s += gamma[mu][alpha][beta] * u[alpha] * u[beta];
      }
      dudTau[mu] = -s;
    }
    return [...u, ...dudTau];
  };
}

/** Integrate a geodesic from (x0, u0) over the affine parameter tau. */
export function integrateGeodesic(model: MetricModel, x0: number[], u0: number[], opts: GeodesicOptions = {}): GeodesicResult {
  const n = model.coords.length;
  const method = opts.method ?? "rk4";
  const tau0 = opts.tau0 ?? 0;
  const tau1 = opts.tau1 ?? 10;
  const h = opts.h ?? DEFAULT_H;
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const f = geodesicField(model, n);

  const states: GeodesicState[] = [{ tau: tau0, x: x0.slice(), u: u0.slice() }];
  if (model.validRegion && !model.validRegion(x0)) return { states, termination: "invalid-region" };

  let tau = tau0;
  let y: Vec = [...x0, ...u0];
  let steps = 0;
  while (tau < tau1) {
    if (steps >= maxSteps) return { states, termination: "max-steps" };
    const hi = Math.min(h, tau1 - tau);

    let res;
    try {
      res = solveODE(method, { f, y0: y, t0: tau, t1: tau + hi }, { h: hi, steps: 1, absTol: opts.absTol, relTol: opts.relTol });
    } catch (e) {
      if (e instanceof MetricSingularAtPoint) return { states, termination: "metric-singular" };
      throw e;
    }
    steps++;

    const last = res.y[res.y.length - 1];
    if (res.termination === "non-finite" || !last.every(Number.isFinite)) {
      return { states, termination: "non-finite" };
    }
    y = last;
    tau = res.t[res.t.length - 1];
    const { x, u } = unpackState(y, n);
    states.push({ tau, x, u });
    if (model.validRegion && !model.validRegion(x)) return { states, termination: "invalid-region" };
  }
  return { states, termination: "completed" };
}
