// Singular Value Decomposition of a real m×n matrix: A = U·diag(S)·Vᵀ.
//
// ALGORITHM: the symmetric-eigenproblem route. The nonzero singular values of A are the
// square roots of the nonzero eigenvalues of the Gram matrix, and the singular vectors
// are its eigenvectors. We eigendecompose the SMALLER Gram matrix with eigSymmetric
// (Jacobi):
//   • m ≥ n → AᵀA (n×n): its eigenvectors are the right singular vectors V, and each
//     left singular vector is recovered as u_i = A·v_i / σ_i.
//   • m < n → AAᵀ (m×m): its eigenvectors are the left singular vectors U, and each
//     right singular vector is recovered as v_i = Aᵀ·u_i / σ_i.
// σ_i = √(max(0, λ_i)); the max clamps tiny negative eigenvalues produced by rounding
// (the Gram matrix is positive-semidefinite in exact arithmetic).
//
// SHAPE: THIN / ECONOMY and RANK-TRUNCATED. We return exactly r = numerical-rank
// columns: U is m×r, S has length r (all σ_i > 0), V is n×r. Because the omitted
// singular values are ≈ 0, A = Σ_{i<r} σ_i u_i v_iᵀ still reconstructs A to full
// accuracy — so no orthogonal completion and no division by a ≈0 singular value is ever
// needed. UᵀU = I_r and VᵀV = I_r (orthonormal COLUMNS, not full orthogonal matrices).
//
// PRECISION / STABILITY: forming the Gram matrix SQUARES the condition number
// (κ(AᵀA) = κ(A)²), which is the known cost of this route — a Golub–Kahan bidiagonal
// SVD would avoid it but is far more code. In practice small singular values are
// resolved only down to ≈ √eps·σ_max. The rank cutoff is therefore deliberately set on
// the EIGENVALUES: λ_i > REL_TOL·λ_max (equivalently σ_i > √REL_TOL·σ_max ≈ 3·10⁻⁵·
// σ_max), which sits comfortably above that √eps noise floor and above where a squared
// condition number would otherwise cause a spurious rank count.
//
// FAILURE MODEL (matches the rest of linear/):
//   • eigSymmetric fails to converge → null (propagated numerical non-result).
//   • rank 0 (A ≈ 0) → null: the economy factors would be empty (m×0 / 0-length), which
//     the dense Matrix type cannot represent. Documented edge, not a silent error.
// No shape is rejected: any m×n is accepted (unlike qr, which needs m ≥ n).
import { make, mul, transpose, type Matrix } from "./matrix.ts";
import { eigSymmetric } from "./eigen.ts";
import { REL_TOL } from "../core/constants.ts";

export interface SVD {
  U: Matrix; // m×r, orthonormal columns (left singular vectors)
  S: number[]; // r singular values, all > 0, sorted descending
  V: Matrix; // n×r, orthonormal columns (right singular vectors)
  rank: number; // numerical rank r = number of significant singular values
}

/**
 * Thin, rank-truncated SVD A = U·diag(S)·Vᵀ for any real m×n matrix. Returns null if the
 * underlying symmetric eigensolver fails to converge or if A is numerically zero (rank 0,
 * whose empty economy factors are not representable). See the header for the rank cutoff.
 */
export function svd(A: Matrix): SVD | null {
  const m = A.rows;
  const n = A.cols;
  const AT = transpose(A);

  // Decompose the smaller Gram matrix; the eigenvectors become the singular vectors of
  // that space, and the other side is derived through A (or Aᵀ).
  const deriveLeft = m >= n; // true: Gram = AᵀA (eigvecs = V, derive U); false: derive V
  const e = eigSymmetric(deriveLeft ? mul(AT, A) : mul(A, AT));
  if (e === null) return null;

  const lambda = e.values; // descending, ≥ 0 up to rounding
  const lambdaTol = REL_TOL * lambda[0]; // relative rank cutoff on Gram eigenvalues
  let r = 0;
  while (r < lambda.length && lambda[r] > lambdaTol) r++;
  if (r === 0) return null; // A ≈ 0 → empty thin factors, unrepresentable

  const S = new Array<number>(r);
  for (let i = 0; i < r; i++) S[i] = Math.sqrt(Math.max(0, lambda[i]));

  // Primary side = first r eigenvectors of the Gram matrix (columns).
  const primaryDim = deriveLeft ? n : m; // = e.vectors.rows
  const otherDim = deriveLeft ? m : n;
  const M = deriveLeft ? A : AT; // maps primary space → other space

  const primary: number[][] = Array.from({ length: primaryDim }, (_, row) =>
    Array.from({ length: r }, (_, i) => e.vectors.data[row][i]),
  );
  const other: number[][] = Array.from({ length: otherDim }, () => new Array<number>(r).fill(0));
  for (let i = 0; i < r; i++) {
    const inv = 1 / S[i]; // S[i] > 0 (kept eigenvalue is above the cutoff)
    for (let row = 0; row < otherDim; row++) {
      let s = 0;
      const mrow = M.data[row];
      for (let k = 0; k < primaryDim; k++) s += mrow[k] * primary[k][i];
      other[row][i] = s * inv;
    }
  }

  const U = deriveLeft ? make(other) : make(primary);
  const V = deriveLeft ? make(primary) : make(other);
  return { U, S, V, rank: r };
}
