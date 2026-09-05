// Numerical approximation of a saddle's STABLE / UNSTABLE manifolds (§10).
//
// A hyperbolic 2-D saddle x* has real eigenvalues λ_u > 0 > λ_s with real
// eigenvectors v_u, v_s. The invariant manifolds are TANGENT to those vectors
// at x*, so we seed just off the saddle along each eigenvector and integrate:
//
//   • UNSTABLE manifold  W^u — orbits LEAVING x*  → trace by FORWARD  flow
//                              from x* ± ε·v_u.
//   • STABLE   manifold  W^s — orbits ENTERING x* → trace by BACKWARD flow (−f)
//                              from x* ± ε·v_s.
//
// Two branches each (the ±ε seeds). Integration reuses simulate() (shared RK4,
// direction flag) — NO new integrator. This is a NUMERICAL APPROXIMATION
// (confidence "numerical", §17): the curve hugs the true manifold near x* and
// may peel off under strong nonlinearity / long horizons.
import { simulate } from "./trajectory.ts";
import { linearize } from "./linearize.ts";
import type { Vec } from "../linear/vector.ts";
import type { DynamicalSystem } from "./system.ts";

export interface SaddleManifolds {
  saddle: Vec;
  /** Each branch is a polyline of world points, starting AT the saddle. */
  stable: Vec[][];
  unstable: Vec[][];
  stableEigenvalue: number;
  unstableEigenvalue: number;
  stableVector: Vec;
  unstableVector: Vec;
  confidence: "numerical";
}

export interface ManifoldOptions {
  /** Seed offset from the saddle along the eigenvector. Default 1e-3. */
  epsilon?: number;
  /** Integration horizon (world-time). Default 12. */
  span?: number;
  /** RK4 nominal step. Default span/500. */
  h?: number;
}

/**
 * Approximate the stable & unstable manifolds of a 2-D continuous saddle at
 * `point`. Returns null if the system is not a 2-D flow or the equilibrium is
 * not a (hyperbolic, real-eigenvector) saddle.
 */
export function saddleManifolds(
  sys: DynamicalSystem,
  point: Vec,
  opts: ManifoldOptions = {},
): SaddleManifolds | null {
  if (sys.kind !== "continuous" || sys.vars.length !== 2) return null;
  const lin = linearize(sys, point);
  if (lin.classification !== "saddle") return null;

  // Pick the single real stable / unstable eigenpair (a 2-D saddle has exactly one each).
  let stablePair: { value: number; vector: Vec } | null = null;
  let unstablePair: { value: number; vector: Vec } | null = null;
  for (const p of lin.eigenpairs) {
    if (!p.vector) continue;
    if (p.value.re < 0 && !stablePair) stablePair = { value: p.value.re, vector: p.vector };
    else if (p.value.re > 0 && !unstablePair) unstablePair = { value: p.value.re, vector: p.vector };
  }
  if (!stablePair || !unstablePair) return null;

  const eps = opts.epsilon ?? 1e-3;
  const span = opts.span ?? 12;
  const h = opts.h ?? span / 500;

  const off = (v: Vec, s: 1 | -1): Vec => [point[0] + s * eps * v[0], point[1] + s * eps * v[1]];
  const trace = (seed: Vec, direction: "forward" | "backward"): Vec[] => {
    const { states } = simulate(sys, seed, { method: "rk4", t0: 0, t1: span, h, direction });
    return [point.slice(), ...states];
  };

  return {
    saddle: point.slice(),
    unstable: [trace(off(unstablePair.vector, 1), "forward"), trace(off(unstablePair.vector, -1), "forward")],
    stable: [trace(off(stablePair.vector, 1), "backward"), trace(off(stablePair.vector, -1), "backward")],
    stableEigenvalue: stablePair.value,
    unstableEigenvalue: unstablePair.value,
    stableVector: stablePair.vector.slice(),
    unstableVector: unstablePair.vector.slice(),
    confidence: "numerical",
  };
}
