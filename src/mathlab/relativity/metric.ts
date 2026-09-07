// Metric abstraction (ADR-004): a MetricModel stores its 4x4 components as SOURCE
// EXPRESSION STRINGS parsed through the existing core/parser — exactly the same
// pattern dynamics/system.ts uses for vector fields (fieldSource -> field: Node[]).
// No new parser, no per-model hand-coded derivative functions: symbolic tools
// (calculus/derivative.ts) and the numeric evaluator (core/eval.ts) work directly
// on model.components, so every metric (Minkowski, later Schwarzschild/Kerr) gets
// inverse/Christoffel/curvature machinery for free.
import type { Node } from "../core/ast.ts";
import { parse } from "../core/parser.ts";
import { evaluate, type Env } from "../core/eval.ts";
import { InvalidInputError } from "../core/errors.ts";

export interface MetricModel {
  name: string;
  coords: string[];              // e.g. ["t","x","y","z"]
  params: Record<string, number>;
  componentsSource: string[][];  // symmetric 4x4 expression strings (may reference coords + params)
  components: Node[][];          // parsed via core/parser, symmetric 4x4
  signature: string;              // e.g. "-+++"
  provenance: string;             // required: scientific provenance of this model
  chart: string;                  // coordinate chart name, e.g. "Cartesian"
  validRegion?: (x: number[]) => boolean; // optional domain guard (e.g. Schwarzschild r>2M)
}

export type MetricSpec = Omit<MetricModel, "components">;

/** Parse `componentsSource` into `components` once at model-construction time. */
export function makeMetric(spec: MetricSpec): MetricModel {
  const n = spec.coords.length;
  if (spec.componentsSource.length !== n || spec.componentsSource.some((row) => row.length !== n)) {
    throw new InvalidInputError(
      `componentsSource must be a ${n}x${n} grid matching coords [${spec.coords.join(", ")}]`,
    );
  }
  const components = spec.componentsSource.map((row) => row.map((src) => parse(src)));
  return { ...spec, components };
}

/** Build the evaluation environment for a point x: coords bound to x, plus model params. */
export function metricEnv(model: MetricModel, x: number[]): Env {
  if (x.length !== model.coords.length) {
    throw new InvalidInputError(
      `expected ${model.coords.length} coordinates [${model.coords.join(", ")}], got ${x.length}`,
    );
  }
  const vars: Record<string, number> = { ...model.params };
  model.coords.forEach((c, i) => { vars[c] = x[i]; });
  return { vars, funcs: {} };
}

/** Evaluate g_mu_nu(x) numerically at a point. */
export function evalMetric(model: MetricModel, x: number[]): number[][] {
  const env = metricEnv(model, x);
  return model.components.map((row) => row.map((node) => evaluate(node, env)));
}
