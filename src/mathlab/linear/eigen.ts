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
import { make, identity, sub, scale, type Matrix } from "./matrix.ts";
import { normalize, type Vec } from "./vector.ts";
import { C, abs, type Complex } from "../complex/complex.ts";
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

// ===========================================================================
// GENERAL (non-symmetric, possibly-complex-spectrum) eigenvalues via QR iteration.
//
// Lives in this file (alongside eigSymmetric) because it is the same problem for a
// broader input class; eigSymmetric is left untouched — it stays the preferred path
// for symmetric matrices (real, backward-stable, accurate eigenvectors for clusters).
//
// ALGORITHM (n ≥ 3):
//   1. Householder reduction to upper Hessenberg: H = QᵀAQ (similarity → same spectrum).
//   2. Francis IMPLICIT DOUBLE-SHIFT QR with deflation, driving H to real Schur form
//      (quasi-triangular): 1×1 diagonal blocks are real eigenvalues, 2×2 diagonal
//      blocks carry a complex-conjugate pair. The double shift stays in REAL arithmetic
//      yet resolves complex pairs (a single real Wilkinson shift cannot — it oscillates
//      on equal-modulus conjugates). The QR driver is a faithful port of the classic
//      Numerical-Recipes `hqr` (Wilkinson double shift, exceptional shifts to break
//      stalls). Eigenvalues are read from the 1×1 (real) and 2×2 (quadratic → complex.ts)
//      blocks. n = 1, 2 use the exact analytic formula (encouraged, and exact for the
//      defective 2×2 discriminant-zero case).
//
// PRECISION: for well-separated, non-defective spectra eigenvalues are accurate to
//   ~1e-10…1e-12. DEFECTIVE / tightly-clustered eigenvalues of a general matrix are
//   ill-conditioned and lose ~half the digits (≈√eps) — this is intrinsic to the problem,
//   not a bug; multiplicity clustering (below) is a heuristic and can mis-group such cases.
//
// EIGENVECTORS: computed only for REAL eigenvalues, as an orthonormal-ish basis of the
//   null space of (A − λI) via RREF (geometric multiplicity = dim null space = n − rank).
//   COMPLEX eigenvectors are NOT computed (would need a complex matrix type) → those
//   entries are `null` with a warning. For a defective eigenvalue only its `geo` genuine
//   eigenvectors are returned; the remaining algebraic copies are `null` + a warning.
//
// FAILURE MODEL (matches the rest of linear/):
//   • non-square input                → RangeError (programmer error).
//   • QR fails to converge within cap → converged:false + warning + BEST-EFFORT values
//     (the current active-block diagonal); never silently returned as if converged.
//
// UNSUPPORTED / NOT GUARANTEED: complex eigenvectors; geometric multiplicity of a
//   REPEATED complex eigenvalue (→ NaN, diagonalizable→null); reliable multiplicity
//   clustering for strongly defective general matrices; `diagonalizable` is over ℂ.

/** Relative tolerance below which a Hessenberg sub-diagonal counts as zero (deflation). */
const HQR_EPS = 1e-14;
/** Per-eigenvalue QR iteration cap (a multiple of the shared solver cap is unnecessary
 *  here — one MAX_ITERATIONS budget per eigenvalue with periodic exceptional shifts is
 *  ample; exceeding it means genuine non-convergence, reported honestly). */
const HQR_MAX_ITERS = MAX_ITERATIONS;
/** |Im| ≤ this·(1+|Re|) ⇒ eigenvalue treated as real (real-null-space eigenvector path). */
const IMAG_TOL = 1e-9;
/** Distinct eigenvalues within this·max(1,ρ) (ρ = spectral radius) are one cluster for
 *  ALGEBRAIC multiplicity. Heuristic: too loose merges near-but-distinct eigenvalues,
 *  too tight splits a defective/rounded repeat. 1e-6 relative is a pragmatic middle. */
const CLUSTER_TOL = 1e-6;

const SIGN = (a: number, b: number): number => (b >= 0 ? Math.abs(a) : -Math.abs(a));
const isRealValue = (z: Complex): boolean => Math.abs(z.im) <= IMAG_TOL * (1 + Math.abs(z.re));

