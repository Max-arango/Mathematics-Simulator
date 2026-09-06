// Conserved-quantity diagnostics (Layer 1): energy, momentum, centre of mass, and
// drift — the honesty instruments (§17). If the model breaks a conservation law
// (e.g. gravitationalStrength ≠ 1 makes the pairwise force non-symmetric, or the
// integrator injects energy) the DRIFT numbers expose it instead of hiding it.
import { distance, norm } from "../linear/vector.ts";
import { effectiveMass } from "./potential.ts";
import type { Body3D, FieldParams, Vec3 } from "./types.ts";

export interface SystemMetrics {
  kinetic: number;
  potential: number;
  total: number;
  momentum: Vec3;
  momentumMagnitude: number;
  centerOfMass: Vec3;
  totalMass: number;
}

/** Σ ½ m |v|² using INERTIAL mass. */
export function kineticEnergy(bodies: Body3D[]): number {
  let ke = 0;
  for (const b of bodies) {
    if (!b.active) continue;
    const v2 = b.velocity[0] ** 2 + b.velocity[1] ** 2 + b.velocity[2] ** 2;
    ke += 0.5 * b.mass * v2;
  }
  return ke;
}

/**
 * Σ_{i<j} −G M_i M_j / √(r² + ε²) with M = effectiveMass, Plummer-softened to match
 * the field. NOTE: this is a genuine potential energy only when the force is
 * symmetric (all gravitationalStrength = 1). With experimental strengths it is an
 * APPROXIMATION — surfaced so drift stays interpretable, not asserted as exact.
 */
export function potentialEnergy(bodies: Body3D[], params: FieldParams): number {
  let pe = 0;
  const a = bodies.filter((b) => b.active);
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      const eps = Math.max(a[i].softening ?? params.softening, a[j].softening ?? params.softening);
      const r = distance(a[i].position, a[j].position);
      const d = Math.sqrt(r * r + eps * eps);
      pe += (-params.G * effectiveMass(a[i]) * effectiveMass(a[j])) / d;
    }
  }
  return pe;
}

/** Total linear momentum Σ m v (inertial mass). */
export function momentum(bodies: Body3D[]): Vec3 {
  let px = 0, py = 0, pz = 0;
  for (const b of bodies) {
    if (!b.active) continue;
    px += b.mass * b.velocity[0];
    py += b.mass * b.velocity[1];
    pz += b.mass * b.velocity[2];
  }
  return [px, py, pz];
}

/** Centre of mass Σ m x / Σ m (inertial mass). Returns origin if massless. */
export function centerOfMass(bodies: Body3D[]): { com: Vec3; totalMass: number } {
  let mx = 0, my = 0, mz = 0, m = 0;
  for (const b of bodies) {
    if (!b.active) continue;
    mx += b.mass * b.position[0];
    my += b.mass * b.position[1];
    mz += b.mass * b.position[2];
    m += b.mass;
  }
  return m > 0 ? { com: [mx / m, my / m, mz / m], totalMass: m } : { com: [0, 0, 0], totalMass: 0 };
}

/** All diagnostics in one pass-ish call. */
export function systemMetrics(bodies: Body3D[], params: FieldParams): SystemMetrics {
  const ke = kineticEnergy(bodies);
  const pe = potentialEnergy(bodies, params);
  const p = momentum(bodies);
  const { com, totalMass } = centerOfMass(bodies);
  return {
    kinetic: ke, potential: pe, total: ke + pe,
    momentum: p, momentumMagnitude: norm(p),
    centerOfMass: com, totalMass,
  };
}

/** Relative drift |current − reference| / max(|reference|, floor). Dimensionless. */
export function relativeDrift(current: number, reference: number, floor = 1e-9): number {
  return Math.abs(current - reference) / Math.max(Math.abs(reference), floor);
}
