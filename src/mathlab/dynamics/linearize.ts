// Local linearization of a flow/map at an equilibrium: F(x) ≈ J(x₀)(x − x₀).
//
// Reuses jacobianField (the shared symbolic-then-numeric Jacobian) and the
// general eigensolver (linear/eigen). Surfaces the eigenpairs and — for
// hyperbolic equilibria — the STABLE / UNSTABLE real eigen-directions. These
// feed the saddle inspector (§11), the linearization readout (§12) and the
// manifold tracer (§10). No second Jacobian, no second eigensolver.
//
// HONESTY (§17): this is the LINEAR picture, valid near x₀ (Hartman–Grobman),
// reported as "numerical". Eigenvectors exist only for REAL eigenvalues; a
// complex pair (spiral / center) rotates and has no invariant line ⇒ vector null.
import { eigen } from "../linear/eigen.ts";
import { make } from "../linear/matrix.ts";
import type { Complex } from "../complex/complex.ts";
import type { Vec } from "../linear/vector.ts";
import { jacobianField, type DynamicalSystem } from "./system.ts";
import { classifyEquilibrium, type StabilityResult, type Classification } from "./stability.ts";

export interface EigenPair {
  value: Complex;
  /** Unit real eigenvector, or null for a complex eigenvalue (no invariant line). */
  vector: Vec | null;
}

export interface Linearization {
  point: Vec;
  jacobian: number[][];
  classification: Classification;
  stability: StabilityResult;
  eigenpairs: EigenPair[];
  /** Real eigenvectors along which the flow GROWS (Re λ>0 continuous, |λ|>1 discrete). */
  unstableDirections: Vec[];
  /** Real eigenvectors along which the flow DECAYS (Re λ<0 continuous, |λ|<1 discrete). */
  stableDirections: Vec[];
  confidence: "numerical";
}

/** Growing mode for this system kind: Re λ>0 (flow) or |λ|>1 (map). */
export function isUnstableMode(z: Complex, kind: "continuous" | "discrete"): boolean {
  return kind === "discrete" ? Math.hypot(z.re, z.im) > 1 : z.re > 0;
}
/** Decaying mode for this system kind: Re λ<0 (flow) or |λ|<1 (map). */
export function isStableMode(z: Complex, kind: "continuous" | "discrete"): boolean {
  return kind === "discrete" ? Math.hypot(z.re, z.im) < 1 : z.re < 0;
}

/**
 * Linearize `sys` at `point`. Returns the Jacobian, its eigenpairs (real
 * eigenvectors only), the linear classification, and the stable / unstable
 * real eigen-directions. Always "numerical" confidence.
 */
export function linearize(sys: DynamicalSystem, point: Vec): Linearization {
  const stability = classifyEquilibrium(sys, point);
  const J = jacobianField(sys, point);
  // classifyEquilibrium already ran eigen() on the same J; rerun to recover the
  // aligned eigenVECTORS (StabilityResult carries values only). Cheap for 2×2/3×3.
  const e = eigen(make(J));
  const eigenpairs: EigenPair[] = e.values.map((value, i) => ({ value, vector: e.vectors[i] ?? null }));

  const stableDirections: Vec[] = [];
  const unstableDirections: Vec[] = [];
  for (const { value, vector } of eigenpairs) {
    if (!vector) continue;
    if (isStableMode(value, sys.kind)) stableDirections.push(vector);
    else if (isUnstableMode(value, sys.kind)) unstableDirections.push(vector);
  }

  return {
    point: point.slice(),
    jacobian: J,
    classification: stability.type,
    stability,
    eigenpairs,
    unstableDirections,
    stableDirections,
    confidence: "numerical",
  };
}
