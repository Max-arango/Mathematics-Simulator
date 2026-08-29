import * as M from "../../mathlab/linear/matrix.ts";
import { eigen } from "../../mathlab/linear/eigen.ts";
import { svd } from "../../mathlab/linear/svd.ts";
import { qr } from "../../mathlab/linear/qr.ts";
import { cholesky } from "../../mathlab/linear/cholesky.ts";
import { nullspace, columnSpace, conditionNumber } from "../../mathlab/linear/subspaces.ts";
import { type Complex } from "../../mathlab/complex/complex.ts";
import { type Vec } from "../../mathlab/linear/vector.ts";
import { ABS_TOL } from "../../mathlab/core/constants.ts";
import { type InspectionResult, type Capability, type Relation, prop, section } from "../types.ts";

const approxEq = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// Above this dimension the eigen/SVD spectral sections are skipped (Jacobi/QR are O(n³)
// per sweep and would stall an interactive inspector on large inputs). Documented cap.
const MAX_SPECTRAL_DIM = 64;
// κ above this flags an ill-conditioned matrix (near loss of numerical rank).
const ILL_CONDITIONED = 1e8;

export function inspectMatrix(data: number[][]): InspectionResult {
  const warnings: string[] = [];
  let A: M.Matrix;
  try { A = M.make(data); }
  catch (e) { return { kind: "matrix", identity: "Invalid matrix", sections: [], relations: [], capabilities: [], warnings: [e instanceof Error ? e.message : String(e)] }; }

  const { rows, cols } = A;
  const square = rows === cols;
  const caps: Capability[] = [];
  const sections = [];

  const shapeProps = [
    prop("Dimensions", `${rows} × ${cols}`, "exact"),
    prop("Shape", square ? "square" : "rectangular", "exact"),
  ];
  // Symmetry / structure (square only).
  let isSymmetric = false;
  if (square) {
    let symmetric = true, skew = true, diagonal = true, upper = true, lower = true, isId = true;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const x = A.data[i][j];
      if (!approxEq(x, A.data[j][i])) symmetric = false;
      if (!approxEq(x, -A.data[j][i])) skew = false;
      if (i !== j && !approxEq(x, 0)) diagonal = false;
      if (i > j && !approxEq(x, 0)) upper = false;
      if (i < j && !approxEq(x, 0)) lower = false;
      if (!approxEq(x, i === j ? 1 : 0)) isId = false;
    }
    isSymmetric = symmetric;
    shapeProps.push(prop("Symmetric", yn(symmetric), "numerical"));
    if (skew) shapeProps.push(prop("Skew-symmetric", "yes", "numerical"));
    if (isId) shapeProps.push(prop("Identity", "yes", "exact"));
    else if (diagonal) shapeProps.push(prop("Diagonal", "yes", "numerical"));
    else if (upper) shapeProps.push(prop("Upper triangular", "yes", "numerical"));
    else if (lower) shapeProps.push(prop("Lower triangular", "yes", "numerical"));
  }
  sections.push(section("Shape & structure", shapeProps));

  // Invariants.
  const invProps = [prop("Rank", String(M.rank(A)), "numerical")];
  if (square) {
    const det = M.determinant(A);
    const tr = M.trace(A);
    const invertible = Math.abs(det) > ABS_TOL;
    invProps.push(prop("Determinant", String(round(det)), "numerical"));
    invProps.push(prop("Trace", String(round(tr)), "numerical"));
    invProps.push(prop("Invertible", yn(invertible), "numerical", { note: `|det| ${invertible ? ">" : "≤"} ${ABS_TOL}` }));
    caps.push("determinant");
    if (invertible) caps.push("inverse");
    if (!invertible) warnings.push("Matrix is singular (|det| ≤ tolerance): no inverse.");
  } else {
    invProps.push(prop("Determinant", "not applicable (non-square)", "notApplicable"));
  }
  sections.push(section("Invariants (numerical, LU-based)", invProps));

  const relations: Relation[] = [];
  const T = M.transpose(A);
  relations.push({ label: "Transpose Aᵀ", description: `${cols}×${rows}`, target: { kind: "matrix" as const, data: T.data } });
  if (square && Math.abs(M.determinant(A)) > ABS_TOL) {
    const inv = M.inverse(A);
    if (inv) relations.push({ label: "Inverse A⁻¹", target: { kind: "matrix" as const, data: inv.data } });
  }

  // Geometric action (2×2).
  if (square && rows === 2) {
    caps.push("geometricAction");
    const det = M.determinant(A);
    const [[a, b], [c, d]] = A.data;
    const actions: string[] = [];
    actions.push(`area scaling |det| = ${round(Math.abs(det))}`);
    if (det < 0) actions.push("orientation reversed (contains a reflection)");
    if (approxEq(a, d) && approxEq(b, 0) && approxEq(c, 0)) actions.push(`uniform/axis scaling`);
    if (approxEq(a * a + c * c, 1) && approxEq(b * b + d * d, 1) && approxEq(a * b + c * d, 0)) actions.push(`rotation/reflection (orthogonal), angle ≈ ${round((Math.atan2(c, a) * 180) / Math.PI)}°`);
    if (approxEq(a, 1) && approxEq(d, 1) && (!approxEq(b, 0) || !approxEq(c, 0))) actions.push("shear");
    sections.push(section("Geometric action (2×2 linear map)", actions.map((x, i) => prop(`Effect ${i + 1}`, x, "inferred"))));
  }

  // ── Spectral / decomposition / subspace inspection ─────────────────────────────────
  // All of these ride on eigen (O(n³)/sweep) or SVD; skip them past a documented size cap
  // so an interactive inspector never stalls on a large matrix.
  const tooLarge = Math.max(rows, cols) > MAX_SPECTRAL_DIM;
  if (tooLarge) {
    warnings.push(`Matrix too large for full spectral inspection (limit ${MAX_SPECTRAL_DIM}): eigenstructure, decomposition, conditioning and subspace sections skipped.`);
  } else {
    // Eigenstructure (square only) — general eigen() path (handles complex/defective too).
    // Documented single path: we always use eigen() rather than branching to eigSymmetric
    // for symmetric input; for symmetric A the spectrum is real (noted below) but the same
    // numerical confidence applies.
    if (square) {
      const e = eigen(A);
      e.warnings.forEach((w) => warnings.push(w));
      const eigProps = [];
      const realNote = isSymmetric ? "real (symmetric matrix)" : undefined;
      let i = 0, k = 1;
      while (i < e.values.length) {
        const z = e.values[i];
        const next = e.values[i + 1];
        const conj = next && !isRealEig(z) && isConjugate(z, next);
        if (conj) {
          const re = round(z.re), im = round(Math.abs(z.im));
          eigProps.push(prop(`λ${k}, λ${k + 1}`, `${re} ± ${im}i`, "numerical",
            { latex: `\\lambda_{${k}},\\lambda_{${k + 1}} = ${re} \\pm ${im}i` }));
          i += 2; k += 2;
        } else {
          eigProps.push(prop(`λ${k}`, fmtEigVal(z), "numerical",
            { latex: `\\lambda_{${k}} = ${fmtEigLatex(z)}`, note: realNote }));
          i += 1; k += 1;
        }
      }
      eigProps.push(prop("Diagonalizable",
        e.diagonalizable === null ? "indeterminate" : yn(e.diagonalizable), "numerical",
        e.diagonalizable === null
          ? { note: "repeated complex eigenvalue — geometric multiplicity not computed over ℝ" }
          : {}));
      if (e.algebraicMultiplicity.some((m) => m > 1)) {
        const parts = e.algebraicMultiplicity.map((am, idx) => {
          const gm = e.geometricMultiplicity[idx];
          return `alg ${am} / geo ${Number.isNaN(gm) ? "?" : gm}`;
        });
        eigProps.push(prop("Multiplicities (per distinct λ)", parts.join("; "), "numerical"));
      } else {
        eigProps.push(prop("Eigenvalues distinct", "yes", "numerical"));
      }
      sections.push(section("Eigenstructure", eigProps));
      caps.push("eigen");
      relations.push({ label: "Eigenvalues", description: "spectrum via QR / Jacobi iteration", target: null });
    }

    // Decompositions — availability + key structural facts.
    const decompProps = [];
    if (square) {
      const dec = M.lu(A);
      decompProps.push(dec
        ? prop("LU (partial pivoting)", `P·A = L·U (pivot sign ${dec.sign >= 0 ? "+1" : "−1"})`, "numerical")
        : prop("LU (partial pivoting)", "singular — no LU", "numerical"));
    } else {
      decompProps.push(prop("LU", "not applicable (non-square)", "notApplicable"));
    }
    if (rows >= cols) {
      qr(A); // succeeds for m ≥ n; existence + shape is the reported fact
      decompProps.push(prop("QR", `A = Q·R, Q ${rows}×${cols} orthonormal columns, R ${cols}×${cols} upper-triangular`, "numerical"));
    } else {
      decompProps.push(prop("QR", "not applicable (requires rows ≥ cols)", "notApplicable"));
    }
    if (square && isSymmetric) {
      decompProps.push(prop("Cholesky", cholesky(A) ? "SPD ✓ (A = L·Lᵀ)" : "not SPD", "numerical"));
    } else if (square) {
      decompProps.push(prop("Cholesky", "not applicable (non-symmetric)", "notApplicable"));
    }
    const s = svd(A);
    decompProps.push(s
      ? prop("SVD", `A = U·Σ·Vᵀ, ${s.rank} singular value(s): ${s.S.map(round).join(", ")}`, "numerical",
          { latex: `\\sigma = (${s.S.map(round).join(",\\ ")})` })
      : prop("SVD", "rank 0 (A ≈ 0)", "numerical"));
    sections.push(section("Decompositions", decompProps));
    relations.push({ label: "SVD", description: "singular value decomposition", target: null });

    // Conditioning — 2-norm condition number + SVD (condition-aware) rank.
    const kappa = conditionNumber(A);
    const condProps = [
      prop("Condition number κ₂", Number.isFinite(kappa) ? String(round(kappa)) : "∞", "numerical",
        { note: "2-norm σ_max/σ_min; SVD forms AᵀA, so finite κ saturates near √eps for ill-conditioned A (FINDING-002)" }),
    ];
    if (s) {
      condProps.push(prop("Rank (SVD, condition-aware)", String(s.rank), "numerical",
        { note: "relative singular-value cutoff — supersedes the absolute LU/Gauss rank above (FINDING-002)" }));
    }
    sections.push(section("Conditioning", condProps));
    if (!Number.isFinite(kappa)) {
      warnings.push("Matrix is ill-conditioned: κ₂ = ∞ (singular / numerically rank-deficient).");
    } else if (kappa > ILL_CONDITIONED) {
      warnings.push(`Matrix is ill-conditioned (κ₂ ≈ ${round(kappa)} > ${ILL_CONDITIONED}): solutions may lose precision.`);
    }

    // Subspaces — rank / nullity / bases (RREF-based, internally consistent).
    const ns = nullspace(A);
    const cs = columnSpace(A);
    const rrefRank = cs.length;
    const subProps = [
      prop("Rank", String(rrefRank), "numerical", { note: "algebraic (RREF) rank; see Conditioning for the SVD condition-aware rank" }),
      prop("Nullity (right)", String(cols - rrefRank), "numerical", { note: "dim null space = cols − rank" }),
      prop("Column-space dimension", String(cs.length), "numerical"),
    ];
    if (ns.length === 0) {
      subProps.push(prop("Null space", "trivial {0}", "numerical"));
    } else {
      ns.forEach((v, idx) => subProps.push(prop(`Null-space basis v${idx + 1}`,
        `(${v.map(round).join(", ")})`, "numerical",
        v.length <= 8 ? { latex: colVec(v) } : {})));
      relations.push({ label: "Nullspace", description: `${ns.length}-dimensional`, target: null });
    }
    sections.push(section("Subspaces", subProps));
  }

  return {
    kind: "matrix",
    identity: `${rows}×${cols} matrix`,
    latex: `\\begin{pmatrix}${data.map((r) => r.map(round).join(" & ")).join(" \\\\ ")}\\end{pmatrix}`,
    sections, relations, capabilities: caps, warnings,
  };
}

