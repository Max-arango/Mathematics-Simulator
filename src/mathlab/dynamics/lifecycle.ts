// Trajectory lifecycle for interactive 2-D dynamical systems.
//
// Drives a single particle forward step-by-step using an ODE integrator from the
// shared mathlab core (ode/registry). Tracks a small, explicit status machine so
// the UI can distinguish "arrived at an equilibrium" from "escaped the viewport"
// from "ran out of simulation budget" from "integrator blew up".
//
// Termination policy (honest, in order of precedence):
//   1. numericalFailure  — non-finite state, or |F(x)| ≥ OVERFLOW_NORM, or
//                          step size exploded. The integrator did not produce
//                          a reliable next state; we stop and tag the failure.
//   2. equilibrium       — |F(x)| < QUIESCENT_NORM AND x is within SNAP_RADIUS
//                          of a known equilibrium. The trajectory's destination
//                          equilibrium id is recorded (NOT inferred from
//                          `|F| < ε` alone — spec: ‖F‖ small alone does NOT
//                          certify "this is an equilibrium").
//   3. escaped           — point left the viewport [vx0,vx1]×[vy0,vy1]. The
//                          trajectory left the visible region; it's marked
//                          escaped (not equilibrium, even if |F| happened to
//                          be small at the boundary).
//   4. timeout           — t exceeded tMax OR the step counter exceeded
//                          MAX_ODE_STEPS. The integrator is still healthy;
//                          we just ran out of budget.
//
// "direction" is the unit vector along F(x) at the current state — useful for
// the UI to mark the current velocity without distorting the field rendering.
import { InvalidInputError } from "../core/errors.ts";
import { solveODE } from "../ode/registry.ts";
import type { ODEOptions } from "../ode/types.ts";
import { distance, norm, type Vec } from "../linear/vector.ts";
import { evalField, type DynamicalSystem } from "./system.ts";

export type TrajectoryStatus = "running" | "paused" | "equilibrium" | "escaped" | "timeout" | "numericalFailure";

export interface TerminationReason {
  status: Exclude<TrajectoryStatus, "running" | "paused">;
  /** Equilibrium the trajectory was snapped to (only when status === "equilibrium"). */
  destinationEquilibrium?: number; // ponytail: id assigned by caller; index in their equilibria list
  /** ‍ |F(x)| at termination — surfaced for debugging / readout. */
  residualNorm?: number;
  /** Snapshot of position where the trajectory stopped. */
  at: Vec;
  /** Wall-clock t reached when the trajectory stopped. */
  t: number;
  /** Optional human-readable detail. */
  detail?: string;
}

export interface TrajectoryState {
  initialPosition: Vec;
  currentPosition: Vec;
  direction: Vec; // unit vector along F(currentPosition); zero if |F|≈0
  trail: Vec[];
  elapsedTime: number;
  stepsTaken: number;
  status: TrajectoryStatus;
  termination: TerminationReason | null;
  /** Integration step size used for the next step. */
  integrationStep: number;
}

export interface SimulationLimits {
  /** Axis-aligned viewport in world coordinates. */
  viewport: { xMin: number; xMax: number; yMin: number; yMax: number };
  /** Hard simulation time cap (the timeline's t1). */
  tMax: number;
  /** Optional list of equilibria used to tag the destination. */
  equilibria?: Vec[];
  /** Distance below which a quiescent point is treated as "this equilibrium". */
  snapRadius?: number;
  /** |F| below which we even consider "quiescent". */
  quiescentNorm?: number;
  /** |F| at or above which we declare numerical failure (overflow). */
  overflowNorm?: number;
}

export interface StepOutcome {
  /** Updated state (mutated in place by the stepper; this is the same reference). */
  state: TrajectoryState;
  /** Termination reason (when status changes off "running"). */
  termination: TerminationReason | null;
  /** True iff the stepper consumed this call and advanced (or terminated). */
  advanced: boolean;
}

// Defaults — tuned for a 2-D interactive phase plane, NOT for general IVPs.
const DEFAULT_SNAP_RADIUS = 0.05; // world units
const DEFAULT_QUIESCENT_NORM = 1e-3;
const DEFAULT_OVERFLOW_NORM = 1e4;

function unit(v: Vec): Vec {
  const n = norm(v);
  if (n === 0 || !Number.isFinite(n)) return [0, 0];
  return [v[0] / n, v[1] / n];
}

/**
 * Create a fresh trajectory at `x0`. Status is "running" and the trail starts
 * with the initial point. The integrator's nominal step is set to `integrationStep`
 * (caller chooses — typically tied to the view span / speed).
 */
export function createTrajectory(
  sys: DynamicalSystem,
  x0: Vec,
  integrationStep: number,
): TrajectoryState {
  if (sys.kind !== "continuous") {
    throw new InvalidInputError("lifecycle.stepper is for continuous systems (flows); maps need their own iterator");
  }
  if (x0.length !== sys.vars.length) {
    throw new InvalidInputError(`x0 has ${x0.length} coord(s), expected ${sys.vars.length}`);
  }
  if (!Number.isFinite(integrationStep) || integrationStep <= 0) {
    throw new InvalidInputError(`integrationStep must be positive and finite (got ${integrationStep})`);
  }
  const f0 = safeField(sys, x0);
  return {
    initialPosition: x0.slice(),
    currentPosition: x0.slice(),
    direction: unit(f0),
    trail: [x0.slice()],
    elapsedTime: 0,
    stepsTaken: 0,
    status: "running",
    termination: null,
    integrationStep,
  };
}

