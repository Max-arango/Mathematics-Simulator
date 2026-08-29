// Cholesky decomposition of a symmetric positive-definite (SPD) matrix.
//
// ALGORITHM: Cholesky–Banachiewicz, computing the lower-triangular L row by row so
// that A = L·Lᵀ. For each entry L[i][j] (j ≤ i):
//     s = A[i][j] − Σ_{k<j} L[i][k]·L[j][k]
//     L[i][i] = √s   (diagonal)      L[i][j] = s / L[j][j]   (off-diagonal)
// Only the lower triangle of A is used; the upper triangle is assumed to mirror it.
//
// WHY IT'S THE RIGHT TOOL: for SPD systems Cholesky is ~2× cheaper than LU and needs
// no pivoting — positive-definiteness guarantees positive diagonal pivots — so it is
// both faster and numerically stable.
//
// FAILURE MODEL (matches the rest of linear/):
//   • non-square input           → RangeError (programmer error)
//   • grossly non-symmetric input → RangeError (max |A[i][j]−A[j][i]| > ABS_TOL); an
//     asymmetric matrix is malformed input, not a numerical non-result, so it throws
//     rather than silently decomposing only the lower triangle.
//   • not positive-definite      → return null (a genuine numerical non-result, like
//     lu/solve/inverse). Detected when a diagonal pivot s ≤ ABS_TOL. Note this makes
//     "positive-definite" strict: a nearly-singular PSD matrix whose smallest pivot
//     falls below ABS_TOL is reported as null, which is the intended semantics.
import { make, type Matrix } from "./matrix.ts";
import { ABS_TOL } from "../core/constants.ts";

/**
 * Cholesky factor L (lower-triangular) with A = L·Lᵀ for symmetric positive-definite A.
 * Returns null when A is not positive-definite. Throws RangeError for non-square or
 * grossly non-symmetric input.
 */
export function cholesky(A: Matrix): Matrix | null {
  if (A.rows !== A.cols) {
    throw new RangeError(`cholesky requires a square matrix; got ${A.rows}x${A.cols}`);
  }
  const n = A.rows;

  // Trust-boundary check: reject clearly non-symmetric input.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(A.data[i][j] - A.data[j][i]) > ABS_TOL) {
        throw new RangeError(`cholesky requires a symmetric matrix; A[${i}][${j}] ≠ A[${j}][${i}]`);
      }
    }
  }

  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A.data[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= ABS_TOL) return null; // pivot not positive → A is not SPD
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }

  return make(L);
}
