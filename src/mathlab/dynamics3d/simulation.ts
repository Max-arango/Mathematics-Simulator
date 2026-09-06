// Simulation state machine (Layer 2). Owns TIME, integration cadence, trails,
// collisions, numerical safety and termination — the physics runs HERE, never in
// React (§27). The view holds a Simulation in a ref and calls stepSimulation() from
// its animation loop; nothing here imports React.
//
// TIMESTEP SEPARATION (§5):
//   • physics dt   — the integrator step (fixed; the physics never sees "speed").
//   • substeps     — physics steps advanced per stepSimulation() call.
//   • sim speed    — a VIEW concern: how many stepSimulation() calls per frame. The
//                    view scales that; it must NOT change dt (would change the physics).
import { distance, norm } from "../linear/vector.ts";
import { step, type Integrator } from "./integrators.ts";
import { accelerations } from "./field.ts";
import { effectiveMass } from "./potential.ts";
import { systemMetrics, momentum, relativeDrift, type SystemMetrics } from "./metrics.ts";
import {
  DEFAULT_FIELD, type Body3D, type CollisionMode, type FieldParams,
  type SimulationStatus, type TerminationReason, type UnitSystem, type Vec3,
} from "./types.ts";

// Numerical-safety ceilings (§33). Beyond these the run is flagged, not hidden.
const MAX_COORD = 1e7;
const MAX_SPEED = 1e6;

export interface SimulationOptions {
  params?: FieldParams;
  integrator?: Integrator;
  dt?: number;
  collisionMode?: CollisionMode;
  trailLength?: number;
  units?: UnitSystem;
  /** Bodies beyond this radius from the origin are marked escaped (0 = disabled). */
  domainRadius?: number;
  /** Max recorded history frames for the time scrubber (ring buffer). Default 20000. */
  maxHistory?: number;
}

/**
 * A per-step snapshot for the time scrubber, stored COMPACTLY: `ids` names the bodies
 * and `data` is a flat Float32Array of 7 values each — [px,py,pz,vx,vy,vz,active].
 * Float32 (not objects) makes long recordings affordable (≈4× lighter); acceleration
 * is recomputed on read (frameToBodies) rather than stored.
 */
export interface HistoryFrame { t: number; steps: number; ids: string[]; data: Float32Array; }
const FRAME_STRIDE = 7;

export interface Simulation {
  bodies: Body3D[];
  params: FieldParams;
  integrator: Integrator;
  dt: number;
  time: number;
  steps: number;
  status: SimulationStatus;
  termination: TerminationReason | null;
  collisionMode: CollisionMode;
  trails: Map<string, Vec3[]>;
  trailLength: number;
  units: UnitSystem;
  domainRadius: number;
  /** Reference conserved quantities (for drift readouts). */
  initialEnergy: number;
  initialMomentum: Vec3;
  /** Deep snapshot of the initial bodies for reset(). */
  readonly _initial: Body3D[];
  events: string[];
  /** Recorded state per step (ring-bounded) — enables scrubbing back/forward in time. */
  history: HistoryFrame[];
  maxHistory: number;
}

/** Snapshot the current state for the history recorder (compact Float32 layout). */
function snapshot(sim: Simulation): HistoryFrame {
  const n = sim.bodies.length;
  const ids = new Array<string>(n);
  const data = new Float32Array(n * FRAME_STRIDE);
  for (let i = 0; i < n; i++) {
    const b = sim.bodies[i];
    ids[i] = b.id;
    const o = i * FRAME_STRIDE;
    data[o] = b.position[0]; data[o + 1] = b.position[1]; data[o + 2] = b.position[2];
    data[o + 3] = b.velocity[0]; data[o + 4] = b.velocity[1]; data[o + 5] = b.velocity[2];
    data[o + 6] = b.active ? 1 : 0;
  }
  return { t: sim.time, steps: sim.steps, ids, data };
}
function record(sim: Simulation): void {
  sim.history.push(snapshot(sim));
  if (sim.history.length > sim.maxHistory) sim.history.splice(0, sim.history.length - sim.maxHistory);
}

/** Reconstruct the body list at a recorded frame (structure from sim, position/velocity
 *  from the frame; acceleration recomputed at that configuration; bodies not yet present
 *  in the frame are marked inactive). */
export function frameToBodies(sim: Simulation, frame: HistoryFrame): Body3D[] {
  const col = new Map<string, number>();
  frame.ids.forEach((id, i) => col.set(id, i));
  const out = sim.bodies.map((b) => {
    const i = col.get(b.id);
    if (i === undefined) return { ...b, active: false };
    const o = i * FRAME_STRIDE;
    return {
      ...b,
      position: [frame.data[o], frame.data[o + 1], frame.data[o + 2]] as Vec3,
      velocity: [frame.data[o + 3], frame.data[o + 4], frame.data[o + 5]] as Vec3,
      acceleration: [0, 0, 0] as Vec3,
      active: frame.data[o + 6] > 0.5,
    };
  });
  const acc = accelerations(out, sim.params); // field at the historical configuration
  for (let k = 0; k < out.length; k++) out[k].acceleration = acc[k];
  return out;
}

