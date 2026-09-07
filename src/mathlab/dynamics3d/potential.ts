// Effective gravitational potential Φ (Layer 1). Defaults to SOFTENED NEWTONIAN — a
// "visual space-time approximation", NOT the Einstein metric (§2, §37) — with an
// "exact" (unsoftened) alternative. Φ/g formulas live in gravityModel.ts (the single
// shared seam, also used by field.ts and metrics.ts).
//
// We use PLUMMER softening so the field is exactly the gradient of the potential:
//
//   Φ_i(x) = −G · M_i / √(|x − x_i|² + ε²)          (per source i)
//   Φ(x)   = Σ_i Φ_i(x)
//   g(x)   = −∇Φ(x)                                  (see field.ts — exact for this Φ)
//
// where M_i = effectiveMass(body_i) = mass · gravitationalStrength (§10). The spec's
// alternative Φ = −G M/(r+ε) is NOT self-consistent with an inverse-square field;
// Plummer is the standard regularisation that keeps g = −∇Φ EXACT (needed for honest
// energy bookkeeping) and → Newtonian 1/r² as ε → 0. See metrics.ts / DOCS.
import { distance } from "../linear/vector.ts";
import { gravityPotential, resolveModel } from "./gravityModel.ts";
import type { Body3D, FieldParams, Vec3 } from "./types.ts";

/** Effective gravitational SOURCE mass (experimental strength × inertial mass, §10). */
export function effectiveMass(b: Body3D): number {
  return b.mass * b.gravitationalStrength;
}

/**
 * Effective potential Φ(x) = Σ_i Φ_i(x) summed over ACTIVE bodies (softened or exact
 * per `params.model`, see gravityModel.ts). `exclude` (a body id) skips one source —
 * used when evaluating the potential a body feels from all the OTHERS. Softened is
 * always finite; exact is clamped near r=0 (see EXACT_MIN_R).
 */
export function potentialAt(
  x: Vec3, bodies: Body3D[], params: FieldParams, exclude?: string,
): number {
  const model = resolveModel(params);
  let phi = 0;
  for (const b of bodies) {
    if (!b.active || b.id === exclude) continue;
    const eps = b.softening ?? params.softening;
    const r = distance(x, b.position);
    phi += gravityPotential(r, params.G, effectiveMass(b), eps, model).phi;
  }
  return phi;
}
