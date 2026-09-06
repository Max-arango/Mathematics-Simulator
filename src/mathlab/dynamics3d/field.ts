// Effective gravitational field g(x) = −∇Φ(x) and N-body accelerations (Layer 1).
//
// For the Plummer potential Φ_i = −G M_i/√(r²+ε²) (see potential.ts) the field is
// EXACTLY the gradient:
//
//   g_i(x) = −∇Φ_i = G M_i (x_i − x) / (r² + ε²)^{3/2}
//   g(x)   = Σ_i g_i(x)
//
// The acceleration a body i feels is the field of all the OTHER bodies evaluated at
// its position — so N-body accel is just fieldAt(x_i, …, exclude=i). Fully
// BIDIRECTIONAL (§4): every active body with non-zero effectiveMass pulls every
// other. The test body's own inertial mass cancels (Newtonian equivalence): a_i is
// independent of m_i, driven by the sources' effectiveMass.
//
// Reuses mathlab/linear/vector (sub/scale/norm) — no bespoke vector algebra.
import { norm } from "../linear/vector.ts";
import { effectiveMass } from "./potential.ts";
import type { Body3D, FieldParams, Vec3 } from "./types.ts";

const ZERO: Vec3 = [0, 0, 0];

/**
 * Effective field g(x) = −∇Φ(x) = Σ G M_i (x_i − x)/(r²+ε²)^{3/2} over ACTIVE
 * sources (skip `exclude`). This is the acceleration a test particle would feel at
 * x. Softening (per-source ε) keeps it finite everywhere — no division by zero.
 */
export function fieldAt(
  x: Vec3, bodies: Body3D[], params: FieldParams, exclude?: string,
): Vec3 {
  let gx = 0, gy = 0, gz = 0;
  for (const b of bodies) {
    if (!b.active || b.id === exclude) continue;
    const M = effectiveMass(b);
    if (M === 0) continue;
    const eps = b.softening ?? params.softening;
    const dx = b.position[0] - x[0];
    const dy = b.position[1] - x[1];
    const dz = b.position[2] - x[2];
    const r2 = dx * dx + dy * dy + dz * dz;
    const denom = Math.pow(r2 + eps * eps, 1.5);
    const f = (params.G * M) / denom;
    gx += f * dx; gy += f * dy; gz += f * dz;
  }
  return [gx, gy, gz];
}

/** Acceleration on body i = field of all OTHER active bodies at its position (§4). */
export function accelerationOn(body: Body3D, bodies: Body3D[], params: FieldParams): Vec3 {
  if (!body.active) return [...ZERO];
  return fieldAt(body.position, bodies, params, body.id);
}

/** Accelerations for every body (aligned to `bodies`). Inactive bodies get 0. */
export function accelerations(bodies: Body3D[], params: FieldParams): Vec3[] {
  return bodies.map((b) => accelerationOn(b, bodies, params));
}

/**
 * Fractional contribution of each source to a body's acceleration magnitude —
 * "dominant gravitational sources" for the inspector (§18). Returns entries sorted
 * by descending share, each in [0,1]; shares sum to ≤1 (vector cancellation can make
 * the net magnitude smaller than the sum of parts, so we normalise by Σ|per-source|).
 */
export function accelerationSources(
  body: Body3D, bodies: Body3D[], params: FieldParams,
): { id: string; name: string; share: number; magnitude: number }[] {
  const parts: { id: string; name: string; magnitude: number }[] = [];
  let total = 0;
  for (const b of bodies) {
    if (!b.active || b.id === body.id) continue;
    const g = fieldAt(body.position, [b], params); // field from this one source
    const m = norm(g);
    if (m > 0) { parts.push({ id: b.id, name: b.name, magnitude: m }); total += m; }
  }
  return parts
    .map((p) => ({ ...p, share: total > 0 ? p.magnitude / total : 0 }))
    .sort((a, b) => b.share - a.share);
}

/** Advance one field line by arc-length ds along the normalised field (§20). */
export function fieldLineStep(x: Vec3, bodies: Body3D[], params: FieldParams, ds: number): Vec3 | null {
  const g = fieldAt(x, bodies, params);
  const m = norm(g);
  if (m < 1e-12 || !Number.isFinite(m)) return null;
  return [x[0] + (g[0] / m) * ds, x[1] + (g[1] / m) * ds, x[2] + (g[2] / m) * ds];
}

export { ZERO as ZERO_VEC3 };
