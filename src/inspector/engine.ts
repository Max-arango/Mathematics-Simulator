import { type MathObject, type MathKind, type InspectionResult, type Confidence } from "./types.ts";
import { registerInspector, getInspector } from "./registry.ts";
import { inspectExpression } from "./inspect/expression.ts";
import { inspectMatrix } from "./inspect/matrix.ts";
import { inspectVector } from "./inspect/vector.ts";
import { inspectTopology } from "./inspect/topology.ts";
import { inspectDynamicalSystem } from "./inspect/dynamicalSystem.ts";
import { homeomorphicSurfaces } from "../topo/topology.ts";
import { parse } from "../mathlab/core/parser.ts";
import { compile1 } from "../mathlab/core/eval.ts";
import { freeVars } from "../mathlab/core/ast.ts";

// The four core inspectors, registered once at module load. inspect() dispatches through the
// registry (registry.ts), so adding a domain is a registerInspector call in its own module —
// no change here. Each wrapper unwraps its own variant; the mismatch branch is unreachable
// via inspect() (which dispatches by kind) but keeps the wrapper type-safe without a cast.
registerInspector("expression", (o) => (o.kind === "expression" ? inspectExpression(o.source) : unsupported(o.kind, "kind mismatch")));
registerInspector("matrix", (o) => (o.kind === "matrix" ? inspectMatrix(o.data) : unsupported(o.kind, "kind mismatch")));
registerInspector("vector", (o) => (o.kind === "vector" ? inspectVector(o.data) : unsupported(o.kind, "kind mismatch")));
registerInspector("topology", (o) => (o.kind === "topology" ? inspectTopology(o.surfaceId) : unsupported(o.kind, "kind mismatch")));
registerInspector("dynamicalSystem", (o) => (o.kind === "dynamicalSystem" ? inspectDynamicalSystem(o.vars, o.fieldSource, o.params ?? {}, o.systemKind) : unsupported(o.kind, "kind mismatch")));

/** Inspect any registered mathematical object. Pure, React-free. Dispatches via the registry;
 *  an unregistered kind degrades to a graceful "unsupported" result instead of throwing. */
export function inspect(obj: MathObject): InspectionResult {
  const fn = getInspector(obj.kind);
  if (!fn) return unsupported(obj.kind, `No inspector is registered for kind "${obj.kind}".`);
  return fn(obj);
}

// Graceful result for an unknown/unregistered kind — never throws, flags the gap as a warning
// so a deserialized document with an unfamiliar kind degrades instead of crashing the UI.
function unsupported(kind: MathKind, message: string): InspectionResult {
  return { kind, identity: `Unsupported object kind "${kind}"`, sections: [], relations: [], capabilities: [], warnings: [message] };
}

export interface ComparisonRow { label: string; a: string; b: string; same: boolean }
export interface Comparison { verdict: string; confidence: Confidence; rows: ComparisonRow[] }

/** Compare two same-kind objects with domain-appropriate equivalence. */
export function compare(x: MathObject, y: MathObject): Comparison | null {
  if (x.kind !== y.kind) return { verdict: "Different kinds of object — not comparable", confidence: "notApplicable", rows: [] };

  if (x.kind === "topology" && y.kind === "topology") {
    const r = homeomorphicSurfaces(x.surfaceId, y.surfaceId);
    return {
      verdict: r.homeomorphic
        ? "Compatible with homeomorphism (equal invariants; closed orientable surfaces classified by χ)"
        : "Topological invariants differ ⇒ cannot be homeomorphic",
      confidence: r.homeomorphic ? "inferred" : "exact",
      rows: [
        { label: "Euler χ", a: String(r.a.euler), b: String(r.b.euler), same: r.a.euler === r.b.euler },
        { label: "Genus", a: String(r.a.genus), b: String(r.b.genus), same: r.a.genus === r.b.genus },
        { label: "Components", a: String(r.a.components), b: String(r.b.components), same: r.a.components === r.b.components },
        { label: "Orientable", a: yn(r.a.orientable), b: yn(r.b.orientable), same: r.a.orientable === r.b.orientable },
      ],
    };
  }

  if (x.kind === "matrix" && y.kind === "matrix") {
    const dimSame = x.data.length === y.data.length && x.data[0]?.length === y.data[0]?.length;
    const equal = dimSame && x.data.every((row, i) => row.every((v, j) => Math.abs(v - y.data[i][j]) < 1e-9));
    return { verdict: equal ? "Equal (within numerical tolerance)" : dimSame ? "Same shape, different entries" : "Different dimensions", confidence: "numerical", rows: [] };
  }

  if (x.kind === "vector" && y.kind === "vector") {
    const equal = x.data.length === y.data.length && x.data.every((v, i) => Math.abs(v - y.data[i]) < 1e-9);
    return { verdict: equal ? "Equal (within numerical tolerance)" : "Different", confidence: "numerical", rows: [] };
  }

  // expression: numerical sampling only — NEVER claimed as symbolic equivalence.
  if (x.kind === "expression" && y.kind === "expression") {
    try {
      const ax = parse(x.source), ay = parse(y.source);
      const vars = new Set([...freeVars(ax), ...freeVars(ay)]);
      if (vars.size > 1) return { verdict: "Multi-variable comparison not supported", confidence: "unsupported", rows: [] };
      const v = [...vars][0] ?? "x";
      const f = compile1(ax, v, { vars: {}, funcs: {} }), g = compile1(ay, v, { vars: {}, funcs: {} });
      let match = true;
      for (const t of [-3.1, -1.7, -0.4, 0.3, 1.2, 2.6, 4.0]) {
        const fv = f(t), gv = g(t);
        if (Number.isFinite(fv) && Number.isFinite(gv) && Math.abs(fv - gv) > 1e-7) { match = false; break; }
      }
      return {
        verdict: match ? "Numerically equivalent over the sampled points (NOT proven symbolically)" : "Not equivalent (differ at a sampled point)",
        confidence: match ? "estimated" : "numerical",
        rows: [],
      };
    } catch (e) { return { verdict: `Parse error: ${e instanceof Error ? e.message : e}`, confidence: "unsupported", rows: [] }; }
  }
  return null;
}

const yn = (b: boolean) => (b ? "yes" : "no");