export interface EigenResult {
  /** n eigenvalues, sorted by DESCENDING |value|; ties broken by Im desc then Re desc
   *  (so a conjugate pair lists +Im before −Im). Real ones have im ≈ 0. */
  values: Complex[];
  /** Per eigenvalue (aligned to `values`): a real eigenvector for a REAL eigenvalue whose
   *  null space still had a spare basis vector; `null` for complex eigenvalues and for the
   *  surplus copies of a defective eigenvalue. */
  vectors: (Vec | null)[];
  /** false ⇒ QR hit the iteration cap; `values` are best-effort, not trustworthy. */
  converged: boolean;
  /** Per DISTINCT eigenvalue (clustered), in the same descending-|value| order. */
  algebraicMultiplicity: number[];
  /** Per distinct eigenvalue: dim null(A−λI) for real λ; 1 for a simple complex λ; NaN for
   *  a REPEATED complex λ (real null space inapplicable, complex rank not computed). */
  geometricMultiplicity: number[];
  /** true / false where determinable (over ℂ); null when a repeated complex eigenvalue
   *  makes its geometric multiplicity — and hence the verdict — inconclusive here. */
  diagonalizable: boolean | null;
  warnings: string[];
}

/**
 * Eigenvalues (and real eigenvectors) of a GENERAL real square matrix. Throws RangeError
 * for non-square input. See the file section header for the algorithm, precision limits,
 * and exactly which cases are unsupported (complex eigenvectors; repeated-complex geometry).
 */
export function eigen(A: Matrix): EigenResult {
  if (A.rows !== A.cols) {
    throw new RangeError(`eigen requires a square matrix; got ${A.rows}x${A.cols}`);
  }
  const n = A.rows;
  const warnings: string[] = [];

  // 1) Raw eigenvalues (order-agnostic at this point).
  let raw: Complex[];
  let converged = true;
  if (n === 1) {
    raw = [C(A.data[0][0], 0)];
  } else if (n === 2) {
    raw = eig2x2(A.data[0][0], A.data[0][1], A.data[1][0], A.data[1][1]);
  } else {
    const res = hqrEigenvalues(hessenberg(A.data, n), n);
    raw = res.values;
    converged = res.converged;
  }
  if (!converged) {
    warnings.push(
      `QR iteration did not converge within ${HQR_MAX_ITERS} iterations per eigenvalue; ` +
        `values are best-effort (converged=false).`,
    );
  }

  // 2) Sort by descending |value|; deterministic tie-break so conjugates order +Im, −Im.
  const values = [...raw].sort((p, q) => {
    const d = abs(q) - abs(p);
    if (Math.abs(d) > 1e-12) return d;
    if (Math.abs(q.im - p.im) > 1e-12) return q.im - p.im;
    return q.re - p.re;
  });

  // 3) Cluster into distinct eigenvalues → algebraic multiplicity (heuristic tolerance).
  const spectralRadius = values.reduce((mx, z) => Math.max(mx, abs(z)), 0);
  const tol = CLUSTER_TOL * Math.max(1, spectralRadius);
  interface Group { re: number; im: number; count: number; indices: number[]; sumRe: number; sumIm: number; }
  const groups: Group[] = [];
  values.forEach((z, idx) => {
    let g = groups.find((gr) => Math.hypot(gr.re - z.re, gr.im - z.im) <= tol);
    if (!g) {
      g = { re: z.re, im: z.im, count: 0, indices: [], sumRe: 0, sumIm: 0 };
      groups.push(g);
    }
    g.count++;
    g.indices.push(idx);
    g.sumRe += z.re;
    g.sumIm += z.im;
    g.re = g.sumRe / g.count;
    g.im = g.sumIm / g.count;
  });

  // 4) Eigenvectors + geometric multiplicity + diagonalizability, per distinct eigenvalue.
  const vectors: (Vec | null)[] = new Array<Vec | null>(n).fill(null);
  const algebraicMultiplicity: number[] = [];
  const geometricMultiplicity: number[] = [];
  let defective = false;
  let undeterminable = false;
  let complexWarned = false;

  for (const g of groups) {
    algebraicMultiplicity.push(g.count);
    if (isRealValue(C(g.re, g.im))) {
      const lambda = g.re;
      const basis = nullSpaceBasis(sub(A, scale(identity(n), lambda)));
      const geo = basis.length;
      geometricMultiplicity.push(geo);
      g.indices.forEach((pos, k) => { vectors[pos] = k < geo ? basis[k] : null; });
      if (geo < g.count) {
        defective = true;
        warnings.push(
          `defective eigenvalue λ≈${lambda.toPrecision(6)}: geometric multiplicity ${geo} < ` +
            `algebraic multiplicity ${g.count}; only ${geo} independent real eigenvector(s) returned.`,
        );
      }
    } else {
      // Complex eigenvalue: real-null-space eigenvector is inapplicable.
      if (g.count === 1) {
        geometricMultiplicity.push(1); // a SIMPLE eigenvalue always has geometric mult 1
      } else {
        geometricMultiplicity.push(NaN);
        undeterminable = true;
      }
      if (!complexWarned) {
        warnings.push(
          `complex eigenvalue(s) present: complex eigenvectors are not computed here; ` +
            `those vector entries are null.`,
        );
        complexWarned = true;
      }
    }
  }

  const diagonalizable: boolean | null = defective ? false : undeterminable ? null : true;

  return {
    values,
    vectors,
    converged,
    algebraicMultiplicity,
    geometricMultiplicity,
    diagonalizable,
    warnings,
  };
}

