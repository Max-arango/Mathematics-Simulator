import { parse } from "../../mathlab/core/parser.ts";
import { print } from "../../mathlab/core/print.ts";
import { freeVars, type Node } from "../../mathlab/core/ast.ts";
import { derivative } from "../../mathlab/calculus/derivative.ts";
import { gradient, hessian, laplacian } from "../../mathlab/calculus/vectorCalculus.ts";
import { compile1 } from "../../mathlab/core/eval.ts";
import { findRoots } from "../../mathlab/analysis/roots.ts";
import { type InspectionResult, type Section, type Relation, type Capability, prop, section } from "../types.ts";

interface Struct { nodes: number; depth: number; ops: Set<string>; funcs: Set<string>; vars: Set<string>; consts: Set<string> }

function analyze(n: Node, s: Struct, d = 1): void {
  s.nodes++;
  s.depth = Math.max(s.depth, d);
  switch (n.t) {
    case "num": break;
    case "const": s.consts.add(n.name); break;
    case "var": s.vars.add(n.name); break;
    case "neg": s.ops.add("neg"); analyze(n.a, s, d + 1); break;
    case "call": s.funcs.add(n.name); n.args.forEach((a) => analyze(a, s, d + 1)); break;
    default: s.ops.add(n.t); analyze(n.a, s, d + 1); analyze(n.b, s, d + 1);
  }
}

/** Polynomial degree in `v` (other variables treated as constant coefficients); null if not a polynomial. */
function polyDegree(n: Node, v: string): number | null {
  switch (n.t) {
    case "num": case "const": return 0;
    case "var": return n.name === v ? 1 : 0;
    case "neg": return polyDegree(n.a, v);
    case "add": case "sub": { const a = polyDegree(n.a, v), b = polyDegree(n.b, v); return a === null || b === null ? null : Math.max(a, b); }
    case "mul": { const a = polyDegree(n.a, v), b = polyDegree(n.b, v); return a === null || b === null ? null : a + b; }
    case "pow": { const base = polyDegree(n.a, v); if (base === null) return null; if (n.b.t === "num" && Number.isInteger(n.b.v) && n.b.v >= 0) return base * n.b.v; return null; }
    default: return null; // div, call → not a polynomial
  }
}

// Conservative domain restrictions from the AST structure (heuristic, honestly flagged).
function domainRestrictions(n: Node, out: string[]): void {
  const scan = (x: Node) => domainRestrictions(x, out);
  switch (n.t) {
    case "num": case "const": case "var": break;
    case "neg": scan(n.a); break;
    case "div": out.push(`${print(n.b)} ≠ 0`); scan(n.a); scan(n.b); break;
    case "pow": if (n.b.t === "num" && n.b.v < 0) out.push(`${print(n.a)} ≠ 0`); scan(n.a); scan(n.b); break;
    case "call":
      if (n.name === "sqrt") out.push(`${print(n.args[0])} ≥ 0`);
      else if (n.name === "ln" || n.name === "log") out.push(`${print(n.args[0])} > 0`);
      else if (n.name === "asin" || n.name === "acos") out.push(`−1 ≤ ${print(n.args[0])} ≤ 1`);
      n.args.forEach(scan);
      break;
    default: scan(n.a); scan(n.b);
  }
}

