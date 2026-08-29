// The optimization method registry — the self-describing extension point (§49). A UI (or a
// dispatcher) reads OPT_METHODS to learn what methods exist and what each one needs (a
// bracket vs a start point, gradient, Hessian) WITHOUT hard-coding that knowledge. The
// methods have different call shapes (golden-section takes a raw f + bracket; the descent
// methods take an Objective + x0), so this registry is DESCRIPTIVE metadata, not a uniform
// dispatch table — adding a method means adding its descriptor here plus its implementation.
import { InvalidInputError } from "../core/errors.ts";

export interface OptMethodInfo {
  name: string;
  description: string;
  kind: "univariate" | "multivariate";
  requiresGradient: boolean;
  requiresHessian: boolean;
}

export const OPT_METHODS: Record<string, OptMethodInfo> = {
  "golden-section": {
    name: "golden-section",
    description: "Derivative-free univariate minimization on a bracket [a,b] (unimodal assumption); LOCAL minimum.",
    kind: "univariate",
    requiresGradient: false,
    requiresHessian: false,
  },
  "gradient-descent": {
    name: "gradient-descent",
    description: "Steepest descent with backtracking (Armijo) line search from a start point; LOCAL minimum.",
    kind: "multivariate",
    requiresGradient: true,
    requiresHessian: false,
  },
  "newton": {
    name: "newton",
    description: "Damped (line-searched) Newton: solves H·d = −∇f each step, falls back to a gradient step when H is singular or indefinite; LOCAL minimum.",
    kind: "multivariate",
    requiresGradient: true,
    requiresHessian: true,
  },
};

/** Look up a method descriptor by name. Throws InvalidInputError on an unknown name. */
export function optMethod(name: string): OptMethodInfo {
  const m = OPT_METHODS[name];
  if (!m) {
    throw new InvalidInputError(`unknown optimization method "${name}"; available: ${Object.keys(OPT_METHODS).join(", ")}`);
  }
  return m;
}
