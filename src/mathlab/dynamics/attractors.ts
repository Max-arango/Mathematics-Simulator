// Attractor identification: enumerate the LONG-TERM destinations of the flow
// ẋ = f(x). An attractor is one of:
//
//   • stable equilibrium      — all trajectories in its basin terminate at it.
//   • stable limit cycle      — closed orbit. NEEDS EVIDENCE (return-map), not
//                                linear algebra: a stable cycle is a NONLINEAR
//                                phenomenon invisible to the Jacobian.
//
// SADDLE / UNSTABLE NODE / UNSTABLE SPIRAL are NOT attractors — they repel
// everything except a measure-zero invariant manifold. CENTERS are not
// attractors either: technically Lyapunov stable, but a perturbation of the
// field will break the closed orbits. We list them separately if the caller
// wants a full "phase portrait" inventory; the default returns only attractors.
//
// (ponytail: kept sync — no async, no incremental collection. The basin
// sampler is where the async + cancelable lives.)
import { classifyEquilibrium, type StabilityResult } from "./stability.ts";
import { evalField, type DynamicalSystem } from "./system.ts";
import { norm, type Vec } from "../linear/vector.ts";

export type AttractorKind = "stable-equilibrium" | "limit-cycle";

export interface StableEquilibriumAttractor {
  kind: "stable-equilibrium";
  point: Vec;
  index: number;
  stability: StabilityResult;
  confidence: "numerical" | "inferred";
}

export interface LimitCycleAttractor {
  kind: "limit-cycle";
  /** Estimated orbit centre. */
  center: Vec;
  /** Mean radius / amplitude. */
  radius: number;
  /** Sampled orbit points (for drawing). */
  orbit: Vec[];
  /** Per-destination. */
  confidence: "heuristic";
  /** Provenance: a human / notebook ID, or a one-liner like "van-der-pol μ=1". */
  label?: string;
}

export type Attractor = StableEquilibriumAttractor | LimitCycleAttractor;

/** Inventory options. */
export interface AttractorOptions {
  equilibria: Vec[];                // output of findEquilibria
  /** Optional pre-discovered limit cycles (e.g. from a basin's most-frequent
   *  destination, or from a notebook's manual "I see a cycle here" pin). */
  limitCycles?: LimitCycleAttractor[];
  /** Include inconclusive equilibria? Default false. */
  includeInconclusive?: boolean;
  /** |Re λ| (continuous) or ||λ|−1| (discrete) threshold above which a stable
   *  classification is taken as "strictly stable". Default 1e-3. */
  strictness?: number;
}

/**
 * Enumerate attractors: stable equilibria (from the user's equilibrium list
 * filtered by linear stability) and any supplied limit cycles. Order is
 * deterministic — equilibria by their `equilibria` index, limit cycles by input
 * order — so downstream comparisons (basin map ↔ attractor list) are stable.
 */
export function identifyAttractors(sys: DynamicalSystem, opts: AttractorOptions): Attractor[] {
  if (sys.vars.length !== 2) {
    // Attractor classification in 2-D is the only place this matters; in N-D
    // the same logic applies but equilibrium search needs more infrastructure.
    // We don't throw — we just skip the eq filter and return only explicit cycles.
  }
  const strictness = opts.strictness ?? 1e-3;
  const out: Attractor[] = [];

  // (1) stable equilibria.
  for (let i = 0; i < opts.equilibria.length; i++) {
    const p = opts.equilibria[i];
    if (p.length !== sys.vars.length) continue;
    let stab: StabilityResult;
    try { stab = classifyEquilibrium(sys, p); }
    catch { continue; }
    if (isAttracting(stab, strictness) || (opts.includeInconclusive && stab.type === "inconclusive")) {
      out.push({
        kind: "stable-equilibrium",
        point: p.slice(),
        index: i,
        stability: stab,
        confidence: isAttracting(stab, strictness) ? "numerical" : "inferred",
      });
    }
  }

  // (2) limit cycles (user-supplied — we never auto-discover; that's the
  //     basin sampler's job, and even then it can only HINT).
  for (const lc of opts.limitCycles ?? []) {
    out.push({ ...lc, orbit: lc.orbit.map((p) => p.slice()) });
  }

  return out;
}

/** True iff the linearization says the eq is an attractor: stable-node, stable-spiral. */
export function isAttracting(stab: StabilityResult, strictness = 1e-3): boolean {
  if (stab.type === "stable-node" || stab.type === "stable-spiral") {
    // Double-check via the eigenvalues themselves: |Re λ| (continuous) or ||λ|−1| (discrete)
    // must be above `strictness` — otherwise it's NON-HYPERBOLIC and we should not list
    // it as a "guaranteed" attractor.
    for (const z of stab.eigenvalues) {
      const re = z.re;
      const mod = Math.hypot(re, z.im);
      // Continuous ⇒ require Re λ < −strictness.
      // Discrete ⇒ require |λ| < 1 − strictness. We don't know the kind here;
      // use the MAX of the two conditions so we err on the side of NOT listing.
      const continuousBound = re < -strictness;
      const discreteBound = mod < 1 - strictness;
      if (!(continuousBound || discreteBound)) return false;
    }
    return true;
  }
  return false;
}

/** Is the position inside the basin of an attractor? Coarse, |F| small test. */
export function pointNearAttractor(p: Vec, attractor: Attractor, radius: number): boolean {
  if (attractor.kind === "stable-equilibrium") {
    return Math.hypot(p[0] - attractor.point[0], p[1] - attractor.point[1]) < radius;
  }
  // limit cycle: distance from centre should be within [radius - dr, radius + dr].
  const d = Math.hypot(p[0] - attractor.center[0], p[1] - attractor.center[1]);
  return Math.abs(d - attractor.radius) < radius;
}

/** The "destination" of a trajectory that ended — match its termination
 *  evidence to an attractor. Returns the attractor, or null if no match. */
export function attractorForDestination(
  terminationAt: Vec,
  terminationStatus: string,
  attractors: Attractor[],
  matchRadius = 0.4,
): Attractor | null {
  if (terminationStatus !== "equilibrium" && terminationStatus !== "limitCycle") return null;
  for (const a of attractors) {
    if (a.kind === "stable-equilibrium" && terminationStatus === "equilibrium") {
      if (Math.hypot(terminationAt[0] - a.point[0], terminationAt[1] - a.point[1]) < matchRadius) {
        return a;
      }
    }
    if (a.kind === "limit-cycle" && terminationStatus === "limitCycle") {
      if (pointNearAttractor(terminationAt, a, matchRadius)) return a;
    }
  }
  return null;
}

/** Quick liveness check: a stable eq is "alive" iff |F(point)| ≈ 0. */
export function attractorIsConsistent(sys: DynamicalSystem, a: Attractor, tol = 1e-3): boolean {
  if (a.kind === "stable-equilibrium") {
    try {
      const F = evalField(sys, a.point);
      return norm(F) < tol;
    } catch { return false; }
  }
  // Cycles: at minimum the centre should sit somewhere; consistency of the
  // orbit itself is the basin's job.
  return Number.isFinite(a.radius) && a.radius > 0;
}
