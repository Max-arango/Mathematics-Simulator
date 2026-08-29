// Fixed-step explicit Runge–Kutta IVP solvers for systems dy/dt = f(t, y).
//
//   euler  — explicit (forward) Euler.        order 1, 1 f-eval/step.
//   heun   — explicit trapezoid (Heun).       order 2, 2 f-evals/step.
//   rk2    — explicit midpoint.               order 2, 2 f-evals/step.
//   rk4    — classic Runge–Kutta.             order 4, 4 f-evals/step.
//
// "order p" = global truncation error O(h^p): halving h shrinks the error by ~2^p
// (see solvers.test.ts, which verifies this against analytical solutions rather
// than hardcoded numbers). All four are EXPLICIT and therefore only conditionally
// stable — on STIFF problems the step is bounded by stability, not accuracy, and a
// too-large h blows up (the non-finite guard catches the overflow and stops). This
// subsystem does not implement implicit/stiff solvers; RKF45 (adaptive.ts) adapts
// the step but is still explicit and non-stiff. Use small h for stiff systems.
import { add, scale, type Vec } from "../linear/vector.ts";
import { MAX_ODE_STEPS } from "../core/constants.ts";
import { InvalidInputError, ResourceLimitError } from "../core/errors.ts";
import type { ODEMethod, ODEProblem, ODEResult, ODEOptions } from "./types.ts";

const DEFAULT_STEPS = 100;

const allFinite = (v: Vec): boolean => v.every(Number.isFinite);

/** A single explicit step: given (t, y, h) return the next state. */
type Stepper = (f: ODEProblem["f"], t: number, y: Vec, h: number) => Vec;

const eulerStep: Stepper = (f, t, y, h) => add(y, scale(f(t, y), h));

const heunStep: Stepper = (f, t, y, h) => {
  const k1 = f(t, y);
  const k2 = f(t + h, add(y, scale(k1, h)));
  return add(y, scale(add(k1, k2), h / 2));
};

const midpointStep: Stepper = (f, t, y, h) => {
  const k1 = f(t, y);
  const k2 = f(t + h / 2, add(y, scale(k1, h / 2)));
  return add(y, scale(k2, h));
};

const rk4Step: Stepper = (f, t, y, h) => {
  const k1 = f(t, y);
  const k2 = f(t + h / 2, add(y, scale(k1, h / 2)));
  const k3 = f(t + h / 2, add(y, scale(k2, h / 2)));
  const k4 = f(t + h, add(y, scale(k3, h)));
  // y + h/6 (k1 + 2k2 + 2k3 + k4)
  const sum = add(add(k1, k4), scale(add(k2, k3), 2));
  return add(y, scale(sum, h / 6));
};

// Validate the problem and resolve the uniform step count. Fixed-step methods know
// N up front, so a REQUESTED count above MAX_ODE_STEPS is rejected as bad input.
function resolve(p: ODEProblem, o: ODEOptions): { N: number; cap: number } {
  const { y0, t0, t1 } = p;
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) throw new InvalidInputError("t0/t1 must be finite");
  if (t1 <= t0) throw new InvalidInputError(`t1 must exceed t0 (got t0=${t0}, t1=${t1})`);
  if (y0.length === 0) throw new InvalidInputError("y0 must be non-empty");
  if (!allFinite(y0)) throw new InvalidInputError("y0 must be finite");

  const span = t1 - t0;
  let N: number;
  if (o.h !== undefined) {
    if (!(o.h > 0) || !Number.isFinite(o.h)) throw new InvalidInputError(`h must be > 0 (got ${o.h})`);
    N = Math.max(1, Math.ceil(span / o.h));
  } else if (o.steps !== undefined) {
    if (!Number.isInteger(o.steps) || o.steps < 1) throw new InvalidInputError(`steps must be a positive integer (got ${o.steps})`);
    N = o.steps;
  } else {
    N = DEFAULT_STEPS;
  }
  if (N > MAX_ODE_STEPS) throw new ResourceLimitError(`requested ${N} steps exceeds MAX_ODE_STEPS=${MAX_ODE_STEPS}`);

  const cap = Math.min(o.maxSteps ?? MAX_ODE_STEPS, MAX_ODE_STEPS);
  return { N, cap };
}

// Drive `step` uniformly over [t0,t1]. Uniform h = span/N; the final step is snapped
// so the last sample lands exactly on t1 (avoids float drift on the endpoint).
function driver(name: string, order: number, step: Stepper, p: ODEProblem, o: ODEOptions = {}): ODEResult {
  const { N, cap } = resolve(p, o);
  const { f, y0, t0, t1 } = p;
  const h = (t1 - t0) / N;
  const warnings: string[] = [];

  const t: number[] = [t0];
  const y: Vec[] = [y0.slice()];
  let cur = y0.slice();
  let taken = 0;
  let termination: ODEResult["termination"] = "reached-t1";

  for (let i = 0; i < N; i++) {
    if (taken >= cap) {
      termination = "max-steps";
      warnings.push(`hit step cap ${cap} before reaching t1`);
      break;
    }
    const ti = t0 + i * h;
    const hi = i === N - 1 ? t1 - ti : h; // snap final step to t1
    const next = step(f, ti, cur, hi);
    taken++;
    if (!allFinite(next)) {
      termination = "non-finite";
      warnings.push(`state became non-finite at t≈${ti + hi}; stopped (result is not trustworthy past here)`);
      break;
    }
    cur = next;
    t.push(i === N - 1 ? t1 : ti + hi);
    y.push(cur);
  }

  return {
    t, y, steps: taken, method: name, order,
    converged: termination === "reached-t1",
    warnings, termination,
  };
}

const method = (name: string, order: number, step: Stepper, description: string): ODEMethod => ({
  name, order, adaptive: false, description,
  solve: (p, o) => driver(name, order, step, p, o),
});

export const euler = method("euler", 1, eulerStep, "Explicit (forward) Euler, order 1.");
export const heun = method("heun", 2, heunStep, "Explicit trapezoid (Heun), order 2.");
export const rk2 = method("rk2", 2, midpointStep, "Explicit midpoint (RK2), order 2.");
export const rk4 = method("rk4", 4, rk4Step, "Classic Runge–Kutta (RK4), order 4.");
