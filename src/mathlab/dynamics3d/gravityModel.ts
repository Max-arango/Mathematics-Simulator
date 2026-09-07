// Shared Newtonian gravity seam (Layer 1): the ONE place Φ and g = −∇Φ are computed
// for a single source, parameterised by `GravityModel`. field.ts, potential.ts and
// metrics.ts all call through here instead of each inlining their own copy of the
// formula (previously 3x duplicated — see TASK-002 phase 4 audit).
//
//   softened (Plummer, DEFAULT — preserves all pre-existing scenario behaviour):
//     Φ = −GM/d,  g = GM·Δ/d³   where d = √(r²+ε²)   (finite everywhere by construction)
//
//   exact (unsoftened Newtonian):
//     Φ = −GM/r,  g = GM·Δ/r³                          (Newton's law exactly)
//   Near r=0 this blows up. Spec forbids silently substituting the softened formula
//   there (that would hide the singularity instead of being honest about it), so we
//   clamp r to EXACT_MIN_R and report `hitFloor: true` — the clamp event is visible
//   to any caller that inspects it, not silently absorbed.
import type { Vec3, GravityModel, FieldParams } from "./types.ts";

/**
 * Distance floor for the "exact" model, below which a point-mass idealisation is
 * physically meaningless anyway. Keeps 1/r² finite without pretending r=0 is fine.
 */
export const EXACT_MIN_R = 1e-6;

/** `params.model` defaults to "softened" — additive, not a default-behaviour change. */
export function resolveModel(params: FieldParams): GravityModel {
  return params.model ?? "softened";
}

export interface GravityPotentialResult {
  phi: number;
  hitFloor: boolean;
}

/** Potential contribution Φ_i from one source at separation r = |x − source|. */
export function gravityPotential(
  r: number, G: number, M: number, eps: number, model: GravityModel,
): GravityPotentialResult {
  if (model === "exact") {
    const hitFloor = r < EXACT_MIN_R;
    const rc = hitFloor ? EXACT_MIN_R : r;
    return { phi: (-G * M) / rc, hitFloor };
  }
  const d = Math.sqrt(r * r + eps * eps); // Plummer softened distance
  return { phi: (-G * M) / d, hitFloor: false };
}

export interface GravityFieldResult {
  g: Vec3;
  hitFloor: boolean;
}

/**
 * Field/force contribution g_i = −∇Φ_i from one source, given the RAW separation
 * vector `delta` (= sourcePos − x, pointing toward the source) and its squared
 * length `r2 = |delta|²`.
 */
export function gravityField(
  delta: Vec3, r2: number, G: number, M: number, eps: number, model: GravityModel,
): GravityFieldResult {
  if (model === "exact") {
    const r = Math.sqrt(r2);
    if (r === 0) return { g: [0, 0, 0], hitFloor: true }; // direction undefined at r=0
    const hitFloor = r < EXACT_MIN_R;
    const rc = hitFloor ? EXACT_MIN_R : r;
    const f = (G * M) / (rc * rc * r); // f·delta = (GM/rc²)·(delta/r) = (GM/rc²)·r̂
    return { g: [f * delta[0], f * delta[1], f * delta[2]], hitFloor };
  }
  const denom = Math.pow(r2 + eps * eps, 1.5); // Plummer: g = GM·Δ/(r²+ε²)^{3/2}
  const f = (G * M) / denom;
  return { g: [f * delta[0], f * delta[1], f * delta[2]], hitFloor: false };
}
