// Linear least squares: minimize ‖A·x − b‖₂ for an overdetermined (or square)
// full-rank system, solved via the thin Householder QR of commit 1.
//
// METHOD: with A = Q·R (Q m×n orthonormal columns, R n×n upper), the least-squares
// solution satisfies R·x = Qᵀ·b, obtained by back-substitution. The minimized
// residual is r = A·x − b.
//
// WHY QR AND NOT THE NORMAL EQUATIONS (AᵀA·x = Aᵀb): forming AᵀA squares the
// condition number, κ(AᵀA) = κ(A)², so a problem with κ(A) ≈ 10⁸ loses ALL precision
// in double (≈16 digits → 0) when solved that way. QR operates on A directly and is
// backward-stable, keeping κ(A) — that is the whole reason we route through qr.ts.
//
// RANK / FAILURE MODEL (matches the rest of linear/):
//   • b length ≠ A.rows → RangeError (programmer error).
//   • m < n (underdetermined) → RangeError, propagated from qr (unsupported shape).
//   • rank-deficient A (some |R[i][i]| ≤ RANK_TOL) → return null. Rank is reported via
//     the returned object only for full-rank solves; a deficient system has no unique
//     minimizer here, so we return null rather than pick a pseudo-inverse solution.
//     NOTE: rank detection is a thresholded decision (RANK_TOL = 1e-9 on the R
//     diagonal). A matrix that is *numerically* near-deficient can sit either side of
//     that line — see findings; this is the same tolerance policy used by matrix.rank.
import { qr } from "./qr.ts";
import { type Matrix, RANK_TOL } from "./matrix.ts";
import { type Vec, sub, norm } from "./vector.ts";

export interface LeastSquares {
  x: Vec; // minimizer, length n
  residual: Vec; // A·x − b, length m
  residualNorm: number; // ‖residual‖₂
  rank: number; // numerical rank (= n for a returned full-rank solve)
}

/**
 * Least-squares solution of A·x ≈ b for m ≥ n. Returns null if A is rank-deficient.
 * Throws RangeError on dimension mismatch or unsupported (m < n) shape.
 */
export function leastSquares(A: Matrix, b: Vec): LeastSquares | null {
  if (b.length !== A.rows) {
    throw new RangeError(`b length ${b.length} ≠ matrix rows ${A.rows}`);
  }
  const n = A.cols;

  const { Q, R } = qr(A); // throws RangeError if m < n

  // Numerical rank = number of R diagonal entries above tolerance.
  let rank = 0;
  for (let i = 0; i < n; i++) if (Math.abs(R.data[i][i]) > RANK_TOL) rank++;
  if (rank < n) return null; // rank-deficient → no unique minimizer

  // Qᵀ·b (length n): dot each column of Q with b.
  const qtb = new Array<number>(n).fill(0);
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let i = 0; i < A.rows; i++) s += Q.data[i][j] * b[i];
    qtb[j] = s;
  }

  // Back-substitution R·x = Qᵀb (R diagonals are all > RANK_TOL here).
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = qtb[i];
    for (let j = i + 1; j < n; j++) s -= R.data[i][j] * x[j];
    x[i] = s / R.data[i][i];
  }

  // residual = A·x − b.
  const Ax = A.data.map((row) => row.reduce((acc, aij, j) => acc + aij * x[j], 0));
  const residual = sub(Ax, b);

  return { x, residual, residualNorm: norm(residual), rank };
}
