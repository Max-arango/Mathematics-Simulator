// Householder QR decomposition of a real m×n matrix with m ≥ n.
//
// ALGORITHM: successive Householder reflections zero out the sub-diagonal of one
// column at a time. Reflection k is H_k = I − β·v·vᵀ; applying H_{n-1}…H_1 H_0 to
// A leaves R upper-triangular, and Q = H_0 H_1 … H_{n-1} accumulates the (symmetric,
// orthogonal) reflectors so that A = Q·R.
//
// SHAPE: this returns the REDUCED ("thin") factorization — Q is m×n with orthonormal
// COLUMNS (QᵀQ = Iₙ, not full Qᵀ = Q⁻¹ unless m = n) and R is n×n upper-triangular.
// The thin form is what least-squares needs and avoids materializing the m×m Q.
//
// STABILITY: Householder QR is backward-stable and does NOT square the condition
// number the way the normal equations (AᵀA) do — that is why it is the preferred
// path for least-squares here. The reflector sign is chosen as α = −sign(x₀)·‖x‖ so
// that v₀ = x₀ − α adds magnitudes instead of subtracting them, avoiding catastrophic
// cancellation when x₀ ≈ ‖x‖.
//
// FAILURE MODEL (matches the rest of linear/): shape errors are PROGRAMMER errors and
// throw RangeError. A rank-deficient A does not fail here — it yields an R with tiny
// (≈0) diagonal entries; downstream code (see leastSquares) decides what to do.
import { make, type Matrix } from "./matrix.ts";
import { ABS_TOL } from "../core/constants.ts";

export interface QR {
  Q: Matrix; // m×n, orthonormal columns (QᵀQ = Iₙ)
  R: Matrix; // n×n, upper-triangular
}

/**
 * Reduced Householder QR: A = Q·R with Q (m×n) orthonormal-columns and R (n×n) upper.
 * Requires m ≥ n; throws RangeError for m < n (underdetermined shape is unsupported).
 */
export function qr(A: Matrix): QR {
  const m = A.rows;
  const n = A.cols;
  if (m < n) {
    throw new RangeError(`qr requires rows ≥ cols (m ≥ n); got ${m}x${n}`);
  }

  // R starts as a working copy of A (m×n) and becomes upper-trapezoidal in place.
  const R = A.data.map((row) => row.slice());
  // Q starts as the m×m identity and accumulates reflectors on the right.
  const Q: number[][] = Array.from({ length: m }, (_, i) =>
    Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)),
  );

  for (let k = 0; k < n; k++) {
    // x = sub-column R[k..m-1][k]; norm over that range.
    let normX = 0;
    for (let i = k; i < m; i++) normX += R[i][k] * R[i][k];
    normX = Math.sqrt(normX);
    if (normX <= ABS_TOL) continue; // column already ≈ 0 below diagonal → no reflector

    // α = −sign(x₀)·‖x‖ (sign(0)=+1) keeps v₀ = x₀ − α free of cancellation.
    const sigma = R[k][k] >= 0 ? 1 : -1;
    const alpha = -sigma * normX;

    // Build reflector v (indices k..m-1); v[k] = x₀ − α, v[i>k] = x_i.
    const v = new Array<number>(m).fill(0);
    v[k] = R[k][k] - alpha;
    for (let i = k + 1; i < m; i++) v[i] = R[i][k];

    let vNorm2 = 0;
    for (let i = k; i < m; i++) vNorm2 += v[i] * v[i];
    if (vNorm2 <= ABS_TOL * ABS_TOL) continue; // degenerate reflector
    const beta = 2 / vNorm2;

    // Apply H_k = I − β v vᵀ to R on the left (columns k..n-1).
    for (let j = k; j < n; j++) {
      let s = 0;
      for (let i = k; i < m; i++) s += v[i] * R[i][j];
      s *= beta;
      for (let i = k; i < m; i++) R[i][j] -= s * v[i];
    }

    // Accumulate Q ← Q·H_k (H_k symmetric): Q − β (Q v) vᵀ, all rows, cols k..m-1.
    for (let r = 0; r < m; r++) {
      let s = 0;
      for (let i = k; i < m; i++) s += Q[r][i] * v[i];
      s *= beta;
      for (let i = k; i < m; i++) Q[r][i] -= s * v[i];
    }
  }

  // Thin R: first n rows, sub-diagonal forced to clean zero within tolerance.
  const Rthin: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const val = R[i][j];
      return i > j && Math.abs(val) <= ABS_TOL ? 0 : val;
    }),
  );
  // Thin Q: first n columns of the accumulated m×m Q.
  const Qthin: number[][] = Q.map((row) => row.slice(0, n));

  return { Q: make(Qthin), R: make(Rthin) };
}
