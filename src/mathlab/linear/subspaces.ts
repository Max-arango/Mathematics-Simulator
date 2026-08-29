// Fundamental subspaces and 2-norm conditioning of a real m×n matrix.
//
// Provides the three "what does this matrix do to space" answers the Inspector needs:
//   • nullspace(A)      — a basis of the (right) null space {x : A·x = 0}.
//   • columnSpace(A)    — a basis of the column space (its INDEPENDENT columns).
//   • conditionNumber(A)— κ₂(A) = σ_max/σ_min, the 2-norm condition number.
//
// RREF ROUTINE — reuse decision: eigen.ts already contains a tolerant RREF null-space
// routine (`nullSpaceBasis`) but it is NOT exported. Rather than widen eigen.ts's public
// surface (its RREF is an internal implementation detail of the eigenvector recovery), we
// keep a small local `rref` here — it additionally returns the PIVOT COLUMNS, which
// columnSpace needs and eigen's variant does not expose. The pivoting/tolerance policy is
// the same as eigen's: partial pivoting with a threshold ABS_TOL·max(1, ‖A‖∞ₑ) where
// ‖A‖∞ₑ is the largest-magnitude entry, standing in for ‖A‖ (eigen scales the same way).
import { type Matrix } from "./matrix.ts";
import { normalize, type Vec } from "./vector.ts";
import { svd } from "./svd.ts";
import { ABS_TOL } from "../core/constants.ts";

/**
 * Tolerant reduced row echelon form. Returns the reduced working matrix `a` (row-major
 * copy, pivots normalized to 1 and cleared above/below) and the ordered pivot column
 * indices. Pivot threshold scales with the largest-magnitude entry, so the "is this pivot
 * effectively zero" decision is invariant to a global rescaling of A.
 */
function rref(A: Matrix): { a: number[][]; pivotCols: number[] } {
  const rows = A.rows;
  const cols = A.cols;
  const a = A.data.map((row) => row.slice());
  let maxAbs = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) maxAbs = Math.max(maxAbs, Math.abs(a[i][j]));
  const tol = ABS_TOL * Math.max(1, maxAbs);

  const pivotCols: number[] = [];
  let row = 0;
  for (let col = 0; col < cols && row < rows; col++) {
    // Partial pivot: largest-magnitude candidate in this column at/below the current row.
    let piv = row;
    let best = Math.abs(a[row][col]);
    for (let i = row + 1; i < rows; i++) {
      const val = Math.abs(a[i][col]);
      if (val > best) { best = val; piv = i; }
    }
    if (best <= tol) continue; // no usable pivot here → free column
    [a[row], a[piv]] = [a[piv], a[row]];
    const pivotVal = a[row][col];
    for (let c = 0; c < cols; c++) a[row][c] /= pivotVal;
    for (let i = 0; i < rows; i++) {
      if (i === row) continue;
      const f = a[i][col];
      if (f !== 0) for (let c = 0; c < cols; c++) a[i][c] -= f * a[row][c];
    }
    pivotCols.push(col);
    row++;
  }
  return { a, pivotCols };
}

/**
 * Basis of the (right) null space {x : A·x = 0}, one unit vector per free column. Returns
 * the EMPTY array when the null space is trivial (A has full column rank). Vectors are
 * L2-normalized (direction is what a basis carries; magnitude is arbitrary), matching the
 * convention used by eigen.ts's eigenvector recovery.
 */
export function nullspace(A: Matrix): Vec[] {
  const cols = A.cols;
  const { a, pivotCols } = rref(A);
  const pivotSet = new Set(pivotCols);
  const basis: Vec[] = [];
  for (let free = 0; free < cols; free++) {
    if (pivotSet.has(free)) continue;
    const vec = new Array<number>(cols).fill(0);
    vec[free] = 1;
    pivotCols.forEach((pc, r) => { vec[pc] = -a[r][free]; });
    basis.push(normalize(vec));
  }
  return basis;
}

/**
 * Basis of the column space of A, returned as the ACTUAL independent columns of A (the
 * columns at the RREF pivot positions — a standard result: pivot columns of A are a basis
 * of its column space). `columnSpace(A).length` equals the numerical rank. Original columns
 * are returned (not orthonormalized) so the basis is directly interpretable as a subset of A.
 */
export function columnSpace(A: Matrix): Vec[] {
  const { pivotCols } = rref(A);
  return pivotCols.map((c) => A.data.map((row) => row[c]));
}

/**
 * 2-norm condition number κ₂(A) = σ_max/σ_min via the SVD. Returns Infinity for a
 * singular / rank-deficient matrix: when the numerical rank is below min(m, n) the true
 * smallest singular value is ≈ 0 (the thin SVD drops it), so κ diverges.
 *
 * LIMITATION (FINDING-002): svd() forms a Gram matrix, squaring the condition number
 * internally, so σ_min is only resolved down to ≈ √eps·σ_max. κ estimates therefore
 * saturate for very ill-conditioned A — a genuinely large κ is reported as large, but its
 * precise value beyond ~1e7 inherits the SVD's √eps floor and should be read as "≥".
 */
export function conditionNumber(A: Matrix): number {
  const s = svd(A);
  if (s === null) return Infinity; // rank 0 (A ≈ 0) or eigensolver non-convergence
  const full = Math.min(A.rows, A.cols);
  if (s.rank < full) return Infinity; // a true singular value is ≈ 0 → κ diverges
  return s.S[0] / s.S[s.rank - 1];
}
