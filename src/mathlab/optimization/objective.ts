// Optimization objective + the shared result/option shapes for the LOCAL optimizers
// in this subsystem (golden-section, gradient descent, Newton). NOTE UP FRONT: every
// method here finds a LOCAL optimum only — none of them is a global optimizer. The
// caller supplies a starting point (or a bracket) and gets the nearest stationary
// point the method walks to; there is no guarantee it is the global one.
//
// SERIALIZATION (§81): an Objective is defined by its SOURCE string, not by a live
// closure. We keep the parsed `f: Node` alongside the source purely as a compute cache
// (the AST is derived from `source` and can always be rebuilt via makeObjective). Persist
// the { vars, source } pair; rehydrate with makeObjective — no functions to serialize.
//
// Gradients are SYMBOLIC (reusing calculus/vectorCalculus) with a finite-difference
// FALLBACK: if symbolic differentiation cannot handle a node in the expression, gradientOf
// silently drops to a central-difference numeric gradient so an unusual-but-evaluable
// objective still optimizes (at reduced accuracy). The Hessian is symbolic-only.
import type { Node } from "../core/ast.ts";
import { freeVars } from "../core/ast.ts";
import { parse } from "../core/parser.ts";
import { gradientAt, hessianAt, evalAt, numGradient } from "../calculus/vectorCalculus.ts";
import { InvalidInputError } from "../core/errors.ts";
import type { Vec } from "../linear/vector.ts";

/** A scalar objective f: Rⁿ → R over `vars`, defined by its source string. */
export interface Objective {
  vars: string[];   // ordered coordinate names; a point's i-th entry binds vars[i]
  source: string;   // the expression as written (the serialization-safe definition)
  f: Node;          // parsed AST cache derived from `source`
}

/** Options shared by the multivariate descent methods (gradient descent, Newton). */
export interface OptOptions {
  gradTol?: number;       // stop when ‖∇f‖ < gradTol (default ABS_TOL)
  maxIterations?: number; // iteration cap (method-specific default)
  c1?: number;            // Armijo sufficient-decrease constant (default 1e-4)
  shrink?: number;        // backtracking step-shrink factor in (0,1) (default 0.5)
  initialStep?: number;   // initial trial step length for the line search (default 1)
}

/**
 * Uniform result shape for every optimizer here (aligns with the result-shape spirit of
 * core/result.ts §66 and the OptResult contract §11). `converged` means the method met its
 * own stopping criterion — a LOCAL optimum — never a claim of global optimality.
 */
export interface OptResult {
  solution: Vec;      // best point found (== trajectory[last])
  objective: number;  // f(solution)
  iterations: number; // iterations actually taken
  converged: boolean; // met the stopping criterion (local optimum), not a global claim
  gradientNorm: number; // ‖∇f(solution)‖ (NaN for derivative-free methods)
  termination: string;  // e.g. "gradient-tol" | "max-iterations" | "line-search-failed" | "interval-tol"
  method: string;       // provenance
  warnings: string[];
  trajectory: Vec[];    // iterates including x0 and solution — for later viz (§12)
}

/**
 * Build an Objective from a source string over the given `vars`. Constants (pi, e, phi,
 * tau) and function names are always allowed; any FREE VARIABLE not listed in `vars` is a
 * usage error → InvalidInputError. Syntactically-invalid source surfaces the parser error.
 */
export function makeObjective(vars: string[], source: string): Objective {
  const f = parse(source);
  const allowed = new Set(vars);
  const unknown = [...freeVars(f)].filter((v) => !allowed.has(v));
  if (unknown.length > 0) {
    throw new InvalidInputError(
      `objective "${source}" references unknown variable(s) ${unknown.join(", ")}; ` +
        `declared vars: ${vars.join(", ") || "(none)"}`,
    );
  }
  return { vars: vars.slice(), source, f };
}

/** Evaluate f at a point (point[i] binds vars[i]). */
export function evalObjective(obj: Objective, point: Vec): number {
  return evalAt(obj.f, obj.vars, point);
}

/**
 * ∇f at a point. Symbolic gradient evaluated numerically; if symbolic differentiation
 * throws on any component (a node it cannot handle), falls back to a central-difference
 * numeric gradient of the whole objective.
 */
export function gradientOf(obj: Objective, point: Vec): Vec {
  try {
    return gradientAt(obj.f, obj.vars, point);
  } catch {
    return numGradient((p) => evalAt(obj.f, obj.vars, p), point);
  }
}

/** Hessian ∂²f/∂xᵢ∂xⱼ at a point (symbolic; no numeric fallback). */
export function hessianOf(obj: Objective, point: Vec): number[][] {
  return hessianAt(obj.f, obj.vars, point);
}