/** A body's path from history up to `endIndex` (inclusive), last `length` frames. */
export function historyTrail(sim: Simulation, bodyId: string, endIndex: number, length: number): Vec3[] {
  const start = Math.max(0, endIndex - length + 1);
  const out: Vec3[] = [];
  for (let i = start; i <= endIndex && i < sim.history.length; i++) {
    const fr = sim.history[i];
    const c = fr.ids.indexOf(bodyId);
    if (c < 0) continue;
    const o = c * FRAME_STRIDE;
    if (fr.data[o + 6] > 0.5) out.push([fr.data[o], fr.data[o + 1], fr.data[o + 2]]);
  }
  return out;
}

const cloneBody = (b: Body3D): Body3D => ({
  ...b,
  position: [...b.position] as Vec3,
  velocity: [...b.velocity] as Vec3,
  acceleration: [...b.acceleration] as Vec3,
});

export function createSimulation(bodies: Body3D[], opts: SimulationOptions = {}): Simulation {
  const params = opts.params ?? { ...DEFAULT_FIELD };
  const initial = bodies.map(cloneBody);
  const m = systemMetrics(bodies, params);
  const trails = new Map<string, Vec3[]>();
  for (const b of bodies) trails.set(b.id, [[...b.position] as Vec3]);
  const sim: Simulation = {
    bodies: bodies.map(cloneBody),
    params,
    integrator: opts.integrator ?? "verlet",
    dt: opts.dt ?? 0.01,
    time: 0,
    steps: 0,
    status: "paused",
    termination: null,
    collisionMode: opts.collisionMode ?? "ignore",
    trails,
    trailLength: opts.trailLength ?? 400,
    units: opts.units ?? "dimensionless",
    domainRadius: opts.domainRadius ?? 0,
    initialEnergy: m.total,
    initialMomentum: m.momentum,
    _initial: initial,
    events: [],
    history: [],
    maxHistory: opts.maxHistory ?? 20000,
  };
  record(sim);
  return sim;
}

/** Restore the simulation to its initial bodies/time (keeps params/settings). */
export function resetSimulation(sim: Simulation): void {
  sim.bodies = sim._initial.map(cloneBody);
  sim.time = 0;
  sim.steps = 0;
  sim.status = "paused";
  sim.termination = null;
  sim.trails = new Map(sim.bodies.map((b) => [b.id, [[...b.position] as Vec3]]));
  const m = systemMetrics(sim.bodies, sim.params);
  sim.initialEnergy = m.total;
  sim.initialMomentum = m.momentum;
  sim.events = [];
  sim.history = [];
  record(sim);
}

/** Advance the physics by `substeps` × dt. No-op unless status is running/paused-forced. */
export function stepSimulation(sim: Simulation, substeps = 1, force = false): Simulation {
  if (sim.status === "numericalFailure" || sim.status === "completed") return sim;
  if (sim.status === "paused" && !force) return sim;
  sim.status = "running";

  for (let s = 0; s < substeps; s++) {
    const r = step(sim.integrator, sim.bodies, sim.dt, sim.params);
    for (let i = 0; i < sim.bodies.length; i++) {
      if (!sim.bodies[i].active) continue;
      sim.bodies[i].position = r.positions[i];
      sim.bodies[i].velocity = r.velocities[i];
      sim.bodies[i].acceleration = r.accelerations[i];
    }
    sim.time += sim.dt;
    sim.steps += 1;

    resolveCollisions(sim);

    if (!checkNumericalSafety(sim)) return sim;      // sets status/termination
    applyDomain(sim);
    recordTrails(sim);
    record(sim);
  }
  return sim;
}

// ── collisions (§14) ────────────────────────────────────────────────────────
function resolveCollisions(sim: Simulation): void {
  const b = sim.bodies;
  for (let i = 0; i < b.length; i++) {
    if (!b[i].active) continue;
    for (let j = i + 1; j < b.length; j++) {
      if (!b[j].active) continue;
      const d = distance(b[i].position, b[j].position);

      // Singularity capture takes precedence (model rule, not GR, §9/§14).
      const cap = singularityCapture(b[i], b[j], d);
      if (cap) { absorbInto(cap.keep, cap.gone); sim.events.push(`${cap.gone.name} absorbed by ${cap.keep.name}`); continue; }

      if (sim.collisionMode === "ignore") continue;
      const touch = b[i].radius + b[j].radius;
      if (d > touch) continue;

      if (sim.collisionMode === "elastic") elasticBounce(b[i], b[j]);
      else if (sim.collisionMode === "merge") { mergeInto(b[i], b[j]); sim.events.push(`${b[i].name} merged with ${b[j].name}`); }
      else if (sim.collisionMode === "absorb") {
        const [keep, gone] = b[i].mass >= b[j].mass ? [b[i], b[j]] : [b[j], b[i]];
        absorbInto(keep, gone); sim.events.push(`${keep.name} absorbed ${gone.name}`);
      }
    }
  }
}

