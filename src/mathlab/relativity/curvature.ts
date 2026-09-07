// Riemann/Ricci/Einstein tensors. Symbolically differentiating the Christoffel
// formula would require symbolic matrix inversion of an arbitrary parametrized
// metric (impractical in general — ADR-004), so this numerically differentiates
// the already-exact Christoffel-symbol function via central finite differences:
//   R^rho_(sigma mu nu) = d_mu G^rho_(nu sigma) - d_nu G^rho_(mu sigma)
//                        + G^rho_(mu l) G^l_(nu sigma) - G^rho_(nu l) G^l_(mu sigma)
// Honestly tagged "numerical" (Confidence, dynamics3d/types.ts) — a finite-difference
// proxy for an otherwise-exact quantity, not the same as Christoffel's "exact".
import { evalMetric, type MetricModel } from "./metric.ts";
import { christoffelSymbols } from "./christoffel.ts";
import { invertMetric } from "./inverseMetric.ts";
import { exact, hasValue, type MathResult } from "../core/result.ts";
import type { Confidence } from "../dynamics3d/types.ts";

/** Central-difference step for ∂Γ/∂x. Small enough for O(h^2) truncation error,
 *  large enough to stay above floating-point cancellation noise for metrics whose
 *  components are O(1)-O(10) in typical coordinate units. Callers with metrics on
 *  very different scales can override it. */
export const DEFAULT_CURVATURE_STEP = 1e-5;

export interface Curvature {
  /** R^rho_(sigma mu nu), indexed [rho][sigma][mu][nu]. */
  riemann: number[][][][];
  /** R_(mu nu) = R^rho_(mu rho nu), indexed [mu][nu]. */
  ricci: number[][];
  /** R = g^(mu nu) R_(mu nu). */
  ricciScalar: number;
  /** G_(mu nu) = R_(mu nu) - 1/2 g_(mu nu) R, indexed [mu][nu]. */
  einstein: number[][];
  /** Finite-difference proxy for an otherwise-exact tensor (ADR-004). */
  confidence: Confidence;
}

/** Full curvature pipeline at a point x. Propagates any domainError/numericalError
 *  from an underlying singular metric (at x or at a finite-difference stencil point). */
export function curvatureAt(model: MetricModel, x: number[], h = DEFAULT_CURVATURE_STEP): MathResult<Curvature> {
  const n = model.coords.length;
  const gamma0Res = christoffelSymbols(model, x);
  if (!hasValue(gamma0Res)) return gamma0Res as MathResult<Curvature>;
  const gamma = gamma0Res.value; // gamma[rho][alpha][beta] = Γ^rho_(alpha beta)

  // Central-difference stencil: Γ at x ± h·e_mu for every coordinate direction mu.
  const plus: number[][][][] = [];
  const minus: number[][][][] = [];
  for (let mu = 0; mu < n; mu++) {
    const xp = x.slice(); xp[mu] += h;
    const xm = x.slice(); xm[mu] -= h;
    const gp = christoffelSymbols(model, xp);
    const gm = christoffelSymbols(model, xm);
    if (!hasValue(gp)) return gp as MathResult<Curvature>;
    if (!hasValue(gm)) return gm as MathResult<Curvature>;
    plus.push(gp.value);
    minus.push(gm.value);
  }
  const dGamma = (mu: number, rho: number, a: number, b: number): number =>
    (plus[mu][rho][a][b] - minus[mu][rho][a][b]) / (2 * h);

  const riemann: number[][][][] = [];
  for (let rho = 0; rho < n; rho++) {
    const sigArr: number[][][] = [];
    for (let sigma = 0; sigma < n; sigma++) {
      const muArr: number[][] = [];
      for (let mu = 0; mu < n; mu++) {
        const nuArr: number[] = [];
        for (let nu = 0; nu < n; nu++) {
          let v = dGamma(mu, rho, nu, sigma) - dGamma(nu, rho, mu, sigma);
          for (let lambda = 0; lambda < n; lambda++) {
            v += gamma[rho][mu][lambda] * gamma[lambda][nu][sigma] - gamma[rho][nu][lambda] * gamma[lambda][mu][sigma];
          }
          nuArr.push(v);
        }
        muArr.push(nuArr);
      }
      sigArr.push(muArr);
    }
    riemann.push(sigArr);
  }

  // Ricci: R_(sigma nu) = R^rho_(sigma rho nu) (contract 1st and 3rd indices).
  const ricci: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let sigma = 0; sigma < n; sigma++) {
    for (let nu = 0; nu < n; nu++) {
      let s = 0;
      for (let rho = 0; rho < n; rho++) s += riemann[rho][sigma][rho][nu];
      ricci[sigma][nu] = s;
    }
  }

  const g = evalMetric(model, x);
  const invRes = invertMetric(g);
  if (!hasValue(invRes)) return invRes as MathResult<Curvature>;
  const ginv = invRes.value;

  let ricciScalar = 0;
  for (let mu = 0; mu < n; mu++) {
    for (let nu = 0; nu < n; nu++) ricciScalar += ginv[mu][nu] * ricci[mu][nu];
  }

  const einstein: number[][] = Array.from({ length: n }, (_, mu) =>
    Array.from({ length: n }, (_, nu) => ricci[mu][nu] - 0.5 * g[mu][nu] * ricciScalar));

  return exact({ riemann, ricci, ricciScalar, einstein, confidence: "numerical" as Confidence });
}
