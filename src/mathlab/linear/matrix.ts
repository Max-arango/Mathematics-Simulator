// Dense row-major matrices with NUMERICAL (floating-point) linear algebra.
// Determinant / inverse / solve go through LU decomposition with PARTIAL PIVOTING
// (not cofactor expansion — that is O(n!) and numerically poor). rank uses tolerant
// Gaussian elimination. All singularity decisions use documented tolerances below,
// because in floating point "singular" means "pivot indistinguishable from zero".
import { ABS_TOL } from "../core/constants.ts";

export interface Matrix {
  rows: number;
  cols: number;
  data: number[][]; // row-major: data[r][c]
}

/** Pivot below this magnitude is treated as zero → matrix considered singular. */
export const SINGULAR_TOL = ABS_TOL;
/** Row-echelon pivot below this magnitude counts as a zero row for rank. */
export const RANK_TOL = ABS_TOL;

export function make(data: number[][]): Matrix {
  const rows = data.length;
  if (rows === 0) throw new RangeError("matrix must have at least one row");
  const cols = data[0].length;
  if (cols === 0) throw new RangeError("matrix must have at least one column");
  for (const row of data) {
    if (row.length !== cols) throw new RangeError("matrix rows must all have equal length (rectangular)");
  }
  return { rows, cols, data: data.map((r) => r.slice()) };
}

export const zeros = (r: number, c: number): Matrix =>
  make(Array.from({ length: r }, () => new Array<number>(c).fill(0)));

export function identity(n: number): Matrix {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m.data[i][i] = 1;
  return m;
}

export const get = (m: Matrix, r: number, c: number): number => m.data[r][c];
export const set = (m: Matrix, r: number, c: number, v: number): void => { m.data[r][c] = v; };
export const dims = (m: Matrix): { rows: number; cols: number } => ({ rows: m.rows, cols: m.cols });

function sameDims(a: Matrix, b: Matrix): void {
  if (a.rows !== b.rows || a.cols !== b.cols) {
    throw new RangeError(`dimension mismatch: ${a.rows}x${a.cols} vs ${b.rows}x${b.cols}`);
  }
}

export function add(a: Matrix, b: Matrix): Matrix {
  sameDims(a, b);
  return make(a.data.map((row, r) => row.map((x, c) => x + b.data[r][c])));
}

export function sub(a: Matrix, b: Matrix): Matrix {
  sameDims(a, b);
  return make(a.data.map((row, r) => row.map((x, c) => x - b.data[r][c])));
}

export const scale = (m: Matrix, k: number): Matrix =>
  make(m.data.map((row) => row.map((x) => x * k)));

/** Matrix product A·B. Validates inner dimensions. */
export function mul(a: Matrix, b: Matrix): Matrix {
  if (a.cols !== b.rows) {
    throw new RangeError(`inner dimension mismatch: ${a.rows}x${a.cols} · ${b.rows}x${b.cols}`);
  }
  const out = zeros(a.rows, b.cols);
  for (let i = 0; i < a.rows; i++) {
    for (let k = 0; k < a.cols; k++) {
      const aik = a.data[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < b.cols; j++) out.data[i][j] += aik * b.data[k][j];
    }
  }
  return out;
}

export function transpose(m: Matrix): Matrix {
  const out = zeros(m.cols, m.rows);
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) out.data[c][r] = m.data[r][c];
  return out;
}

export function trace(m: Matrix): number {
  if (m.rows !== m.cols) throw new RangeError("trace requires a square matrix");
  let s = 0;
  for (let i = 0; i < m.rows; i++) s += m.data[i][i];
  return s;
}

function requireSquare(m: Matrix): void {
  if (m.rows !== m.cols) throw new RangeError("operation requires a square matrix");
}

export interface LU {
  L: Matrix; // unit lower-triangular
  U: Matrix; // upper-triangular
  P: Matrix; // permutation matrix, so P·A = L·U
  sign: number; // determinant sign of P (+1 / -1)
}

/**
 * LU decomposition with partial pivoting: finds P, L, U with P·A = L·U.
 * Returns null when a pivot column is entirely ≈ 0 (matrix is singular),
 * so callers can distinguish "no decomposition" from a valid one.
 */