function singularityCapture(a: Body3D, b: Body3D, d: number): { keep: Body3D; gone: Body3D } | null {
  const aSing = (a.type === "singularity" || a.type === "black-hole") && a.absorptionRadius;
  const bSing = (b.type === "singularity" || b.type === "black-hole") && b.absorptionRadius;
  if (aSing && d < (a.absorptionRadius as number)) return { keep: a, gone: b };
  if (bSing && d < (b.absorptionRadius as number)) return { keep: b, gone: a };
  return null;
}

/** Momentum-conserving absorption: `gone`'s momentum & mass fold into `keep`. */
function absorbInto(keep: Body3D, gone: Body3D): void {
  const M = keep.mass + gone.mass;
  if (M > 0) {
    for (let c = 0; c < 3; c++) keep.velocity[c] = (keep.mass * keep.velocity[c] + gone.mass * gone.velocity[c]) / M;
  }
  keep.mass = M;
  gone.active = false;
}

/** Merge two physical bodies into `a` (COM position, momentum-conserving velocity). */
function mergeInto(a: Body3D, b: Body3D): void {
  const M = a.mass + b.mass;
  if (M > 0) {
    for (let c = 0; c < 3; c++) {
      a.position[c] = (a.mass * a.position[c] + b.mass * b.position[c]) / M;
      a.velocity[c] = (a.mass * a.velocity[c] + b.mass * b.velocity[c]) / M;
    }
  }
  a.mass = M;
  a.radius = Math.cbrt(a.radius ** 3 + b.radius ** 3); // volume-additive radius
  b.active = false;
}

/** Elastic (restitution 1) impulse along the line of centres, only if approaching. */
function elasticBounce(a: Body3D, b: Body3D): void {
  const nx = a.position[0] - b.position[0], ny = a.position[1] - b.position[1], nz = a.position[2] - b.position[2];
  const dist = Math.hypot(nx, ny, nz) || 1e-9;
  const ux = nx / dist, uy = ny / dist, uz = nz / dist;
  const rvx = a.velocity[0] - b.velocity[0], rvy = a.velocity[1] - b.velocity[1], rvz = a.velocity[2] - b.velocity[2];
  const approach = rvx * ux + rvy * uy + rvz * uz;
  if (approach >= 0) return; // separating already
  const m1 = a.mass, m2 = b.mass, sum = m1 + m2 || 1;
  const j = (2 * approach) / sum; // impulse scalar / respective mass factors below
  a.velocity[0] -= j * m2 * ux; a.velocity[1] -= j * m2 * uy; a.velocity[2] -= j * m2 * uz;
  b.velocity[0] += j * m1 * ux; b.velocity[1] += j * m1 * uy; b.velocity[2] += j * m1 * uz;
}

// ── safety + domain (§33) ────────────────────────────────────────────────────
function checkNumericalSafety(sim: Simulation): boolean {
  for (const b of sim.bodies) {
    if (!b.active) continue;
    if (!b.position.every(Number.isFinite) || !b.velocity.every(Number.isFinite)) {
      sim.status = "numericalFailure"; sim.termination = "numericalFailure";
      sim.events.push(`numerical failure at ${b.name}`);
      return false;
    }
    if (norm(b.position) > MAX_COORD || norm(b.velocity) > MAX_SPEED) {
      sim.status = "unstable"; // not fatal, but flagged
    }
  }
  return true;
}

function applyDomain(sim: Simulation): void {
  if (sim.domainRadius <= 0) return;
  for (const b of sim.bodies) {
    if (b.active && norm(b.position) > sim.domainRadius) {
      b.active = false;
      sim.events.push(`${b.name} escaped the domain`);
    }
  }
}

// ── trails (§15) ─────────────────────────────────────────────────────────────
function recordTrails(sim: Simulation): void {
  for (const b of sim.bodies) {
    let t = sim.trails.get(b.id);
    if (!t) { t = []; sim.trails.set(b.id, t); }
    if (!b.active) continue;
    t.push([...b.position] as Vec3);
    if (t.length > sim.trailLength) t.splice(0, t.length - sim.trailLength);
  }
}

// ── readouts ─────────────────────────────────────────────────────────────────
export interface SimulationReport extends SystemMetrics {
  time: number;
  steps: number;
  status: SimulationStatus;
  activeBodies: number;
  energyDrift: number;
  momentumDrift: number;
}

export function report(sim: Simulation): SimulationReport {
  const m = systemMetrics(sim.bodies, sim.params);
  const p = momentum(sim.bodies);
  const p0 = sim.initialMomentum;
  const momDrift = Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]) /
    Math.max(norm(p0), 1e-9);
  return {
    ...m,
    time: sim.time,
    steps: sim.steps,
    status: sim.status,
    activeBodies: sim.bodies.filter((b) => b.active).length,
    energyDrift: relativeDrift(m.total, sim.initialEnergy),
    momentumDrift: momDrift,
  };
}

export { effectiveMass };
