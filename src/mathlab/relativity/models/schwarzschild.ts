// Schwarzschild spacetime — the idealized, spherically symmetric, NON-rotating
// vacuum solution of the Einstein field equations (Schwarzschild 1916).
//
//   coords (t,r,θ,φ),  geometrized units G = c = 1,  Schwarzschild radius rs = 2M.
//   f(r) = 1 − rs/r
//   g_{μν} = diag( −f,  1/f,  r²,  r² sin²θ )
//
// It is a VACUUM solution: R_{μν} = 0 everywhere on the exterior (r > rs), yet the
// full Riemann tensor is non-zero (tidal curvature; Kretschmann K = 12 rs²/r⁶). As
// M → 0 the curvature vanishes and it reduces to flat space in spherical coordinates.
// Valid chart here: the exterior r > rs (the interior and the horizon itself are
// coordinate-singular in these coordinates). Everything downstream (Christoffel,
// curvature, geodesics) is DERIVED by the generic engine — this file only supplies
// g and its analytic first derivatives.
import { DIM, type Coord, type Tensor2, type Tensor3, type MetricModel } from "../types.ts";

/** Schwarzschild radius rs = 2M. */
export const schwarzschildRadius = (M: number): number => 2 * M;
/** Photon sphere radius (unstable circular null orbit) r = 3M = 1.5 rs. */
export const photonSphereRadius = (M: number): number => 3 * M;
/** Innermost stable circular (timelike) orbit r = 6M = 3 rs. */
export const iscoRadius = (M: number): number => 6 * M;

export function makeSchwarzschild(M = 0.5): MetricModel {
  const rs = 2 * M;
  const EPS = 1e-4;

  const g = (x: Coord): Tensor2 => {
    const r = x[1], th = x[2];
    const f = 1 - rs / r;
    const s2 = Math.sin(th) ** 2;
    return [
      [-f, 0, 0, 0],
      [0, 1 / f, 0, 0],
      [0, 0, r * r, 0],
      [0, 0, 0, r * r * s2],
    ];
  };

  const dg = (x: Coord): Tensor3 => {
    const r = x[1], th = x[2];
    const f = 1 - rs / r;
    const sin = Math.sin(th), cos = Math.cos(th);
    const d = Array.from({ length: DIM }, () => Array.from({ length: DIM }, () => new Array<number>(DIM).fill(0)));
    // ∂_r g_{μν}  (index α = 1)
    d[1][0][0] = -rs / (r * r);            // ∂_r(−f) = −rs/r²
    d[1][1][1] = -(rs / (r * r)) / (f * f); // ∂_r(1/f) = −f'/f², f' = rs/r²
    d[1][2][2] = 2 * r;                     // ∂_r(r²)
    d[1][3][3] = 2 * r * sin * sin;         // ∂_r(r² sin²θ)
    // ∂_θ g_{φφ}  (index α = 2)
    d[2][3][3] = 2 * r * r * sin * cos;     // ∂_θ(r² sin²θ)
    return d;
  };

  return {
    id: "schwarzschild",
    label: "Schwarzschild (non-rotating BH)",
    provenance: "Analytic vacuum solution of the Einstein field equations (Schwarzschild 1916); geometrized units G=c=1, rs=2M. Idealised: spherically symmetric, non-rotating, exterior r>rs.",
    coords: ["t", "r", "θ", "φ"],
    signature: "(−,+,+,+)",
    params: { M },
    domain: (x) => {
      const r = x[1], th = x[2];
      if (!(r > rs * (1 + EPS))) return { ok: false, reason: `at/inside event horizon (r ≤ rs = ${rs})` };
      if (th < EPS || th > Math.PI - EPS) return { ok: false, reason: "coordinate pole (sinθ → 0)" };
      return { ok: true };
    },
    g,
    dg,
    // spherical (r,θ,φ) → Cartesian, for rendering.
    toCartesian: (x) => {
      const r = x[1], th = x[2], ph = x[3];
      return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];
    },
  };
}

/** Default M = 0.5 ⇒ rs = 1 (convenient unit horizon). */
export const schwarzschild = makeSchwarzschild(0.5);

/**
 * Initial conditions for an EQUATORIAL geodesic (θ = π/2, which the flow preserves)
 * from the conserved energy E and angular momentum L:
 *
 *   u^t = E/f(r0),  u^φ = L/r0²,  u^θ = 0,
 *   (u^r)² = E² + f·ε − f·L²/r0²      with ε = −1 (timelike) or 0 (null).
 *
 * `radialSign` picks the inbound (−1) or outbound (+1) branch. If (u^r)² < 0 the point
 * is a turning point / classically forbidden — u^r is clamped to 0. Returns the 8-state
 * split into x0/u0 for `geodesic`.
 */
export function equatorialState(
  model: MetricModel, r0: number, E: number, L: number, kind: "timelike" | "null", radialSign: 1 | -1,
): { x0: Coord; u0: Coord } {
  const rs = 2 * model.params.M;
  const f = 1 - rs / r0;
  const eps = kind === "timelike" ? -1 : 0;
  const ur2 = E * E + f * eps - (f * L * L) / (r0 * r0);
  const ur = ur2 > 0 ? radialSign * Math.sqrt(ur2) : 0;
  return {
    x0: [0, r0, Math.PI / 2, 0],
    u0: [E / f, ur, 0, L / (r0 * r0)],
  };
}
