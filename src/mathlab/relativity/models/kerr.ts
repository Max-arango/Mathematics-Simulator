// Kerr spacetime — the rotating (spin a), axisymmetric vacuum solution of the
// Einstein field equations (Kerr 1963), in Boyer-Lindquist coordinates (t,r,θ,φ),
// geometrized units G = c = 1. Spin a = J/M; sub-extremal black hole 0 ≤ a < M.
//
//   Σ = r² + a²cos²θ,   Δ = r² − 2Mr + a²
//   g_tt = −(1 − 2Mr/Σ)
//   g_tφ = g_φt = −2Mr a sin²θ / Σ          ← the off-diagonal term ⇒ frame dragging
//   g_rr = Σ/Δ,   g_θθ = Σ
//   g_φφ = ( r² + a² + 2Mr a² sin²θ/Σ ) sin²θ
//
// Unlike Schwarzschild the metric is NON-DIAGONAL, which is exactly why the geometry
// engine takes a general 4×4 inverse (shared LU) rather than assuming a diagonal
// metric. As a → 0 every component reduces to Schwarzschild (checked in tests).
// Distinctive structure: an OUTER HORIZON at r₊ = M + √(M²−a²) and, outside it, an
// ERGOSPHERE (g_tt > 0) reaching r = 2M in the equatorial plane, where no observer can
// remain static — space itself is dragged around.
//
// The metric and its ANALYTIC first derivatives are hand-written (fast, so geodesics
// recompute live); a test pins ∂g against a numerical difference of g, and another
// pins the a → 0 limit to Schwarzschild — so the algebra is guarded, not trusted.
import { DIM, type Coord, type Tensor2, type Tensor3, type MetricModel } from "../types.ts";

/** Outer event horizon r₊ = M + √(M²−a²) (extremal/naked cases clamp the radicand). */
export const kerrOuterHorizon = (M: number, a: number): number => M + Math.sqrt(Math.max(0, M * M - a * a));
/** Ergosphere radius r = M + √(M²−a²cos²θ); equatorial value 2M. */
export const ergosphereRadius = (M: number, a: number, theta: number): number =>
  M + Math.sqrt(Math.max(0, M * M - a * a * Math.cos(theta) ** 2));

export function makeKerr(M = 0.5, a = 0.4): MetricModel {
  const rPlus = kerrOuterHorizon(M, a);
  const EPS = 1e-4;

  // Shared intermediates at a point (r,θ): Σ, Δ, Q = 2Mr/Σ and their r,θ derivatives.
  const geom = (r: number, th: number) => {
    const c = Math.cos(th), s = Math.sin(th);
    const sc = s * c, s2 = s * s;
    const Sig = r * r + a * a * c * c;
    const Del = r * r - 2 * M * r + a * a;
    const Q = (2 * M * r) / Sig;                       // appears in g_tt, g_tφ, g_φφ
    const Sig_r = 2 * r, Sig_th = -2 * a * a * sc;
    const Del_r = 2 * r - 2 * M;
    const Q_r = (2 * M * (a * a * c * c - r * r)) / (Sig * Sig); // = 2M(Σ−2r²)/Σ²
    const Q_th = (4 * M * r * a * a * sc) / (Sig * Sig);
    return { c, s, sc, s2, Sig, Del, Q, Sig_r, Sig_th, Del_r, Q_r, Q_th };
  };

  const g = (x: Coord): Tensor2 => {
    const { s2, Sig, Del, Q } = geom(x[1], x[2]);
    const r = x[1];
    const gtt = -1 + Q;
    const gtf = -a * s2 * Q;
    const grr = Sig / Del;
    const gthth = Sig;
    const gff = s2 * (r * r + a * a) + a * a * s2 * s2 * Q;
    return [
      [gtt, 0, 0, gtf],
      [0, grr, 0, 0],
      [0, 0, gthth, 0],
      [gtf, 0, 0, gff],
    ];
  };

  const dg = (x: Coord): Tensor3 => {
    const r = x[1], th = x[2];
    const { sc, s2, Sig, Del, Q, Sig_r, Sig_th, Del_r, Q_r, Q_th } = geom(r, th);
    const d: Tensor3 = Array.from({ length: DIM }, () => Array.from({ length: DIM }, () => new Array<number>(DIM).fill(0)));

    // ∂_r (index α = 1)
    d[1][0][0] = Q_r;                                             // g_tt
    d[1][0][3] = d[1][3][0] = -a * s2 * Q_r;                      // g_tφ
    d[1][1][1] = (Sig_r * Del - Sig * Del_r) / (Del * Del);       // g_rr
    d[1][2][2] = Sig_r;                                           // g_θθ
    d[1][3][3] = 2 * r * s2 + a * a * s2 * s2 * Q_r;              // g_φφ

    // ∂_θ (index α = 2)
    const s2_th = 2 * sc;                 // ∂_θ sin²θ
    const s4_th = 4 * s2 * sc;            // ∂_θ sin⁴θ
    d[2][0][0] = Q_th;                                            // g_tt
    d[2][0][3] = d[2][3][0] = -a * (s2_th * Q + s2 * Q_th);       // g_tφ
    d[2][1][1] = Sig_th / Del;                                    // g_rr
    d[2][2][2] = Sig_th;                                          // g_θθ
    d[2][3][3] = s2_th * (r * r + a * a) + a * a * (s4_th * Q + s2 * s2 * Q_th); // g_φφ
    return d;
  };

  return {
    id: "kerr",
    label: "Kerr (rotating BH)",
    provenance: `Analytic rotating vacuum solution of the Einstein field equations (Kerr 1963); Boyer-Lindquist coords, G=c=1, spin a=${a}, r₊=${rPlus.toFixed(3)}. Idealised: stationary, axisymmetric, exterior r>r₊.`,
    coords: ["t", "r", "θ", "φ"],
    signature: "(−,+,+,+)",
    params: { M, a },
    domain: (x) => {
      const r = x[1], th = x[2];
      if (!(r > rPlus * (1 + EPS))) return { ok: false, reason: `at/inside outer horizon (r ≤ r₊=${rPlus.toFixed(3)})` };
      if (th < EPS || th > Math.PI - EPS) return { ok: false, reason: "coordinate pole (sinθ → 0)" };
      return { ok: true };
    },
    g,
    dg,
    toCartesian: (x) => {
      const r = x[1], th = x[2], ph = x[3];
      return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];
    },
  };
}

/** Default M = 0.5, a = 0.4 (rs-scale unit hole with moderate spin). */
export const kerr = makeKerr(0.5, 0.4);
