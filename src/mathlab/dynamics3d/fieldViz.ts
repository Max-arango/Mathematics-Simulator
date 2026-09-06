// Field-visualization sampling (Layer 4). PURE thin wrappers over field.ts /
// potential.ts — no new physics. The renderer calls these to draw the gravity
// field, the space-time DEFORMATION PROXY (a rubber-sheet from the effective
// potential — NOT the Einstein metric, §7/§21) and field lines.
import { norm } from "../linear/vector.ts";
import { fieldAt, fieldLineStep } from "./field.ts";
import { potentialAt } from "./potential.ts";
import type { Body3D, FieldParams, Vec3 } from "./types.ts";

export interface FieldSample { pos: Vec3; g: Vec3; mag: number; }

/** Sample g(x) on an n×n grid over [−extent,extent]² of the plane z = `z`. */
export function sampleFieldGridZ(
  bodies: Body3D[], params: FieldParams, extent: number, n: number, z = 0,
): FieldSample[] {
  const out: FieldSample[] = [];
  const span = 2 * extent;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = -extent + (span * i) / (n - 1);
      const y = -extent + (span * j) / (n - 1);
      const pos: Vec3 = [x, y, z];
      const g = fieldAt(pos, bodies, params);
      out.push({ pos, g, mag: norm(g) });
    }
  }
  return out;
}

export interface SurfaceVertex { x: number; y: number; z: number; phi: number; }

/**
 * Space-time DEFORMATION PROXY: a deformed sheet over the z=0 plane whose height
 * dips into wells (Φ ≤ 0) — the familiar "rubber sheet". Returns an (n×n) vertex
 * grid for wireframe drawing. Visualises the effective POTENTIAL, not the metric
 * tensor (§7/§37).
 *
 * SMOOTH depth mapping (no corners): z = −maxDepth · tanh(scale·|Φ| / maxDepth).
 * A hard clamp would flatten deep wells into a disc with a sharp rim/corner at each
 * singularity; tanh saturates ASYMPTOTICALLY so the surface stays smooth (C¹) all the
 * way to the bottom. Combined with a high grid resolution the curvature reads cleanly.
 */
export function potentialSurfaceZ(
  bodies: Body3D[], params: FieldParams, extent: number, n: number, scale: number, maxDepth = extent,
): SurfaceVertex[][] {
  const span = 2 * extent;
  const md = Math.max(1e-6, maxDepth);
  const grid: SurfaceVertex[][] = [];
  for (let i = 0; i < n; i++) {
    const row: SurfaceVertex[] = [];
    for (let j = 0; j < n; j++) {
      const x = -extent + (span * i) / (n - 1);
      const y = -extent + (span * j) / (n - 1);
      const phi = potentialAt([x, y, 0], bodies, params);
      // phi ≤ 0 ⇒ depth ≥ 0; tanh gives a smooth, corner-free well.
      const z = -md * Math.tanh((scale * -phi) / md);
      row.push({ x, y, z, phi });
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Trace a field line by integrating dx/ds = ±normalised(g) (§20). `sign` = +1 follows
 * the field into the wells (toward mass); −1 traces outward. Stops on a near-body
 * capture, when |g| vanishes, or after `steps`/leaving `bound`. Distinct from a
 * particle trajectory (which follows velocity, not the instantaneous field).
 */
export function traceFieldLine(
  seed: Vec3, bodies: Body3D[], params: FieldParams,
  opts: { steps?: number; ds?: number; bound?: number; sign?: 1 | -1 } = {},
): Vec3[] {
  const steps = opts.steps ?? 60;
  const ds = (opts.ds ?? 0.5) * (opts.sign ?? 1);
  const bound = opts.bound ?? 1e4;
  const line: Vec3[] = [seed.slice() as Vec3];
  let x = seed;
  for (let k = 0; k < steps; k++) {
    const nx = fieldLineStep(x, bodies, params, ds);
    if (!nx) break;
    line.push(nx);
    x = nx;
    if (norm(x) > bound) break;
    // stop if we've fallen into a body (near its radius)
    if (bodies.some((b) => b.active && Math.hypot(b.position[0] - x[0], b.position[1] - x[1], b.position[2] - x[2]) < b.radius * 1.2)) break;
  }
  return line;
}