/** Exact 2×2 spectrum via the characteristic quadratic λ² − (tr)λ + det = 0. */
function eig2x2(a: number, b: number, c: number, d: number): Complex[] {
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return [C((tr + s) / 2, 0), C((tr - s) / 2, 0)];
  }
  const im = Math.sqrt(-disc) / 2;
  return [C(tr / 2, im), C(tr / 2, -im)];
}

/** Householder reduction of an n×n matrix to a similar upper-Hessenberg matrix (n ≥ 3).
 *  Q is not accumulated — eigenvectors are recovered separately from (A − λI). */
function hessenberg(src: number[][], n: number): number[][] {
  const h = src.map((row) => row.slice());
  for (let k = 0; k < n - 2; k++) {
    let normx = 0;
    for (let i = k + 1; i < n; i++) normx += h[i][k] * h[i][k];
    normx = Math.sqrt(normx);
    if (normx <= EPSILON) continue; // column already ≈ 0 below sub-diagonal
    const alpha = h[k + 1][k] >= 0 ? -normx : normx; // −sign(x₀)·‖x‖ avoids cancellation
    const v = new Array<number>(n).fill(0);
    v[k + 1] = h[k + 1][k] - alpha;
    for (let i = k + 2; i < n; i++) v[i] = h[i][k];
    let vn2 = 0;
    for (let i = k + 1; i < n; i++) vn2 += v[i] * v[i];
    if (vn2 <= EPSILON * EPSILON) continue;
    const beta = 2 / vn2;
    // H ← (I − β v vᵀ)·H : rows k+1..n-1, all columns.
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let i = k + 1; i < n; i++) s += v[i] * h[i][j];
      s *= beta;
      for (let i = k + 1; i < n; i++) h[i][j] -= s * v[i];
    }
    // H ← H·(I − β v vᵀ) : all rows, columns k+1..n-1.
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = k + 1; j < n; j++) s += h[i][j] * v[j];
      s *= beta;
      for (let j = k + 1; j < n; j++) h[i][j] -= s * v[j];
    }
  }
  return h;
}

/**
 * Francis implicit double-shift QR on an upper-Hessenberg matrix → real Schur form,
 * reading eigenvalues from 1×1 (real) and 2×2 (conjugate-pair) diagonal blocks.
 *
 * Faithful port of Numerical-Recipes `hqr` (1-indexed arithmetic preserved via a padded
 * working array to eliminate index-translation bugs), with two deliberate changes:
 *   • the machine-eps "x+s == s" negligibility trick is replaced by an explicit relative
 *     tolerance HQR_EPS (double precision has no float-truncation shortcut);
 *   • non-convergence returns { converged:false } with best-effort diagonal values instead
 *     of aborting — this solver reports failure, it does not throw on numerical stalls.
 * Exceptional (ad-hoc) shifts fire every 10 iterations to break cyclic stalls.
 */
