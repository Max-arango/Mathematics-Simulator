// Multivariate LOCAL minimization: steepest descent and Newton, both with a BACKTRACKING
// (Armijo) line search. Both walk downhill from a user-supplied start x0 to the nearest
// stationary point — LOCAL minima only, never a global claim.
//
// LINE SEARCH (shared by both): given a descent direction d at x (∇f·d < 0), start with a
// full step t = INITIAL_STEP and shrink t ← SHRINK·t until the Armijo sufficient-decrease
// condition holds:
//        f(x + t·d) ≤ f(x) + C1 · t · (∇f·d).
// C1 = 1e-4 (loose, textbook) demands only a small fraction of the decrease the linear model
// predicts, so the search accepts a step quickly; SHRINK = 0.5 halves the step each miss.
// After MAX_BACKTRACK shrinks with no acceptable step we report "line-search-failed" (either
// x is already essentially optimal along d, or d was not truly a descent direction).
//
// STEEPEST DESCENT (gradientDescent): d = −∇f. Robust but slow in narrow curved valleys
// (Rosenbrock is the classic pathology — it crawls). Generous cap GD_MAX_ITER = 10000.
//
// NEWTON (newton): d solves H·d = −∇f (matrix.solve). This is the DAMPED / line-searched
// Newton: we still run the Armijo line search on the Newton direction rather than always
// taking the full t = 1 step, which is what makes it converge on Rosenbrock instead of
// overshooting. GUARDS: if H is singular (solve → null) OR the Newton direction is not a
// descent direction (∇f·d ≥ 0, e.g. near a saddle where H is indefinite) we fall back to a
// steepest-descent step for that iteration and record a warning. Near a genuine minimum H is
// positive-definite and Newton regains its quadratic convergence, so the cap is small
// (NEWTON_MAX_ITER = 100).
import { make as makeMatrix, solve } from "../linear/matrix.ts";
import { norm, add, scale, dot, type Vec } from "../linear/vector.ts";
import { ABS_TOL } from "../core/constants.ts";
import {
  type Objective,
  type OptOptions,
  type OptResult,
  evalObjective,
  gradientOf,
  hessianOf,
} from "./objective.ts";

const C1 = 1e-4;          // Armijo sufficient-decrease constant
const SHRINK = 0.5;       // backtracking step-shrink factor
const INITIAL_STEP = 1;   // initial trial step length
const MAX_BACKTRACK = 50; // shrinks tried before declaring line-search failure
const GD_MAX_ITER = 10000;
const NEWTON_MAX_ITER = 100;

/** A search direction plus an optional (deduplicated) warning about how it was produced. */
interface Direction {
  d: Vec;
  warning?: string;
}

/**
 * Backtracking Armijo line search along descent direction d from x.
 * Returns the accepted step t and ok=true, or ok=false if no step satisfied Armijo within
 * MAX_BACKTRACK shrinks. `gd` is the directional derivative ∇f·d (must be < 0 for descent).
 */
function backtrack(
  obj: Objective,
  x: Vec,
  fx: number,
  d: Vec,
  gd: number,
  c1: number,
  shrink: number,
  initialStep: number,
): { t: number; ok: boolean } {
  let t = initialStep;
  for (let k = 0; k < MAX_BACKTRACK; k++) {
    const ft = evalObjective(obj, add(x, scale(d, t)));
    if (Number.isFinite(ft) && ft <= fx + c1 * t * gd) return { t, ok: true };
    t *= shrink;
  }
  return { t, ok: false };
}

/**
 * Core descent loop shared by gradientDescent and newton. `direction` maps (x, ∇f) to a
 * search direction; everything else (line search, stopping, trajectory, metadata) is common.
 */
function descend(
  obj: Objective,
  x0: Vec,
  method: string,
  maxIterations: number,
  opts: OptOptions,
  direction: (x: Vec, grad: Vec) => Direction,
): OptResult {
  const gradTol = opts.gradTol ?? ABS_TOL;
  const c1 = opts.c1 ?? C1;
  const shrink = opts.shrink ?? SHRINK;
  const initialStep = opts.initialStep ?? INITIAL_STEP;
  const warnings: string[] = [];

  let x = x0.slice();
  const trajectory: Vec[] = [x0.slice()];
  let grad = gradientOf(obj, x);
  let gnorm = norm(grad);
  let iterations = 0;
  let converged = false;
  let termination = "max-iterations";

  while (iterations < maxIterations) {
    if (gnorm < gradTol) {
      converged = true;
      termination = "gradient-tol";
      break;
    }
    const { d, warning } = direction(x, grad);
    if (warning && !warnings.includes(warning)) warnings.push(warning);

    const fx = evalObjective(obj, x);
    const gd = dot(grad, d);
    const { t, ok } = backtrack(obj, x, fx, d, gd, c1, shrink, initialStep);
    if (!ok) {
      termination = "line-search-failed";
      warnings.push(`line search failed at iteration ${iterations} (no Armijo step within ${MAX_BACKTRACK} backtracks)`);
      break;
    }

    x = add(x, scale(d, t));
    trajectory.push(x.slice());
    iterations++;
    grad = gradientOf(obj, x);
    gnorm = norm(grad);
    if (!Number.isFinite(gnorm)) {
      termination = "non-finite";
      warnings.push(`gradient became non-finite at iteration ${iterations}; stopped (result past here is not trustworthy)`);
      break;
    }
  }
  // The final update may have hit gradTol exactly as the cap was reached.
  if (!converged && termination === "max-iterations" && gnorm < gradTol) {
    converged = true;
    termination = "gradient-tol";
  }

  return {
    solution: x.slice(),
    objective: evalObjective(obj, x),
    iterations,
    converged,
    gradientNorm: gnorm,
    termination,
    method,
    warnings,
    trajectory,
  };
}

/**
 * Steepest descent (direction −∇f) with backtracking Armijo line search. Stops when
 * ‖∇f‖ < gradTol ("gradient-tol") or after maxIterations ("max-iterations"); a stalled line
 * search ends with "line-search-failed". LOCAL minimum only.
 */
export function gradientDescent(obj: Objective, x0: Vec, opts: OptOptions = {}): OptResult {
  const maxIterations = opts.maxIterations ?? GD_MAX_ITER;
  return descend(obj, x0, "gradient-descent", maxIterations, opts, (_x, grad) => ({
    d: scale(grad, -1),
  }));
}

/**
 * Damped (line-searched) Newton: direction solves H·d = −∇f, then Armijo-backtracks on it.
 * Falls back to a steepest-descent step (with a warning) when H is singular or the Newton
 * direction is not a descent direction. Stops on ‖∇f‖ < gradTol. LOCAL minimum only.
 */
export function newton(obj: Objective, x0: Vec, opts: OptOptions = {}): OptResult {
  const maxIterations = opts.maxIterations ?? NEWTON_MAX_ITER;
  return descend(obj, x0, "newton", maxIterations, opts, (x, grad) => {
    const H = hessianOf(obj, x);
    const step = solve(makeMatrix(H), scale(grad, -1)); // H·d = −∇f
    if (!step) {
      return { d: scale(grad, -1), warning: "Hessian singular; used a steepest-descent step" };
    }
    if (dot(grad, step) >= 0) {
      return { d: scale(grad, -1), warning: "Newton direction was not a descent direction (indefinite Hessian); used a steepest-descent step" };
    }
    return { d: step };
  });
}
