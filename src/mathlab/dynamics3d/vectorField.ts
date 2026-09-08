// Arbitrary 3D mathematical vector field  x' = F(x)  for Dynamics 3D.
//
// This is the "Vector Field" model of Dynamics 3D — completely separate from the
// gravitational N-body model (types.ts / simulation.ts). A field is just three
// expression sources dx/dt, dy/dt, dz/dt over the state variables x,y,z plus named
// parameters (sigma, rho, beta, …). It REUSES the shared infrastructure end to end:
//
//   • the shared vector-field model  (mathlab/dynamics/system: makeSystem/evalField)
//   • the shared ODE registry        (mathlab/dynamics/trajectory: simulate → ode)
//
// There is NO new parser, NO new integrator and NO eval() here — a field is compiled
// to AST once by the same parser the 2D lab uses and integrated by the same RK
// solvers. That keeps a Lorenz/Rössler/Thomas attractor a *user-definable* object,
// not a hardcoded special case.
import { makeSystem, evalField, type DynamicalSystem } from "../dynamics/system.ts";
import { simulate } from "../dynamics/trajectory.ts";

export type Vec3 = [number, number, number];

/** The 3 state variables, in order. Positions align to every Vec3 here. */
export const VARS3 = ["x", "y", "z"];

export interface VectorFieldSpec {
  /** dx/dt, dy/dt, dz/dt as expression sources over x,y,z (+ named params). */
  field: [string, string, string];
  /** Named parameters bound at eval time (bifurcation knobs). */
  params: Record<string, number>;
}

export interface FieldPreset extends VectorFieldSpec {
  id: string;
  label: string;
  description: string;
  /** Initial conditions to seed one trajectory each. */
  seeds: Vec3[];
  /** Integration horizon (dimensionless time). */
  tEnd: number;
  /** Fixed RK4 step count over [0, tEnd]. Uniform spacing → clean probe animation. */
  steps: number;
  /** Camera hint used when the preset is loaded. */
  view: { yaw: number; pitch: number; dist: number; target: Vec3 };
}

/**
 * Build a continuous 3D dynamical system from a field spec. Throws InvalidInputError
 * on an unparseable expression or an unknown symbol — the UI catches it and shows a
 * banner instead of ever crashing the render loop.
 */
export function buildFieldSystem(spec: VectorFieldSpec): DynamicalSystem {
  return makeSystem(["x", "y", "z"], spec.field, spec.params, "continuous");
}

export interface Streamline {
  seed: Vec3;
  points: Vec3[];
  /** true if integration hit a non-finite state (the field diverged) before tEnd. */
  diverged: boolean;
}

/**
 * Integrate one trajectory from each seed with fixed-step RK4 (uniform spacing). The
 * shared solver already halts on a non-finite state; we additionally truncate at the
 * last finite sample and flag `diverged`, so a blow-up is surfaced, never drawn as
 * garbage or silently ignored.
 */
export function integrateStreamlines(
  sys: DynamicalSystem, seeds: Vec3[], tEnd: number, steps: number, method = "rk4",
): Streamline[] {
  return seeds.map((seed) => {
    const { states } = simulate(sys, seed, { method, t1: tEnd, steps });
    const points: Vec3[] = [];
    let diverged = false;
    for (const s of states) {
      if (!Number.isFinite(s[0]) || !Number.isFinite(s[1]) || !Number.isFinite(s[2])) { diverged = true; break; }
      points.push([s[0], s[1], s[2]]);
    }
    return { seed, points, diverged };
  });
}

/** Axis-aligned bounds of every streamline point → a center + radius for camera fit. */
export function streamlineBounds(lines: Streamline[]): { center: Vec3; radius: number } {
  let lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const l of lines) for (const p of l.points) {
    for (let c = 0; c < 3; c++) { if (p[c] < lo[c]) lo[c] = p[c]; if (p[c] > hi[c]) hi[c] = p[c]; }
  }
  if (!Number.isFinite(lo[0])) return { center: [0, 0, 0], radius: 10 }; // no points
  const center: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radius = Math.max(1, 0.5 * Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
  return { center, radius };
}

export interface FieldArrow { pos: Vec3; dir: Vec3; mag: number; }

/**
 * Sample the field on an n×n×n grid centred at `center` spanning ±extent per axis.
 * Returns unit direction + magnitude at each finite sample (non-finite points, e.g. a
 * pole, are dropped). Pure — the renderer scales/draws; this owns no drawing.
 */
