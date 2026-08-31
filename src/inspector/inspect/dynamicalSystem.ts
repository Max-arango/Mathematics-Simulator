// Dynamical-system inspector — the first computational-domain inspector (spec §65).
// Rebuilds the system from its stored source (makeSystem parses + validates), then reports
// three sections: STRUCTURE (state vars, kind, field equations, params), EQUILIBRIA (Newton
// candidates, honest about their numerical/seed-dependent nature), and STABILITY (linearized
// classification of each equilibrium with its Jacobian spectrum). React-free.
//
// HONESTY: equilibria are NUMERICAL CANDIDATES from a finite seed grid (findEquilibria's own
// note is surfaced as a warning), and every stability verdict is a LINEAR one carried at
// "numerical" confidence — a "center" especially is a linear reading nonlinear terms can undo.
//
// COST GUARD: the auto seed grid is gridPoints^dim, so equilibria/stability are skipped past
// a small state dimension (MAX_EQUILIBRIA_DIM) with a warning — an interactive inspector must
// not stall (and findEquilibria itself throws past ~5-D). Raise the cap when a caller supplies
// explicit seeds. ponytail: O(gridPoints^dim) auto grid, cap it; wire seeds through if needed.
import { makeSystem, type SystemKind, type DynamicalSystem } from "../../mathlab/dynamics/system.ts";
import { findEquilibria } from "../../mathlab/dynamics/equilibria.ts";
import { classifyEquilibrium } from "../../mathlab/dynamics/stability.ts";
import { InvalidInputError } from "../../mathlab/core/errors.ts";
import { print } from "../../mathlab/core/print.ts";
import { type Complex } from "../../mathlab/complex/complex.ts";
import { type InspectionResult, type Capability, type Relation, type Property, prop, section } from "../types.ts";

// Beyond this state dimension the auto seed grid (gridPoints^dim) is skipped: too costly for
// an interactive inspector, and findEquilibria throws when the grid exceeds its own cap.
const MAX_EQUILIBRIA_DIM = 4;

