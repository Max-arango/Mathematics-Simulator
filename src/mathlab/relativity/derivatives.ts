// Symbolic partial derivatives of the metric components. Reuses
// calculus/derivative.ts::derivative (exact, simplified symbolic differentiation) —
// zero new differentiation code. The symbolic differentiation happens once per
// model (cached), then is evaluated numerically at as many points as needed.
import type { Node } from "../core/ast.ts";
import { derivative } from "../calculus/derivative.ts";
import { evaluate } from "../core/eval.ts";
import { metricEnv, type MetricModel } from "./metric.ts";

// Lazily-computed, cached per model instance: ∂g_mu_nu/∂x_alpha as Node[alpha][mu][nu].
const partialCache = new WeakMap<MetricModel, Node[][][]>();

function partialComponentNodes(model: MetricModel): Node[][][] {
  const cached = partialCache.get(model);
  if (cached) return cached;
  const n = model.coords.length;
  const result: Node[][][] = [];
  for (let alpha = 0; alpha < n; alpha++) {
    const row: Node[][] = [];
    for (let mu = 0; mu < n; mu++) {
      const inner: Node[] = [];
      for (let nu = 0; nu < n; nu++) {
        inner.push(derivative(model.components[mu][nu], model.coords[alpha]));
      }
      row.push(inner);
    }
    result.push(row);
  }
  partialCache.set(model, result);
  return result;
}

/** ∂_alpha g_mu_nu(x), indexed [alpha][mu][nu]. Exact symbolic derivative, evaluated at x. */
export function partialMetric(model: MetricModel, x: number[]): number[][][] {
  const partials = partialComponentNodes(model);
  const env = metricEnv(model, x);
  const n = model.coords.length;
  const out: number[][][] = [];
  for (let alpha = 0; alpha < n; alpha++) {
    const row: number[][] = [];
    for (let mu = 0; mu < n; mu++) {
      const inner: number[] = [];
      for (let nu = 0; nu < n; nu++) inner.push(evaluate(partials[alpha][mu][nu], env));
      row.push(inner);
    }
    out.push(row);
  }
  return out;
}
