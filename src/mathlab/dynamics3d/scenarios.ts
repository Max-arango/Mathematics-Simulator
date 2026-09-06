// Scenario presets (§23). Pure factories → Body3D[] with physically-motivated
// initial conditions (circular speed v = √(G M / r) about a dominant mass, G = 1
// dimensionless). Deterministic ids (no Date/random) so runs are reproducible.
import type { Body3D, Vec3 } from "./types.ts";

export interface Scenario {
  id: string;
  name: string;
  description: string;
  bodies: Body3D[];
  /** Suggested physics timestep for this scenario. */
  dt: number;
}

let uid = 0;
function mk(
  name: string, type: Body3D["type"], position: Vec3, velocity: Vec3, mass: number, radius: number,
  extra: Partial<Body3D> = {},
): Body3D {
  return {
    id: `b3d-${uid++}`, name, type, position, velocity, acceleration: [0, 0, 0],
    mass, radius, gravitationalStrength: 1, active: true, ...extra,
  };
}

/** Circular speed about a central mass M at distance r (G = 1). */
const vCirc = (M: number, r: number) => Math.sqrt(M / r);

export const SCENARIO_IDS = [
  "binary", "planetary", "three-body", "slingshot", "singularities", "escape",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export function makeScenario(id: ScenarioId): Scenario {
  uid = 0; // deterministic ids per build
  switch (id) {
    case "binary": {
      const m = 50, d = 6, v = Math.sqrt(m / (2 * d)); // equal-mass circular binary
      return {
        id, name: "Binary System", dt: 0.01,
        description: "Two equal stars in a circular orbit about their common centre of mass.",
        bodies: [
          mk("Star A", "star", [d / 2, 0, 0], [0, v, 0], m, 0.6),
          mk("Star B", "star", [-d / 2, 0, 0], [0, -v, 0], m, 0.6),
        ],
      };
    }
    case "planetary": {
      const M = 1000;
      return {
        id, name: "Planetary System", dt: 0.005,
        description: "A star with three planets on tilted circular orbits.",
        bodies: [
          mk("Star", "star", [0, 0, 0], [0, 0, 0], M, 1.0),
          mk("Planet I", "planet", [8, 0, 0], [0, vCirc(M, 8), 0], 1, 0.3),
          mk("Planet II", "planet", [0, 15, 0], [-vCirc(M, 15), 0, vCirc(M, 15) * 0.15], 2, 0.35),
          mk("Planet III", "planet", [22, 0, 3], [0, vCirc(M, 22), 0], 1.5, 0.32),
        ],
      };
    }
    case "three-body": {
      const m = 40, r = 5;
      // Equilateral triangle, each with a tangential kick — the classic (chaotic) 3-body.
      const pts: Vec3[] = [
        [r, 0, 0],
        [-r / 2, (r * Math.sqrt(3)) / 2, 0],
        [-r / 2, -(r * Math.sqrt(3)) / 2, 0],
      ];
      const v = Math.sqrt(m / r) * 0.5;
      const tang = (p: Vec3): Vec3 => [-p[1] / r, p[0] / r, 0].map((c) => c * v) as Vec3;
      return {
        id, name: "Three-Body Problem", dt: 0.005,
        description: "Three equal masses in a triangle — sensitive, generally chaotic dynamics.",
        bodies: pts.map((p, i) => mk(`Body ${i + 1}`, "planet", p, tang(p), m, 0.4)),
      };
    }
    case "slingshot": {
      const M = 800;
      return {
        id, name: "Gravitational Slingshot", dt: 0.004,
        description: "A light probe on a hyperbolic flyby past a heavy planet — energy exchange.",
        bodies: [
          mk("Planet", "planet", [0, 0, 0], [0, 0, 0], M, 0.9),
          mk("Probe", "particle", [-25, -6, 0], [vCirc(M, 25) * 1.3, 0, 0], 1e-3, 0.2),
        ],
      };
    }
    case "singularities": {
      const m = 400;
      const v = Math.sqrt(m / (2 * 8));
      return {
        id, name: "Interacting Singularities", dt: 0.004,
        description: "Two softened singularities orbiting, with test particles. Capture is a model rule, not GR.",
        bodies: [
          mk("Singularity α", "singularity", [4, 0, 0], [0, v, 0], m, 0.5, { softening: 0.3, absorptionRadius: 0.8 }),
          mk("Singularity β", "singularity", [-4, 0, 0], [0, -v, 0], m, 0.5, { softening: 0.3, absorptionRadius: 0.8 }),
          mk("Probe 1", "particle", [0, 12, 0], [-6, 0, 0], 1e-3, 0.15),
          mk("Probe 2", "particle", [0, -14, 2], [5, 0, 0], 1e-3, 0.15),
        ],
      };
    }
    case "escape": {
      const M = 500, r = 6;
      const vEsc = Math.sqrt((2 * M) / r);
      return {
        id, name: "Escape Velocity", dt: 0.004,
        description: "A particle launched above escape velocity leaves the system.",
        bodies: [
          mk("Star", "star", [0, 0, 0], [0, 0, 0], M, 0.8),
          mk("Particle", "particle", [r, 0, 0], [0, vEsc * 1.2, 0], 1e-3, 0.2),
        ],
      };
    }
  }
}