function hqrEigenvalues(H0: number[][], n: number): { values: Complex[]; converged: boolean } {
  const a: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) a[i][j] = H0[i - 1][j - 1];
  const wr = new Array<number>(n + 1).fill(0);
  const wi = new Array<number>(n + 1).fill(0);

  // NR keeps these at function scope so the m-search leaves p,q,r set for the QR sweep.
  let nn = 0, m = 0, l = 0, k = 0, j = 0, its = 0, i = 0, mmin = 0;
  let z = 0, y = 0, x = 0, w = 0, v = 0, u = 0, t = 0, s = 0, r = 0, q = 0, p = 0, anorm = 0;
  let converged = true;

  for (i = 1; i <= n; i++) for (j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i][j]);
  nn = n;
  t = 0;
  while (nn >= 1) {
    its = 0;
    do {
      for (l = nn; l >= 2; l--) {
        s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
        if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) <= HQR_EPS * s) { a[l][l - 1] = 0; break; }
      }
      x = a[nn][nn];
      if (l === nn) {
        // one real root
        wr[nn] = x + t;
        wi[nn] = 0;
        nn--;
      } else {
        y = a[nn - 1][nn - 1];
        w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          // trailing 2×2 block → two roots (real pair or complex conjugate pair)
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + SIGN(z, p);
            wr[nn - 1] = x + z;
            wr[nn] = x + z;
            if (z !== 0) wr[nn] = x - w / z;
            wi[nn - 1] = 0;
            wi[nn] = 0;
          } else {
            wr[nn - 1] = x + p;
            wr[nn] = x + p;
            wi[nn] = z;
            wi[nn - 1] = -z;
          }
          nn -= 2;
        } else {
          // no root yet → do a double-shift QR step
          if (its >= HQR_MAX_ITERS) { converged = false; break; }
          if (its !== 0 && its % 10 === 0) {
            // exceptional shift to dislodge a stall
            t += x;
            for (i = 1; i <= nn; i++) a[i][i] -= x;
            s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          // find two consecutive small sub-diagonals; leaves p,q,r as the shift vector.
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m];
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
            q = a[m + 1][m + 1] - z - r - s;
            r = a[m + 2][m + 1];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (m === l) break;
            u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u <= HQR_EPS * v) break;
          }
          for (i = m + 2; i <= nn; i++) {
            a[i][i - 2] = 0;
            if (i !== m + 2) a[i][i - 3] = 0;
          }
          // chase the bulge with Householder reflectors (the Francis QR sweep)
          for (k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1];
              q = a[k + 1][k - 1];
              r = 0;
              if (k !== nn - 1) r = a[k + 2][k - 1];
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) { p /= x; q /= x; r /= x; }
            }
            s = SIGN(Math.sqrt(p * p + q * q + r * r), p);
            if (s !== 0) {
              if (k === m) {
                if (l !== m) a[k][k - 1] = -a[k][k - 1];
              } else {
                a[k][k - 1] = -s * x;
              }
              p += s;
              x = p / s;
              y = q / s;
              z = r / s;
              q /= p;
              r /= p;
              for (j = k; j <= nn; j++) {
                p = a[k][j] + q * a[k + 1][j];
                if (k !== nn - 1) {
                  p += r * a[k + 2][j];
                  a[k + 2][j] -= p * z;
                }
                a[k + 1][j] -= p * y;
                a[k][j] -= p * x;
              }
              mmin = nn < k + 3 ? nn : k + 3;
              for (i = l; i <= mmin; i++) {
                p = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) {
                  p += z * a[i][k + 2];
                  a[i][k + 2] -= p * r;
                }
                a[i][k + 1] -= p * q;
                a[i][k] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
    if (!converged) break;
  }
  if (!converged) {
    // best-effort: whatever is left on the active-block diagonal, flagged via converged.
    for (i = 1; i <= nn; i++) { wr[i] = a[i][i] + t; wi[i] = 0; }
  }

  const values: Complex[] = [];
  for (i = 1; i <= n; i++) values.push(C(wr[i], wi[i]));
  return { values, converged };
}

/** Basis of the null space of M via tolerant RREF; returns one unit vector per free column
 *  (empty ⇒ M has full rank). Used to recover real eigenvectors of (A − λI). */
function nullSpaceBasis(M: Matrix): Vec[] {
  const rows = M.rows;
  const cols = M.cols;
  const a = M.data.map((row) => row.slice());
  let maxAbs = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) maxAbs = Math.max(maxAbs, Math.abs(a[i][j]));
  const tol = ABS_TOL * Math.max(1, maxAbs);

  const pivotCols: number[] = [];
  let row = 0;
  for (let col = 0; col < cols && row < rows; col++) {
    let piv = row;
    let best = Math.abs(a[row][col]);
    for (let i = row + 1; i < rows; i++) {
      const val = Math.abs(a[i][col]);
      if (val > best) { best = val; piv = i; }
    }
    if (best <= tol) continue; // free column
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