const yn = (b: boolean) => (b ? "yes" : "no");
const round = (v: number) => Number(v.toPrecision(6));

// ── Eigenvalue / vector rendering helpers ──────────────────────────────────────────────
// A general eigenvalue is Complex{re,im}; treat it as real when the imaginary part is
// negligible relative to the magnitude (same relative policy as eigen.ts's IMAG_TOL).
const isRealEig = (z: Complex) => Math.abs(z.im) <= 1e-9 * Math.max(1, Math.abs(z.re), Math.abs(z.im));

// True when `next` is the complex conjugate of `z` (used to group ± pairs in the display).
const isConjugate = (z: Complex, next: Complex) =>
  Math.abs(z.re - next.re) <= 1e-6 * Math.max(1, Math.abs(z.re)) &&
  Math.abs(z.im + next.im) <= 1e-6 * Math.max(1, Math.abs(z.im));

// Human-readable single eigenvalue: bare real, else "a + bi" / "a − bi".
const fmtEigVal = (z: Complex) => {
  if (isRealEig(z)) return String(round(z.re));
  const im = round(Math.abs(z.im));
  return `${round(z.re)} ${z.im >= 0 ? "+" : "−"} ${im}i`;
};

// KaTeX form of a single eigenvalue.
const fmtEigLatex = (z: Complex) => {
  if (isRealEig(z)) return `${round(z.re)}`;
  const im = round(Math.abs(z.im));
  return `${round(z.re)} ${z.im >= 0 ? "+" : "-"} ${im}i`;
};

// KaTeX column vector (small vectors only; caller gates on length).
const colVec = (v: Vec) => `\\begin{pmatrix}${v.map(round).join(" \\\\ ")}\\end{pmatrix}`;
