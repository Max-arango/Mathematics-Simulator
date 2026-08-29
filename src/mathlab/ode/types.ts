// ODE initial-value-problem (IVP) types. The subsystem solves systems
//   dy/dt = f(t, y),  y(t0) = y0
// where y is a state VECTOR (a scalar ODE is just a length-1 Vec). Every solver
// returns the same ODEResult shape and self-describes via ODEMethod, so adding a
// new method (fixed or adaptive) never forces callers to change: they look a name
// up in the registry and read `method/order/adaptive/converged/warnings` off the
// result (result-shape spirit of core/result.ts §66). See solvers.ts (fixed-step),
// adaptive.ts (RKF45) and registry.ts (the name→method extension point).
import type { Vec } from "../linear/vector.ts";

/** Right-hand side of the IVP. Returns dy/dt at (t, y); output length must equal y. */
export type ODEFn = (t: number, y: Vec) => Vec;

export interface ODEProblem {
  f: ODEFn;
  y0: Vec;   // initial state; scalar ODE ⇒ length-1
  t0: number;
  t1: number; // integrate forward over [t0, t1]; t1 > t0 required
}

export interface ODEOptions {
  h?: number;       // fixed-step size (fixed-step solvers) / initial step (adaptive)
  steps?: number;   // fixed-step: number of uniform steps over [t0,t1] (used if h omitted)
  maxSteps?: number; // per-run cap; clamped to MAX_ODE_STEPS
  absTol?: number;  // adaptive: absolute error tolerance (default ABS_TOL)
  relTol?: number;  // adaptive: relative error tolerance (default REL_TOL)
}

export interface ODEResult {
  t: number[];      // sample times, t[0] === t0, t[last] ≈ t1 on success
  y: Vec[];         // aligned states: y[i] is the state at t[i]
  steps: number;    // total steps taken (adaptive: accepted + rejected)
  accepted?: number; // adaptive only
  rejected?: number; // adaptive only
  errorEstimate?: number; // adaptive: max estimated local error over the run
  method: string;
  order: number;
  converged: boolean; // reached t1 with finite state
  warnings: string[];
  termination: "reached-t1" | "max-steps" | "non-finite" | string;
}

export interface ODEMethod {
  name: string;
  order: number;
  adaptive: boolean;
  description: string;
  solve: (p: ODEProblem, o?: ODEOptions) => ODEResult;
}