export function lu(m: Matrix): LU | null {
  requireSquare(m);
  const n = m.rows;
  const a = m.data.map((r) => r.slice()); // working copy, becomes combined L\U
  const perm = Array.from({ length: n }, (_, i) => i);
  let sign = 1;

  for (let col = 0; col < n; col++) {
    // partial pivot: largest magnitude in this column at/below the diagonal
    let pivot = col;
    let best = Math.abs(a[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(a[r][col]);
      if (v > best) { best = v; pivot = r; }
    }
    if (best <= SINGULAR_TOL) return null; // singular
    if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot], a[col]];
      [perm[col], perm[pivot]] = [perm[pivot], perm[col]];
      sign = -sign;
    }
    for (let r = col + 1; r < n; r++) {
      const f = a[r][col] / a[col][col];
      a[r][col] = f; // store multiplier in L part
      for (let c = col + 1; c < n; c++) a[r][c] -= f * a[col][c];
    }
  }

  const L = identity(n);
  const U = zeros(n, n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (r > c) L.data[r][c] = a[r][c];
      else U.data[r][c] = a[r][c];
    }
  }
  const P = zeros(n, n);
  for (let r = 0; r < n; r++) P.data[r][perm[r]] = 1;
  return { L, U, P, sign };
}

/** Determinant via LU: sign(P) · Π U[i][i]. Singular matrix ⇒ 0. */
export function determinant(m: Matrix): number {
  requireSquare(m);
  const dec = lu(m);
  if (dec === null) return 0;
  let det = dec.sign;
  for (let i = 0; i < m.rows; i++) det *= dec.U.data[i][i];
  return det;
}

// Solve L·U·x = P·b for one right-hand-side vector via forward/back substitution.
function luSolveVec(dec: LU, b: number[]): number[] {
  const n = b.length;
  const pb = new Array<number>(n);
  for (let r = 0; r < n; r++) {
    // P·b: row r of P has its 1 at the original index; find it.
    let src = 0;
    for (let c = 0; c < n; c++) if (dec.P.data[r][c] === 1) { src = c; break; }
    pb[r] = b[src];
  }
  const y = new Array<number>(n).fill(0);
  for (let r = 0; r < n; r++) {
    let s = pb[r];
    for (let c = 0; c < r; c++) s -= dec.L.data[r][c] * y[c];
    y[r] = s; // L is unit-diagonal
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = y[r];
    for (let c = r + 1; c < n; c++) s -= dec.U.data[r][c] * x[c];
    x[r] = s / dec.U.data[r][r];
  }
  return x;
}

/** Solve A·x = b. Returns null if A is singular (|det| below tolerance). */
export function solve(A: Matrix, b: number[]): number[] | null {
  requireSquare(A);
  if (b.length !== A.rows) throw new RangeError(`b length ${b.length} ≠ matrix rows ${A.rows}`);
  const dec = lu(A);
  if (dec === null) return null;
  return luSolveVec(dec, b);
}

/** Inverse via LU-solving against each column of the identity. Null if singular. */
export function inverse(m: Matrix): Matrix | null {
  requireSquare(m);
  const dec = lu(m);
  if (dec === null) return null;
  const n = m.rows;
  const inv = zeros(n, n);
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0);
    e[j] = 1;
    const col = luSolveVec(dec, e);
    for (let i = 0; i < n; i++) inv.data[i][j] = col[i];
  }
  return inv;
}

/** Rank via tolerant row-echelon reduction with partial pivoting. */
export function rank(m: Matrix): number {
  const a = m.data.map((r) => r.slice());
  const rows = m.rows;
  const cols = m.cols;
  let r = 0;
  for (let col = 0; col < cols && r < rows; col++) {
    // pick largest-magnitude pivot in this column at/below current row
    let pivot = r;
    let best = Math.abs(a[r][col]);
    for (let i = r + 1; i < rows; i++) {
      const v = Math.abs(a[i][col]);
      if (v > best) { best = v; pivot = i; }
    }
    if (best <= RANK_TOL) continue; // no usable pivot in this column
    [a[r], a[pivot]] = [a[pivot], a[r]];
    const p = a[r][col];
    for (let i = 0; i < rows; i++) {
      if (i === r) continue;
      const f = a[i][col] / p;
      for (let c = col; c < cols; c++) a[i][c] -= f * a[r][c];
    }
    r++;
  }
  return r;
}
