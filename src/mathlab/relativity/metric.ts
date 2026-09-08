// Generic differential-geometry engine (Layer 2).
//
// Given a MetricModel (metric g_{μν} + analytic ∂_α g_{μν}) this derives, at any
// point x, the standard machinery:
//
//   inverse metric  g^{μν}
//   Christoffel     Γ^μ_{αβ} = ½ g^{μν}(∂_α g_{νβ} + ∂_β g_{να} − ∂_ν g_{αβ})
//   Riemann         R^ρ_{σμν} = ∂_μ Γ^ρ_{νσ} − ∂_ν Γ^ρ_{μσ} + Γ^ρ_{μλ}Γ^λ_{νσ} − Γ^ρ_{νλ}Γ^λ_{μσ}
//   Ricci           R_{σν} = R^ρ_{σρν}
//   Ricci scalar    R = g^{σν} R_{σν}
//   Einstein        G_{μν} = R_{μν} − ½ g_{μν} R
//
// NOTHING here is model-specific. The metric derivatives ∂g are ANALYTIC (from the
// model); the second-order object needed for curvature — ∂Γ — is obtained by ONE
// central-difference layer over the analytic Christoffel, so curvature is accurate to
// ~O(h²) with none of the noise of differencing g twice. The metric inverse reuses the
// project's shared LU inverse (linear/matrix) — no bespoke linear algebra.
import { make, inverse as matInverse } from "../linear/matrix.ts";
import { DIM, type Tensor2, type Tensor3, type Christoffel, type Coord, type MetricModel } from "./types.ts";

const zeros2 = (): Tensor2 => Array.from({ length: DIM }, () => new Array<number>(DIM).fill(0));
const zeros3 = (): Christoffel => Array.from({ length: DIM }, () => zeros2());
const zeros4 = (): number[][][][] => Array.from({ length: DIM }, () => zeros3());

/** Inverse metric g^{μν}. Throws if the metric is degenerate (singular) at the point. */
export function inverseMetric(g: Tensor2): Tensor2 {
  const inv = matInverse(make(g));
  if (!inv) throw new Error("metric is singular (degenerate) at this point — outside the valid chart?");
  return inv.data;
}

/** Christoffel symbols Γ^μ_{αβ} from the metric and its first derivatives ∂_α g_{μν}. */
export function christoffel(g: Tensor2, dg: Tensor3): Christoffel {
  const gi = inverseMetric(g);
  const G = zeros3();
  for (let m = 0; m < DIM; m++)
    for (let a = 0; a < DIM; a++)
      for (let b = a; b < DIM; b++) { // symmetric in (a,b)
        let s = 0;
        for (let n = 0; n < DIM; n++) s += gi[m][n] * (dg[a][n][b] + dg[b][n][a] - dg[n][a][b]);
        G[m][a][b] = 0.5 * s;
        G[m][b][a] = G[m][a][b];
      }
  return G;
}

/** Christoffel at a chart point x via the model's analytic g/∂g. */
export function christoffelAt(model: MetricModel, x: Coord): Christoffel {
  return christoffel(model.g(x), model.dg(x));
}

// ∂_α Γ^μ_{βγ} by central differences over the analytic Christoffel. Index [α][μ][β][γ].
// Step scales with the coordinate magnitude so it works for r ~ O(10) and θ ~ O(1).
function dChristoffel(model: MetricModel, x: Coord, h: number): number[][][][] {
  const out = zeros4();
  for (let a = 0; a < DIM; a++) {
    const step = h * (1 + Math.abs(x[a]));
    const xp = x.slice(); xp[a] += step;
    const xm = x.slice(); xm[a] -= step;
    const Gp = christoffelAt(model, xp);
    const Gm = christoffelAt(model, xm);
    for (let m = 0; m < DIM; m++)
      for (let b = 0; b < DIM; b++)
        for (let c = 0; c < DIM; c++) out[a][m][b][c] = (Gp[m][b][c] - Gm[m][b][c]) / (2 * step);
  }
  return out;
}

/** Riemann tensor R^ρ_{σμν} at x (mixed form: one up, three down). */
export function riemann(model: MetricModel, x: Coord, h = 1e-5): number[][][][] {
  const G = christoffelAt(model, x);
  const dG = dChristoffel(model, x, h);
  const R = zeros4();
  for (let r = 0; r < DIM; r++)
    for (let s = 0; s < DIM; s++)
      for (let m = 0; m < DIM; m++)
        for (let n = 0; n < DIM; n++) {
          let v = dG[m][r][n][s] - dG[n][r][m][s];
          for (let l = 0; l < DIM; l++) v += G[r][m][l] * G[l][n][s] - G[r][n][l] * G[l][m][s];
          R[r][s][m][n] = v;
        }
  return R;
}

/** Ricci tensor R_{σν} = R^ρ_{σρν} (contract 1st upper with 3rd lower). */
export function ricci(model: MetricModel, x: Coord, h = 1e-5): Tensor2 {
  const R = riemann(model, x, h);
  const Ric = zeros2();
  for (let s = 0; s < DIM; s++)
    for (let n = 0; n < DIM; n++) {
      let v = 0;
      for (let r = 0; r < DIM; r++) v += R[r][s][r][n];
      Ric[s][n] = v;
    }
  return Ric;
}

/** Ricci scalar R = g^{σν} R_{σν}. */
export function ricciScalar(model: MetricModel, x: Coord, h = 1e-5): number {
  const gi = inverseMetric(model.g(x));
  const Ric = ricci(model, x, h);
  let s = 0;
  for (let a = 0; a < DIM; a++) for (let b = 0; b < DIM; b++) s += gi[a][b] * Ric[a][b];
  return s;
}

/** Einstein tensor G_{μν} = R_{μν} − ½ g_{μν} R. */
export function einstein(model: MetricModel, x: Coord, h = 1e-5): Tensor2 {
  const g = model.g(x);
  const Ric = ricci(model, x, h);
  const R = ricciScalar(model, x, h);
  const G = zeros2();
  for (let a = 0; a < DIM; a++) for (let b = 0; b < DIM; b++) G[a][b] = Ric[a][b] - 0.5 * g[a][b] * R;
  return G;
}

/** Frobenius-style max-abs of a nested numeric tensor (for "is this ~zero?" checks). */
export function maxAbs(t: unknown): number {
  if (typeof t === "number") return Math.abs(t);
  let m = 0;
  for (const e of t as unknown[]) m = Math.max(m, maxAbs(e));
  return m;
}
