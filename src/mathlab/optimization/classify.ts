// Second-derivative (Hessian) classification of a critical point. Given an objective and a
// point the caller BELIEVES is a critical point (∇f ≈ 0 — this routine does NOT verify that),
// the sign pattern of the Hessian's eigenvalues decides the local shape:
//
//   • all eigenvalues > 0  → strict local MINIMUM   (Hessian positive-definite)
//   • all eigenvalues < 0  → strict local MAXIMUM   (Hessian negative-definite)
//   • mixed signs          → SADDLE                 (Hessian indefinite)
//   • any eigenvalue ≈ 0   → INCONCLUSIVE            (Hessian degenerate/semidefinite —
//                                                     the second-order test simply fails;
//                                                     higher-order terms decide, e.g. x²+y³)
//
// The Hessian is SYMMETRIC (mixed partials commute), so eigenvalues are real and we use the
// symmetric Jacobi solver (eigSymmetric) — accurate real eigenvalues, no complex arithmetic.
//
// TOLERANCE: "≈ 0" is judged RELATIVE to the largest-magnitude eigenvalue (tol = REL_TOL ·
// max|λ|), so scaling the objective does not change the verdict. A Hessian that is itself ≈ 0
// (max|λ| ≤ EPSILON) is degenerate → inconclusive. confidence is always "numerical": these
// are floating-point eigenvalues, not a symbolic proof of definiteness.
import { make } from "../linear/matrix.ts";
import { eigSymmetric } from "../linear/eigen.ts";
import { REL_TOL, EPSILON } from "../core/constants.ts";
import type { Vec } from "../linear/vector.ts";
import { type Objective, hessianOf } from "./objective.ts";

export interface CriticalPointClassification {
  type: "minimum" | "maximum" | "saddle" | "inconclusive";
  eigenvalues: number[];   // Hessian eigenvalues (real; symmetric matrix), descending
  hessian: number[][];     // the Hessian evaluated at the point
  reason: string;
  confidence: "numerical"; // floating-point eigenvalues, not a symbolic definiteness proof
}

/**
 * Classify a critical `point` of `obj` via the sign pattern of the Hessian eigenvalues.
 * Does not check ∇f ≈ 0 — the caller is asserting `point` is critical. If the symmetric
 * eigensolver fails to converge the result is "inconclusive" with an explanatory reason.
 */
export function classifyCritical(obj: Objective, point: Vec): CriticalPointClassification {
  const hessian = hessianOf(obj, point);
  const eig = eigSymmetric(make(hessian));

  if (!eig) {
    return {
      type: "inconclusive",
      eigenvalues: [],
      hessian,
      reason: "Hessian eigensolver did not converge; classification unavailable",
      confidence: "numerical",
    };
  }

  const eigenvalues = eig.values;
  const maxAbs = Math.max(...eigenvalues.map(Math.abs));
  const tol = REL_TOL * maxAbs;

  const list = eigenvalues.map((v) => v.toPrecision(4)).join(", ");

  // A near-zero Hessian, or any near-zero eigenvalue, is degenerate: the second-order test
  // gives no information (checked FIRST — it dominates the sign verdict).
  if (maxAbs <= EPSILON || eigenvalues.some((v) => Math.abs(v) <= tol)) {
    return {
      type: "inconclusive",
      eigenvalues,
      hessian,
      reason: `degenerate Hessian (a near-zero eigenvalue among [${list}]); second-order test is inconclusive`,
      confidence: "numerical",
    };
  }

  if (eigenvalues.every((v) => v > tol)) {
    return { type: "minimum", eigenvalues, hessian, reason: `Hessian positive-definite (all eigenvalues > 0: [${list}])`, confidence: "numerical" };
  }
  if (eigenvalues.every((v) => v < -tol)) {
    return { type: "maximum", eigenvalues, hessian, reason: `Hessian negative-definite (all eigenvalues < 0: [${list}])`, confidence: "numerical" };
  }
  return { type: "saddle", eigenvalues, hessian, reason: `Hessian indefinite (mixed-sign eigenvalues: [${list}])`, confidence: "numerical" };
}