/** Evaluate the field defensively: return the zero vector on any throw / non-finite. */
function safeField(sys: DynamicalSystem, x: Vec): Vec {
  try {
    const v = evalField(sys, x);
    return v.every(Number.isFinite) ? v : [0, 0];
  } catch {
    return [0, 0];
  }
}

/**
 * Advance a trajectory by `dt` of simulation time, applying the termination
 * policy above. The integrator is the shared `solveODE(method)`; we slice each
 * sub-integration down to the remaining budget so the policy fires inside one
 * call rather than across many.
 *
 * Returns the (mutated) state and a termination reason if the status changed.
 */
export function stepTrajectory(
  sys: DynamicalSystem,
  state: TrajectoryState,
  dt: number,
  limits: SimulationLimits,
  method: string = "rk4",
): StepOutcome {
  if (state.status !== "running") {
    return { state, termination: state.termination, advanced: false };
  }
  if (!Number.isFinite(dt) || dt <= 0) {
    return { state, termination: state.termination, advanced: false };
  }

  const snapRadius = limits.snapRadius ?? DEFAULT_SNAP_RADIUS;
  const quiescentNorm = limits.quiescentNorm ?? DEFAULT_QUIESCENT_NORM;
  const overflowNorm = limits.overflowNorm ?? DEFAULT_OVERFLOW_NORM;
  const vp = limits.viewport;

  const remaining = Math.min(dt, Math.max(0, limits.tMax - state.elapsedTime));
  if (remaining <= 0) {
    state.status = "timeout";
    state.termination = {
      status: "timeout",
      at: state.currentPosition.slice(),
      t: state.elapsedTime,
      detail: "simulation budget exhausted",
    };
    return { state, termination: state.termination, advanced: true };
  }

  const h = state.integrationStep;
  const subSteps = Math.max(1, Math.ceil(remaining / h));
  const subDt = remaining / subSteps;

  const opts: ODEOptions = { h: subDt, steps: 1 };
  let last: Vec = state.currentPosition;
  let consumedT = 0;
  let failed = false;
  let failureDetail = "";

  for (let k = 0; k < subSteps; k++) {
    try {
      const res = solveODE(method, { f: (_t, y) => evalField(sys, y), y0: last, t0: 0, t1: subDt }, opts);
      if (!res.converged) {
        failed = true;
        failureDetail = res.warnings.join("; ") || res.termination;
        break;
      }
      const next = res.y[res.y.length - 1];
      if (!next.every(Number.isFinite) || norm(next) > overflowNorm) {
        failed = true;
        failureDetail = `non-finite or |x|>${overflowNorm}`;
        break;
      }
      last = next;
      consumedT += res.t[res.t.length - 1];
      state.stepsTaken += res.steps;
    } catch (e) {
      failed = true;
      failureDetail = e instanceof Error ? e.message : String(e);
      break;
    }
  }

  if (failed) {
    state.status = "numericalFailure";
    state.termination = {
      status: "numericalFailure",
      at: state.currentPosition.slice(),
      t: state.elapsedTime,
      detail: failureDetail,
    };
    return { state, termination: state.termination, advanced: true };
  }

  state.currentPosition = last;
  state.trail.push(last.slice());
  state.elapsedTime += consumedT;
  state.direction = unit(safeField(sys, last));

  // Termination policy (1) numericalFailure already handled above.
  // (2) equilibrium: small |F| AND close to a known equilibrium.
  const F = safeField(sys, last);
  const fNorm = norm(F);
  if (fNorm < quiescentNorm) {
    const eqIdx = nearestEquilibriumIndex(last, limits.equilibria, snapRadius);
    if (eqIdx !== -1) {
      state.status = "equilibrium";
      state.termination = {
        status: "equilibrium",
        destinationEquilibrium: eqIdx,
        residualNorm: fNorm,
        at: last.slice(),
        t: state.elapsedTime,
      };
      return { state, termination: state.termination, advanced: true };
    }
    // |F| small but no known equilibrium nearby: DO NOT lie — keep running.
  }

  // (3) escaped viewport.
  if (
    last[0] < vp.xMin || last[0] > vp.xMax ||
    last[1] < vp.yMin || last[1] > vp.yMax
  ) {
    state.status = "escaped";
    state.termination = {
      status: "escaped",
      at: last.slice(),
      t: state.elapsedTime,
      detail: `outside [${vp.xMin}, ${vp.xMax}] × [${vp.yMin}, ${vp.yMax}]`,
    };
    return { state, termination: state.termination, advanced: true };
  }

  // (4) timeout (belt + braces — the budget check above handles the common case).
  if (state.elapsedTime >= limits.tMax) {
    state.status = "timeout";
    state.termination = {
      status: "timeout",
      at: state.currentPosition.slice(),
      t: state.elapsedTime,
      detail: "simulation budget exhausted",
    };
    return { state, termination: state.termination, advanced: true };
  }

  return { state, termination: null, advanced: true };
}

/** Pause / resume. */
export function pauseTrajectory(state: TrajectoryState): void {
  if (state.status === "running") state.status = "paused";
}
export function resumeTrajectory(state: TrajectoryState): void {
  if (state.status === "paused") state.status = "running";
}

/** Index of the closest known equilibrium within `radius`, or -1 if none. */
function nearestEquilibriumIndex(p: Vec, eqs: Vec[] | undefined, radius: number): number {
  if (!eqs || eqs.length === 0) return -1;
  let bestIdx = -1;
  let bestD = radius;
  for (let i = 0; i < eqs.length; i++) {
    const d = distance(p, eqs[i]);
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  return bestIdx;
}

/** Truncate a trail to `max` samples, keeping the most recent. */
export function trimTrail(trail: Vec[], max: number): void {
  if (trail.length <= max) return;
  trail.splice(0, trail.length - max);
}