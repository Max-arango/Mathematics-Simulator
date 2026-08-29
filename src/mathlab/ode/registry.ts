// The ODE method registry — the single extension point. A new solver is added by
// implementing ODEMethod and dropping it into ODE_METHODS; callers select by name
// and read the self-describing result, so no caller changes when methods are added.
import { InvalidInputError } from "../core/errors.ts";
import { euler, heun, rk2, rk4 } from "./solvers.ts";
import { rkf45 } from "./adaptive.ts";
import type { ODEMethod, ODEProblem, ODEResult, ODEOptions } from "./types.ts";

export const ODE_METHODS: Record<string, ODEMethod> = {
  [euler.name]: euler,
  [heun.name]: heun,
  [rk2.name]: rk2,
  [rk4.name]: rk4,
  [rkf45.name]: rkf45,
};

/** Solve an IVP by method name. Throws InvalidInputError on an unknown name. */
export function solveODE(name: string, problem: ODEProblem, opts?: ODEOptions): ODEResult {
  const m = ODE_METHODS[name];
  if (!m) {
    throw new InvalidInputError(`unknown ODE method "${name}"; available: ${Object.keys(ODE_METHODS).join(", ")}`);
  }
  return m.solve(problem, opts);
}
