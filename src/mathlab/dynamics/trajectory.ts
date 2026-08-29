// Trajectory (orbit) simulation for a dynamical system.
//
//   continuous:  integrate dx/dt = field(x) with an ODE solver (ode/registry) over
//                [t0, t1]; the sample times/states come straight from the solver.
//   discrete:    iterate x(n+1) = field(x(n)) for `steps` steps; t = 0,1,2,…,steps.
//
// The field carries no explicit time (autonomous), so the ODE right-hand side ignores t
// and just returns field(y). Solver choice, step size and tolerances pass through to the
// ODE registry unchanged (opts is an ODEOptions superset).
import { InvalidInputError, ResourceLimitError } from "../core/errors.ts";
import { MAX_ODE_STEPS } from "../core/constants.ts";
import { solveODE } from "../ode/registry.ts";
import type { ODEOptions, ODEFn } from "../ode/types.ts";
import type { Vec } from "../linear/vector.ts";
import { evalField, type DynamicalSystem } from "./system.ts";

export interface SimulateOptions extends ODEOptions {
  /** Continuous: ODE method name from the registry. Default "rk4". */
  method?: string;
  /** Continuous: start time. Default 0. */
  t0?: number;
  /** Continuous: end time (required, must exceed t0). */
  t1?: number;
  /** Discrete: number of map iterations. Default 100. */
  steps?: number;
}

const DEFAULT_DISCRETE_STEPS = 100;

/**
 * Simulate the trajectory from initial state `x0`. Returns aligned `t`/`states`
 * (states[i] is the state at t[i]). Continuous runs delegate to the ODE registry
 * (default rk4); discrete runs iterate the map. Throws InvalidInputError on a bad
 * request and ResourceLimitError if a discrete run would exceed MAX_ODE_STEPS.
 */
export function simulate(
  sys: DynamicalSystem,
  x0: Vec,
  opts: SimulateOptions = {},
): { t: number[]; states: Vec[] } {
  if (x0.length !== sys.vars.length) {
    throw new InvalidInputError(`x0 has ${x0.length} coord(s), expected ${sys.vars.length}`);
  }

  if (sys.kind === "continuous") {
    const t0 = opts.t0 ?? 0;
    const { t1 } = opts;
    if (t1 === undefined) throw new InvalidInputError("continuous simulate requires opts.t1");
    const f: ODEFn = (_t, y) => evalField(sys, y);
    const res = solveODE(opts.method ?? "rk4", { f, y0: x0, t0, t1 }, opts);
    return { t: res.t, states: res.y };
  }

  // discrete: iterate the map, bounding the step count.
  const steps = opts.steps ?? DEFAULT_DISCRETE_STEPS;
  if (!Number.isInteger(steps) || steps < 1) {
    throw new InvalidInputError(`steps must be a positive integer (got ${steps})`);
  }
  if (steps > MAX_ODE_STEPS) {
    throw new ResourceLimitError(`requested ${steps} steps exceeds MAX_ODE_STEPS=${MAX_ODE_STEPS}`);
  }
  const t: number[] = [0];
  const states: Vec[] = [x0.slice()];
  let x = x0.slice();
  for (let n = 0; n < steps; n++) {
    x = evalField(sys, x);
    t.push(n + 1);
    states.push(x.slice());
  }
  return { t, states };
}