export function inspectDynamicalSystem(
  vars: string[],
  fieldSource: string[],
  params: Record<string, number>,
  systemKind: SystemKind,
): InspectionResult {
  // Rebuild + validate. Bad input (unknown symbol, arity mismatch, …) degrades gracefully.
  let sys: DynamicalSystem;
  try {
    sys = makeSystem(vars, fieldSource, params, systemKind);
  } catch (e) {
    return {
      kind: "dynamicalSystem",
      identity: "Invalid dynamical system",
      sections: [], relations: [], capabilities: [],
      warnings: [e instanceof InvalidInputError ? e.message : String(e)],
    };
  }

  const n = sys.vars.length;
  const warnings: string[] = [];
  const caps: Capability[] = ["vectorField"];
  const sections = [];

  // ── Structure ───────────────────────────────────────────────────────────────────────
  const structProps: Property[] = [
    prop("State variables", sys.vars.join(", "), "exact"),
    prop("Kind", systemKind, "exact", { note: systemKind === "discrete" ? "map: xₙ₊₁ = F(xₙ)" : "flow: ẋ = F(x)" }),
    prop("Dimension", `ℝ^${n}`, "exact"),
  ];
  sys.vars.forEach((v, i) => {
    const rhs = print(sys.field[i]);
    structProps.push(prop(lhsText(v, systemKind), rhs, "exact", { latex: `${lhsTex(v, systemKind)} = ${latexish(rhs)}` }));
  });
  const paramKeys = Object.keys(sys.params);
  if (paramKeys.length > 0) {
    structProps.push(prop("Parameters", paramKeys.map((k) => `${k} = ${round(sys.params[k])}`).join(", "), "exact"));
  }
  sections.push(section("Structure", structProps));

  // ── Equilibria + Stability (guarded by dimension) ─────────────────────────────────────
  if (n > MAX_EQUILIBRIA_DIM) {
    warnings.push(
      `Equilibria & stability skipped: state dimension ${n} exceeds the auto-search cap ` +
        `${MAX_EQUILIBRIA_DIM} (the seed grid is gridPoints^dim). Provide explicit seeds to search a higher-dimensional system.`,
    );
  } else {
    let points: number[][] = [];
    let note = "";
    try {
      ({ points, note } = findEquilibria(sys));
    } catch (e) {
      warnings.push(`Equilibria search failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const eqProps: Property[] = [];
    if (points.length === 0) {
      eqProps.push(prop("Found", "none in the searched region", "numerical",
        { note: "Newton from the default seed grid found no equilibrium — widen the range or pass explicit seeds." }));
    } else {
      points.forEach((p, i) => eqProps.push(prop(`Equilibrium ${i + 1}`, fmtPoint(p), "numerical",
        { latex: `(${p.map(round).join(",\\ ")})`, note: `residual ‖F‖ ≈ 0` })));
    }
    sections.push(section("Equilibria (numerical candidates)", eqProps));
    caps.push("equilibria");
    if (note) warnings.push(note);

    if (points.length > 0) {
      const stabProps: Property[] = [];
      points.forEach((p, i) => {
        const s = classifyEquilibrium(sys, p);
        stabProps.push(prop(`Equilibrium ${i + 1}`, s.type, s.confidence, { note: `at ${fmtPoint(p)}: ${s.reason}` }));
        stabProps.push(prop(`Equilibrium ${i + 1} spectrum`, s.eigenvalues.map(fmtComplex).join(", "), s.confidence,
          { latex: `\\lambda = ${s.eigenvalues.map(fmtComplexTex).join(",\\ ")}` }));
      });
      sections.push(section("Stability (linearized, Hartman–Grobman)", stabProps));
      caps.push("stability");
    }
  }

  // ── Relations — describe-only cross-links (no navigable target yet). ──────────────────
  const relations: Relation[] = [
    { label: "Equilibria", description: systemKind === "discrete" ? "fixed points F(x) = x" : "rest points F(x) = 0", target: null },
    { label: "Jacobian", description: "linearization ∂Fᵢ/∂xⱼ at an equilibrium", target: null },
    { label: "Vector field", description: `the ${systemKind} field F over state space`, target: null },
  ];

  const eqs = sys.vars.map((v, i) => `${lhsTex(v, systemKind)} = ${latexish(print(sys.field[i]))}`);
  return {
    kind: "dynamicalSystem",
    identity: `${systemKind === "discrete" ? "Discrete dynamical system (map)" : "Continuous dynamical system (flow)"} on ℝ^${n}`,
    latex: eqs.length === 1 ? eqs[0] : `\\begin{cases}${eqs.join(" \\\\ ")}\\end{cases}`,
    sections, relations, capabilities: caps, warnings,
  };
}

// ── Rendering helpers (local, mirroring the per-inspector house style) ──────────────────
const round = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(6)) : v);
const fmtPoint = (p: number[]) => `(${p.map(round).join(", ")})`;

// LHS of a field equation, text and KaTeX: dx/dt / ẋ (flow) vs x(n+1) / x_{n+1} (map).
const lhsText = (v: string, kind: SystemKind) => (kind === "discrete" ? `${v}(n+1)` : `d${v}/dt`);
const lhsTex = (v: string, kind: SystemKind) => (kind === "discrete" ? `${v}_{n+1}` : `\\dot{${v}}`);

// A general eigenvalue is Complex{re,im}; treat it as real when Im is negligible.
const isReal = (z: Complex) => Math.abs(z.im) <= 1e-9 * Math.max(1, Math.abs(z.re), Math.abs(z.im));
const fmtComplex = (z: Complex): string =>
  isReal(z) ? String(round(z.re)) : `${round(z.re)} ${z.im >= 0 ? "+" : "−"} ${round(Math.abs(z.im))}i`;
const fmtComplexTex = (z: Complex): string =>
  isReal(z) ? `${round(z.re)}` : `${round(z.re)} ${z.im >= 0 ? "+" : "-"} ${round(Math.abs(z.im))}i`;

// Lightweight print→LaTeX (same policy as the expression inspector): our printer already
// emits ^, /, ·, function names; wrap function names with \ and turn · into \cdot.
function latexish(s: string): string {
  return s
    .replace(/\bpi\b/g, "\\pi").replace(/·/g, "\\cdot ")
    .replace(/\b(sin|cos|tan|sec|csc|cot|asin|acos|atan|sinh|cosh|tanh|exp|ln|log|sqrt|cbrt|abs|sign)\b/g, "\\$1");
}
