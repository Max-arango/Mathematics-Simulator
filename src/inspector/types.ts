// Mathematical Inspector — object model. React-free: usable by UI, CLI, tests.
// Every value carries a `confidence` so exact/symbolic results are never confused
// with numerical estimates or heuristic inferences.

// The four core object kinds plus an open string tail: domain inspectors (dynamical
// systems, …) register additional kinds through the registry (engine.ts / registry.ts)
// without editing this alias. `(string & {})` keeps the four literals visible to
// autocomplete while accepting any registered kind, so `InspectionResult.kind` typechecks
// for a domain result the core union does not yet name.
export type MathKind = "expression" | "matrix" | "vector" | "topology" | (string & {});

export type Confidence =
  | "exact"        // integer / closed-form, provably correct
  | "symbolic"     // exact symbolic result (e.g. a symbolic derivative)
  | "numerical"    // floating-point computation
  | "estimated"    // numerical estimate (limits, sampled roots)
  | "inferred"     // derived under stated assumptions (e.g. genus from χ)
  | "heuristic"    // conservative guess, explicitly flagged
  | "unsupported"  // engine cannot compute this
  | "notApplicable";

export interface Property {
  label: string;
  value: string;          // human-readable
  confidence: Confidence;
  latex?: string;         // KaTeX source when the value is a formula
  note?: string;
}

export interface Section {
  title: string;
  properties: Property[];
}

/** A derived object the user can navigate to (cross-domain relationships). */
export interface Relation {
  label: string;           // e.g. "Gradient ∇f"
  description?: string;
  target: MathObject | null; // null = describe-only (no navigable object yet)
}

export type Capability =
  | "derivative" | "gradient" | "hessian" | "laplacian" | "roots"
  | "criticalPoints" | "graph" | "determinant" | "inverse" | "eigen"
  | "geometricAction" | "topologyInvariants" | "compare";

export interface InspectionResult {
  kind: MathKind;
  identity: string;        // "Scalar function of 1 variable", "3×3 matrix", …
  latex?: string;          // headline object in LaTeX
  sections: Section[];
  relations: Relation[];
  capabilities: Capability[];
  warnings: string[];
}

/** The inputs the Inspector understands. Discriminated — no `any`. */
export type MathObject =
  | { kind: "expression"; source: string }
  | { kind: "matrix"; data: number[][] }
  | { kind: "vector"; data: number[] }
  | { kind: "topology"; surfaceId: string };

// Small builders keep the inspector modules terse.
export const prop = (label: string, value: string, confidence: Confidence, extra: Partial<Property> = {}): Property =>
  ({ label, value, confidence, ...extra });
export const section = (title: string, properties: Property[]): Section => ({ title, properties });
