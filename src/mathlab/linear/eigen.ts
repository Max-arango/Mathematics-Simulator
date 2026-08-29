// Eigendecomposition of a real SYMMETRIC matrix via cyclic Jacobi rotations.
//
// ALGORITHM: the classical/cyclic Jacobi method. Each step applies a Givens rotation
// J in the (p,q) plane so that A ← JᵀAJ annihilates the off-diagonal entry A[p][q]
// while keeping A symmetric. Sweeping over every super-diagonal pair (p<q) drives the
// off-diagonal mass to zero; the diagonal converges to the eigenvalues and the product
// of all rotations, V = J₁J₂…, converges to the orthonormal eigenvectors (A = V·Λ·Vᵀ).
// The rotation angle is the smaller root of t² + 2·τ·t − 1 = 0 with τ = (a_qq−a_pp)/
// (2·a_pq), chosen small to keep the accumulated V well-conditioned.
//
// WHY JACOBI (and not QR-iteration): for SYMMETRIC matrices Jacobi is simple, always
// real, backward-stable, and — unlike the QR algorithm — delivers highly accurate
// eigenvectors for clustered / repeated eigenvalues, producing an orthonormal basis of
// each eigenspace automatically. Its cost is O(n³) per sweep with a handful of sweeps
// (quadratic convergence once the off-diagonal is small), which is ideal for the small,
// dense matrices this lab works with.
//
// SHAPE / ORDERING: `values` are the real eigenvalues sorted DESCENDING; `vectors` is a
// square matrix whose COLUMN j is the orthonormal eigenvector for `values[j]`.
//
// FAILURE MODEL (matches the rest of linear/):
//   • non-square input            → RangeError (programmer error).
//   • grossly non-symmetric input → RangeError (max |A[i][j]−A[j][i]| > ABS_TOL). This
//     solver is SYMMETRIC-ONLY: complex/defective spectra of general matrices are NOT
//     supported here — a general (non-symmetric) eigensolver is a separate future piece.
//   • failure to converge within the sweep cap → null (a genuine numerical non-result).
//     The cap is MAX_ITERATIONS sweeps; cyclic Jacobi converges quadratically, so for
//     any well-formed symmetric matrix a few sweeps suffice and null is effectively
//     unreachable — it exists only to bound pathological inputs.
import { make, identity, type Matrix } from "./matrix.ts";
import { ABS_TOL, EPSILON, MAX_ITERATIONS } from "../core/constants.ts";

export interface Eigen {
  values: number[]; // eigenvalues, sorted descending
  vectors: Matrix; // column j is the orthonormal eigenvector for values[j]
}

/**
 * Symmetric eigendecomposition A = V·diag(values)·Vᵀ via cyclic Jacobi rotations.
 * Returns eigenvalues sorted descending with matching eigenvector columns, or null if
 * the iteration fails to converge within MAX_ITERATIONS sweeps. Throws RangeError for
 * non-square or grossly non-symmetric input.
 */
export function eigSymmetric(A: Matrix): Eigen | null {
  if (A.rows !== A.cols) {
    throw new RangeError(`eigSymmetric requires a square matrix; got ${A.rows}x${A.cols}`);
  }
  const n = A.rows;

  // Trust-boundary check: this solver only handles symmetric matrices.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(A.data[i][j] - A.data[j][i]) > ABS_TOL) {
        throw new RangeError(`eigSymmetric requires a symmetric matrix; A[${i}][${j}] ≠ A[${j}][${i}]`);
      }
    }
  }

  // Working copy that the rotations diagonalize; V accumulates the rotations.
  const a = A.data.map((r) => r.slice());
  const V = identity(n).data;

  let converged = false;
  for (let sweep = 0; sweep <= MAX_ITERATIONS; sweep++) {
    // Off-diagonal Frobenius norm: ‖offdiag‖² = 2·Σ_{i<j} a[i][j]².
    let off2 = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) off2 += a[i][j] * a[i][j];
    }
    if (Math.sqrt(2 * off2) <= ABS_TOL) { converged = true; break; }
    if (sweep === MAX_ITERATIONS) break; // cap reached without converging

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (Math.abs(apq) <= EPSILON) continue; // already ≈ 0 → no rotation needed

        // Smaller root of t² + 2τt − 1 = 0 (t = tan of the rotation angle).
        const tau = (a[q][q] - a[p][p]) / (2 * apq);
        const t = tau >= 0
          ? 1 / (tau + Math.sqrt(tau * tau + 1))
          : -1 / (-tau + Math.sqrt(tau * tau + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        // A ← JᵀAJ. Rows/cols other than p,q rotate as a plane; symmetry maintained.
        for (let i = 0; i < n; i++) {
          if (i === p || i === q) continue;
          const aip = a[i][p];
          const aiq = a[i][q];
          a[i][p] = c * aip - s * aiq;
          a[p][i] = a[i][p];
          a[i][q] = s * aip + c * aiq;
          a[q][i] = a[i][q];
        }
        const app = a[p][p];
        const aqq = a[q][q];
        a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
        a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
        a[p][q] = 0;
        a[q][p] = 0;

        // V ← V·J (accumulate eigenvectors as columns).
        for (let i = 0; i < n; i++) {
          const vip = V[i][p];
          const viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
      }
    }
  }

  if (!converged) return null;

  // Eigenvalues are the converged diagonal; sort descending, carry vector columns along.
  const idx = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[y][y] - a[x][x]);
  const values = idx.map((i) => a[i][i]);
  const vectors: number[][] = Array.from({ length: n }, (_, r) => idx.map((i) => V[r][i]));

  return { values, vectors: make(vectors) };
}
