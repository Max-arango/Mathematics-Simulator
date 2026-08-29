// Multivariable differential operators: symbolic (via derivative, which already
// simplifies) plus numeric evaluation at a point and a finite-difference gradient
// for cross-validation. No eval, no dynamic dispatch — reuses the core AST/eval.
import type { Node } from "../core/ast.ts";
import { num, add } from "../core/ast.ts";
import { derivative } from "./derivative.ts";
import { evaluate, type Env } from "../core/eval.ts";
import { DERIV_H } from "../core/constants.ts";

// ── SYMBOLIC ────────────────────────────────────────────────────────────────

/** Gradient ∇f = [∂f/∂x_i]. */
export function gradient(f: Node, vars: string[]): Node[] {
  return vars.map((v) => derivative(f, v));
}

/** Hessian H_ij = ∂²f/∂x_i∂x_j. */
export function hessian(f: Node, vars: string[]): Node[][] {
  const grad = gradient(f, vars);
  return grad.map((gi) => vars.map((vj) => derivative(gi, vj)));
}

/** Jacobian J_ij = ∂f_i/∂x_j for a vector field F = [f_i]. */
export function jacobian(F: Node[], vars: string[]): Node[][] {
  return F.map((fi) => vars.map((vj) => derivative(fi, vj)));
}

/** Laplacian ∇²f = Σ_i ∂²f/∂x_i². */
export function laplacian(f: Node, vars: string[]): Node {
  const seconds = vars.map((v) => derivative(derivative(f, v), v));
  return seconds.reduce((acc, s) => add(acc, s), num(0) as Node);
}

// ── NUMERIC EVALUATION ──────────────────────────────────────────────────────

const envAt = (vars: string[], point: number[]): Env => {
  if (vars.length !== point.length) {
    throw new Error(`point has ${point.length} coords, expected ${vars.length}`);
  }
  const rec: Record<string, number> = {};
  vars.forEach((v, i) => (rec[v] = point[i]));
  return { vars: rec, funcs: {} };
};

/** Evaluate a symbolic node at a point (vars[i] := point[i]). */
export function evalAt(node: Node, vars: string[], point: number[]): number {
  return evaluate(node, envAt(vars, point));
}

/** Numeric gradient of a symbolic f at a point. */
export function gradientAt(f: Node, vars: string[], point: number[]): number[] {
  return gradient(f, vars).map((g) => evalAt(g, vars, point));
}

/** Numeric Hessian of a symbolic f at a point. */
export function hessianAt(f: Node, vars: string[], point: number[]): number[][] {
  return hessian(f, vars).map((row) => row.map((h) => evalAt(h, vars, point)));
}

/** Numeric Jacobian of a symbolic vector field F at a point. */
export function jacobianAt(F: Node[], vars: string[], point: number[]): number[][] {
  return jacobian(F, vars).map((row) => row.map((j) => evalAt(j, vars, point)));
}

/** Numeric Laplacian of a symbolic f at a point. */
export function laplacianAt(f: Node, vars: string[], point: number[]): number {
  return evalAt(laplacian(f, vars), vars, point);
}

// ── FINITE DIFFERENCES ──────────────────────────────────────────────────────

/**
 * Central-difference gradient of a black-box f: R^n → R.
 * For cross-validating the symbolic result and for when no AST is available.
 */
export function numGradient(
  f: (p: number[]) => number,
  point: number[],
  h = DERIV_H,
): number[] {
  return point.map((_, i) => {
    const fwd = point.slice();
    const bwd = point.slice();
    fwd[i] += h;
    bwd[i] -= h;
    return (f(fwd) - f(bwd)) / (2 * h);
  });
}