export function sampleFieldArrows(sys: DynamicalSystem, center: Vec3, extent: number, n: number): FieldArrow[] {
  const out: FieldArrow[] = [];
  const span = 2 * extent;
  const at = (i: number) => (n <= 1 ? 0 : -extent + (span * i) / (n - 1));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const pos: Vec3 = [center[0] + at(i), center[1] + at(j), center[2] + at(k)];
    const v = evalField(sys, pos);
    if (!Number.isFinite(v[0]) || !Number.isFinite(v[1]) || !Number.isFinite(v[2])) continue;
    const mag = Math.hypot(v[0], v[1], v[2]);
    if (!(mag > 0)) continue;
    out.push({ pos, dir: [v[0] / mag, v[1] / mag, v[2] / mag], mag });
  }
  return out;
}

// ── Preset library ────────────────────────────────────────────────────────────
// Classic 3D flows. Each is an ordinary user-definable field — nothing here is
// special-cased in the engine; the strings below are exactly what a user could type.
export const FIELD_PRESETS: FieldPreset[] = [
  {
    id: "lorenz",
    label: "Lorenz attractor",
    description: "Convection model (Lorenz 1963). Chaotic butterfly attractor; nearby seeds diverge exponentially.",
    field: ["sigma*(y - x)", "x*(rho - z) - y", "x*y - beta*z"],
    params: { sigma: 10, rho: 28, beta: 8 / 3 },
    seeds: [[0, 1, 1.05], [0.01, 1, 1.05], [-1, 0, 20], [5, 5, 20], [-8, -8, 27]],
    tEnd: 45, steps: 6000,
    view: { yaw: 0.9, pitch: 0.35, dist: 95, target: [0, 0, 25] },
  },
  {
    id: "rossler",
    label: "Rössler attractor",
    description: "Rössler system (1976). A single folded band; simpler than Lorenz but still chaotic.",
    field: ["-(y + z)", "x + a*y", "b + z*(x - c)"],
    params: { a: 0.2, b: 0.2, c: 5.7 },
    seeds: [[0.1, 0, 0], [1, 1, 0], [-2, 0, 0.2]],
    tEnd: 160, steps: 8000,
    view: { yaw: 1.0, pitch: 0.5, dist: 60, target: [0, 0, 3] },
  },
  {
    id: "thomas",
    label: "Thomas' cyclically symmetric",
    description: "Thomas (1999). Fully symmetric in x,y,z; a labyrinth-like chaotic attractor.",
    field: ["sin(y) - b*x", "sin(z) - b*y", "sin(x) - b*z"],
    params: { b: 0.208 },
    seeds: [[0.1, 0, 0], [1.5, 1.5, 1.5], [-2, 1, 0]],
    tEnd: 180, steps: 8000,
    view: { yaw: 0.8, pitch: 0.6, dist: 26, target: [0, 0, 0] },
  },
  {
    id: "halvorsen",
    label: "Halvorsen attractor",
    description: "Halvorsen system: cyclically symmetric with quadratic coupling.",
    field: ["-a*x - 4*y - 4*z - y^2", "-a*y - 4*z - 4*x - z^2", "-a*z - 4*x - 4*y - x^2"],
    params: { a: 1.89 },
    seeds: [[-1.48, -1.51, 2.04], [-1, -1, 1], [0, 0, 0.1]],
    tEnd: 60, steps: 7000,
    view: { yaw: 0.9, pitch: 0.5, dist: 34, target: [-4, -4, -4] },
  },
  {
    id: "rotation",
    label: "Rotational flow + decay",
    description: "Linear field: rigid rotation about z with slow vertical decay. Trajectories spiral onto the z = 0 plane.",
    field: ["-y", "x", "-0.15*z"],
    params: {},
    seeds: [[6, 0, 8], [3, 0, 5], [0, 8, -6], [-5, 5, 4]],
    tEnd: 26, steps: 3000,
    view: { yaw: 0.9, pitch: 0.6, dist: 40, target: [0, 0, 0] },
  },
  {
    id: "spiral-sink",
    label: "Stable spiral sink",
    description: "Linear field with all eigenvalues in the left half-plane: every trajectory spirals into the origin.",
    field: ["-0.3*x - y", "x - 0.3*y", "-0.5*z"],
    params: {},
    seeds: [[10, 0, 8], [-8, 6, -6], [4, -9, 5]],
    tEnd: 30, steps: 3000,
    view: { yaw: 0.9, pitch: 0.5, dist: 40, target: [0, 0, 0] },
  },
  {
    id: "saddle",
    label: "Linear saddle (1 unstable dir)",
    description: "dx/dt = x, dy/dt = −y, dz/dt = −z. Unstable along x, stable in the y–z plane — a 3D saddle.",
    field: ["x", "-y", "-z"],
    params: {},
    seeds: [[0.1, 6, 6], [0.1, -6, 4], [-0.1, 5, -5], [-0.1, -4, -6]],
    tEnd: 4, steps: 1500,
    view: { yaw: 0.9, pitch: 0.4, dist: 34, target: [0, 0, 0] },
  },
];
