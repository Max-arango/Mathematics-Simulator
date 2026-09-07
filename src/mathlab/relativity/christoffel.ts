// Christoffel symbols of the second kind:
//   Γ^mu_(alpha beta) = 1/2 g^(mu nu) (∂_alpha g_(nu beta) + ∂_beta g_(nu alpha) − ∂_nu g_(alpha beta))
// Built from exact symbolic partials (derivatives.ts) and a numeric-but-exact
// matrix inverse (inverseMetric.ts) — tagged "exact" per ADR-004.
import { evalMetric, type MetricModel } from "./metric.ts";
import { partialMetric } from "./derivatives.ts";
import { invertMetric } from "./inverseMetric.ts";
import { exact, hasValue, type MathResult } from "../core/result.ts";

/** Γ^mu_(alpha beta) at x, indexed [mu][alpha][beta]. */
export function christoffelSymbols(model: MetricModel, x: number[]): MathResult<number[][][]> {
  const g = evalMetric(model, x);
  const invRes = invertMetric(g);
  if (!hasValue(invRes)) return invRes as MathResult<number[][][]>;
  const ginv = invRes.value;
  const dg = partialMetric(model, x); // dg[alpha][mu][nu] = ∂_alpha g_mu_nu
  const n = model.coords.length;

  const gamma: number[][][] = [];
  for (let mu = 0; mu < n; mu++) {
    const rowAlpha: number[][] = [];
    for (let alpha = 0; alpha < n; alpha++) {
      const rowBeta: number[] = [];
      for (let beta = 0; beta < n; beta++) {
        let s = 0;
        for (let nu = 0; nu < n; nu++) {
          s += ginv[mu][nu] * (dg[alpha][nu][beta] + dg[beta][nu][alpha] - dg[nu][alpha][beta]);
        }
        rowBeta.push(0.5 * s);
      }
      rowAlpha.push(rowBeta);
    }
    gamma.push(rowAlpha);
  }
  return exact(gamma);
}