export function inspectExpression(source: string): InspectionResult {
  const warnings: string[] = [];
  let ast: Node;
  try { ast = parse(source); }
  catch (e) {
    return { kind: "expression", identity: "Invalid expression", sections: [], relations: [], capabilities: [], warnings: [e instanceof Error ? e.message : String(e)] };
  }

  const s: Struct = { nodes: 0, depth: 0, ops: new Set(), funcs: new Set(), vars: new Set(), consts: new Set() };
  analyze(ast, s);
  const vars = [...freeVars(ast)].sort();
  const nVars = vars.length;

  const sections: Section[] = [];
  const relations: Relation[] = [];
  const caps: Capability[] = ["graph"];

  // --- Structure ---
  sections.push(section("Structure", [
    prop("Variables", nVars ? vars.join(", ") : "none (constant)", "exact"),
    prop("AST nodes", String(s.nodes), "exact"),
    prop("Max depth", String(s.depth), "exact"),
    prop("Operators", [...s.ops].join(", ") || "—", "exact"),
    prop("Functions", [...s.funcs].join(", ") || "—", "exact"),
    prop("Constants", [...s.consts].join(", ") || "—", "exact"),
  ]));

  // --- Classification ---
  const classProps = [];
  if (nVars <= 1) {
    const v = vars[0] ?? "x";
    const deg = polyDegree(ast, v);
    if (deg !== null) classProps.push(prop("Class", `Polynomial, degree ${deg}`, "exact"));
    else if (s.funcs.size || s.ops.has("div")) classProps.push(prop("Class", s.ops.has("div") && !s.funcs.size ? "Rational / algebraic" : "Transcendental", "inferred"));
    else classProps.push(prop("Class", "Algebraic", "inferred"));
  } else {
    classProps.push(prop("Class", `Function of ${nVars} variables`, "exact"));
  }
  sections.push(section("Classification", classProps));

  // --- Domain (conservative) ---
  const restr: string[] = [];
  domainRestrictions(ast, restr);
  const domainProps = restr.length
    ? [...new Set(restr)].map((r, i) => prop(`Restriction ${i + 1}`, r, "heuristic"))
    : [prop("Domain", nVars ? `all real ${vars.join(", ")} (no structural restriction found)` : "constant", "inferred")];
  if (restr.length) warnings.push("Domain restrictions are inferred from expression structure, not solved exactly.");
  sections.push(section("Domain", domainProps));

  // --- Calculus ---
  if (nVars <= 1 && vars.length) {
    const v = vars[0];
    const d1 = derivative(ast, v), d2 = derivative(d1, v);
    caps.push("derivative", "roots", "criticalPoints");
    sections.push(section("Calculus", [
      prop("f", print(ast), "symbolic", { latex: latexish(print(ast)) }),
      prop("f′", print(d1), "symbolic", { latex: latexish(print(d1)) }),
      prop("f″", print(d2), "symbolic", { latex: latexish(print(d2)) }),
    ]));
    relations.push({ label: `Derivative f′(${v})`, target: { kind: "expression", source: print(d1) } });
    relations.push({ label: `Second derivative f″(${v})`, target: { kind: "expression", source: print(d2) } });

    // Roots + critical points (numerical over a default window).
    try {
      const f = compile1(ast, v, { vars: {}, funcs: {} });
      const df = compile1(d1, v, { vars: {}, funcs: {} });
      const ddf = compile1(d2, v, { vars: {}, funcs: {} });
      const roots = findRoots(f, -12, 12);
      const crit = findRoots(df, -12, 12);
      const critProps = crit.length
        ? crit.map((x) => {
            const c2 = ddf(x);
            const cls = Math.abs(c2) < 1e-7 ? "inconclusive (f″≈0)" : c2 > 0 ? "local minimum" : "local maximum";
            return prop(`x = ${round(x)}`, `f = ${round(f(x))}, f″ = ${round(c2)} → ${cls}`, "estimated");
          })
        : [prop("Critical points", "none in [−12, 12]", "estimated")];
      sections.push(section("Roots & critical points (numerical, [−12,12])", [
        prop("Roots", roots.length ? roots.map(round).join(", ") : "none in window", "estimated"),
        ...critProps,
      ]));
      warnings.push("Roots and critical points are numerical estimates over x ∈ [−12, 12]; classification uses the sign of f″.");
    } catch {
      warnings.push("Numerical root/critical-point analysis unavailable for this expression.");
    }
  } else if (nVars >= 2) {
    const g = gradient(ast, vars);
    const H = hessian(ast, vars);
    const lap = laplacian(ast, vars);
    caps.push("gradient", "hessian", "laplacian");
    sections.push(section("Vector calculus", [
      prop("∇f", `(${g.map(print).join(",  ")})`, "symbolic", { latex: `\\nabla f = (${g.map((n) => latexish(print(n))).join(",\\ ")})` }),
      prop("∇²f (Laplacian)", print(lap), "symbolic", { latex: latexish(print(lap)) }),
      prop("Hessian size", `${vars.length}×${vars.length}`, "exact"),
    ]));
    relations.push({ label: "Gradient ∇f", description: `(${g.map(print).join(", ")})`, target: null });
    relations.push({ label: `Hessian (${vars.length}×${vars.length})`, description: H.map((r) => r.map(print).join(", ")).join(" | "), target: null });
    relations.push({ label: "Laplacian ∇²f", target: { kind: "expression", source: print(lap) } });
    warnings.push("Symbolic gradient/Hessian/Laplacian; also evaluable numerically at a point.");
  }

  return {
    kind: "expression",
    identity: nVars <= 1 ? `Scalar function of ${nVars} variable${nVars === 1 ? "" : "s"}` : `Scalar field on ℝ^${nVars}`,
    latex: latexish(print(ast)),
    sections, relations, capabilities: caps, warnings,
  };
}

const round = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(6)) : v);

// Lightweight print→LaTeX: our printer already emits ^, /, ·, function names.
// Wrap function names with \ and turn · into implicit spacing. Not a full converter.
function latexish(s: string): string {
  return s
    .replace(/\bpi\b/g, "\\pi").replace(/·/g, "\\cdot ")
    .replace(/\b(sin|cos|tan|sec|csc|cot|asin|acos|atan|sinh|cosh|tanh|exp|ln|log|sqrt|cbrt|abs|sign)\b/g, "\\$1");
}
