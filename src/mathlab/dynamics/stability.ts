// Linear stability classification of an equilibrium / fixed point, from the
// eigenvalues of the Jacobian evaluated there (Hartman–Grobman linearization).
//
// The criterion depends on the system KIND — this is the crux (spec §17):
//   • CONTINUOUS (flow):  stability is governed by the SIGN OF Re(λ). Re(λ)<0 ⇒
//     the mode decays, Re(λ)>0 ⇒ it grows. λ = a±bi with a<0, b≠0 is a stable spiral.
//   • DISCRETE (map):     stability is governed by the MODULUS |λ|. |λ|<1 ⇒ the mode
//     decays under iteration, |λ|>1 ⇒ it grows. The continuous Re(λ) rule is WRONG here:
//     e.g. λ = −2 has Re<0 (would read "stable" as a flow) but |λ|=2>1 ⇒ UNSTABLE as a map.
//
// CONFIDENCE — everything here is "numerical" and LINEAR:
//   • A center (Re λ = 0, purely imaginary) is a LINEAR verdict only: nonlinear terms can
//     turn it into a slow spiral either way. Reported, not certified.
//   • A zero / unit-modulus eigenvalue is NON-HYPERBOLIC: the linearization is inconclusive
//     ⇒ "inconclusive" (the higher-order terms decide).
//   • If the eigensolver did not converge (eigen().converged === false) we do NOT classify —
//     "inconclusive" with the solver's warning carried through.
import { ABS_TOL } from "../core/constants.ts";
import { make, type Matrix } from "../linear/matrix.ts";
import { eigen } from "../linear/eigen.ts";
import { abs, type Complex } from "../complex/complex.ts";
import { jacobianField, type DynamicalSystem } from "./system.ts";
import type { Vec } from "../linear/vector.ts";

export type Classification =
  | "stable-node"
  | "unstable-node"
  | "saddle"
  | "stable-spiral"
  | "unstable-spiral"
  | "center"
  | "inconclusive";

export interface StabilityResult {
  type: Classification;
  eigenvalues: Complex[];
  jacobian: number[][];
  reason: string;
  confidence: "numerical";
}

// |Re λ| (continuous) or | |λ|−1 | (discrete) within this of the boundary ⇒ treated as
// on the boundary (non-hyperbolic / center / marginal). A numerical threshold, not exact.
const TOL = ABS_TOL;

/** Jacobian of the field evaluated numerically at `point`, as a Matrix (for eigen()). */
export function jacobianAtPoint(sys: DynamicalSystem, point: Vec): Matrix {
  return make(jacobianField(sys, point));
}

const hasComplexPair = (vals: Complex[]): boolean => vals.some((z) => Math.abs(z.im) > TOL);

// Continuous flow: classify by the sign of Re(λ).
function classifyContinuous(vals: Complex[]): { type: Classification; reason: string } {
  const spiral = hasComplexPair(vals);
  const zeroReal = vals.filter((z) => Math.abs(z.re) <= TOL);

  if (zeroReal.length > 0) {
    const allBoundary = vals.every((z) => Math.abs(z.re) <= TOL);
    // A pair sitting exactly on the imaginary axis (Re≈0, Im≠0) with nothing growing.
    if (allBoundary && spiral) {
      return {
        type: "center",
        reason: "eigenvalues are purely imaginary (Re λ ≈ 0): a LINEAR center; nonlinear terms may change this.",
      };
    }
    return {
      type: "inconclusive",
      reason: "a zero / near-zero real part makes the equilibrium non-hyperbolic; linearization is inconclusive.",
    };
  }

  const allNeg = vals.every((z) => z.re < -TOL);
  const allPos = vals.every((z) => z.re > TOL);
  if (allNeg) {
    return spiral
      ? { type: "stable-spiral", reason: "all Re λ < 0 with a complex pair: trajectories spiral inward." }
      : { type: "stable-node", reason: "all Re λ < 0 (real): trajectories decay to the equilibrium." };
  }
  if (allPos) {
    return spiral
      ? { type: "unstable-spiral", reason: "all Re λ > 0 with a complex pair: trajectories spiral outward." }
      : { type: "unstable-node", reason: "all Re λ > 0 (real): trajectories grow away from the equilibrium." };
  }
  // mixed signs of Re λ (a spiral-saddle is reported here as "saddle"; see reason).
  return {
    type: "saddle",
    reason: spiral
      ? "Re λ of mixed sign with a complex pair (spiral-saddle): stable and unstable directions coexist."
      : "Re λ of mixed sign: stable and unstable directions coexist (saddle).",
  };
}

// Discrete map: classify by the modulus |λ| relative to the unit circle.
function classifyDiscrete(vals: Complex[]): { type: Classification; reason: string } {
  const spiral = hasComplexPair(vals);
  const mods = vals.map(abs);

  if (mods.some((m) => Math.abs(m - 1) <= TOL)) {
    return {
      type: "inconclusive",
      reason: "an eigenvalue lies on the unit circle (|λ| ≈ 1): marginal / non-hyperbolic, linearization inconclusive.",
    };
  }
  const allInside = mods.every((m) => m < 1 - TOL);
  const allOutside = mods.every((m) => m > 1 + TOL);
  if (allInside) {
    return spiral
      ? { type: "stable-spiral", reason: "all |λ| < 1 with a complex pair: the orbit spirals into the fixed point." }
      : { type: "stable-node", reason: "all |λ| < 1: iterates converge to the fixed point." };
  }
  if (allOutside) {
    return spiral
      ? { type: "unstable-spiral", reason: "all |λ| > 1 with a complex pair: the orbit spirals away." }
      : { type: "unstable-node", reason: "all |λ| > 1: iterates diverge from the fixed point." };
  }
  // some inside, some outside the unit circle → a discrete saddle.
  return { type: "saddle", reason: "|λ| straddles the unit circle: contracting and expanding directions coexist (saddle)." };
}

/**
 * Classify an equilibrium (continuous) / fixed point (discrete) by linearization.
 * Returns the type, the Jacobian eigenvalues, the Jacobian itself, a human reason, and
 * `confidence:"numerical"`. Applies the KIND-appropriate criterion (Re λ vs |λ|); returns
 * "inconclusive" for non-hyperbolic cases and when the eigensolver failed to converge.
 */
export function classifyEquilibrium(sys: DynamicalSystem, point: Vec): StabilityResult {
  const J = jacobianAtPoint(sys, point);
  const e = eigen(J);

  if (!e.converged) {
    return {
      type: "inconclusive",
      eigenvalues: e.values,
      jacobian: J.data,
      reason: `eigensolver did not converge; cannot classify. ${e.warnings.join(" ")}`.trim(),
      confidence: "numerical",
    };
  }

  const { type, reason } = sys.kind === "discrete"
    ? classifyDiscrete(e.values)
    : classifyContinuous(e.values);

  return { type, eigenvalues: e.values, jacobian: J.data, reason, confidence: "numerical" };
}
