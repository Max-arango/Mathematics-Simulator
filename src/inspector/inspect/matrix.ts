import * as M from "../../mathlab/linear/matrix.ts";
import { ABS_TOL } from "../../mathlab/core/constants.ts";
import { type InspectionResult, type Capability, prop, section } from "../types.ts";

const approxEq = (a: number, b: number) => Math.abs(a - b) < 1e-9;

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

  const relations = [];
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

  return {
    kind: "matrix",
    identity: `${rows}×${cols} matrix`,
    latex: `\\begin{pmatrix}${data.map((r) => r.map(round).join(" & ")).join(" \\\\ ")}\\end{pmatrix}`,
    sections, relations, capabilities: caps, warnings,
  };
}

const yn = (b: boolean) => (b ? "yes" : "no");
const round = (v: number) => Number(v.toPrecision(6));
