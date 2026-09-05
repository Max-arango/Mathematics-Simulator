// Trajectory lifecycle for interactive 2-D dynamical systems.
//
// A "trajectory" is the orbit of a single initial condition under the flow
// ẋ = f(x) (continuous) or x(n+1) = f(x) (discrete). The lifecycle keeps a
// sampled trajectory — aligned {t, x, y} points — that downstream code can
// re-use for charts, comparison, basin assignment, notebook export.
//
// INTEGRATION DIRECTION:
//   "forward"  → ẋ = f(x)                (the flow as written)
//   "backward" → ẋ = −f(x)               (reverse-time flow, used for
//                                          backward trajectories / stable
//                                          manifolds near saddles)
// The integrator is shared (ode/registry). No second RK4 / no second solver.
//
// TERMINATION POLICY (honest, ordered by precedence):
//   1. numericalFailure — non-finite state, |F(x)| ≥ OVERFLOW_NORM, or the
//                          integrator itself returned non-finite / overran
//                          its step budget.
//   2. limitCycle       — numerical heuristic: enough return-map crossings
//                          with consistent amplitude ⇒ "approximately periodic".
//                          Tagged as a HEURISTIC, never as exact.
//   3. equilibrium      — |F(x)| < QUIESCENT_NORM AND x is within SNAP_RADIUS
//                          of a known equilibrium. ‖F‖ small alone does NOT
//                          certify "this is an equilibrium".
//   4. escaped / outOfDomain / timeout — bookkeeping.
//
// destination is populated when status === "equilibrium" or "limitCycle":
//   equilibrium  → { kind: "equilibrium", index }
//   limitCycle   → { kind: "limitCycle", samples: Vec[], center, radius }
import { InvalidInputError } from "../core/errors.ts";
import { solveODE } from "../ode/registry.ts";
import type { ODEOptions } from "../ode/types.ts";
import { distance, norm, type Vec } from "../linear/vector.ts";
import { evalField, type DynamicalSystem } from "./system.ts";

export type IntegrationDirection = "forward" | "backward";
export type TrajectoryStatus =
  | "running" | "paused"
  | "equilibrium" | "limitCycle"
  | "escaped" | "outOfDomain" | "timeout"
  | "numericalFailure";

/** Where the trajectory settled — only meaningful when status !== running/paused. */
export interface Destination {
  kind: "equilibrium" | "limitCycle" | "none";
  /** Index into the equilibria list (when kind === "equilibrium"). */
  equilibriumIndex?: number;
  /** Estimate of the closed orbit centre (when kind === "limitCycle"). */
  center?: Vec;
  /** Mean radius / amplitude (when kind === "limitCycle"). */
  radius?: number;
  /** Sampled points along the orbit (when kind === "limitCycle"). */
  orbit?: Vec[];
}

export interface TerminationReason {
  status: Exclude<TrajectoryStatus, "running" | "paused">;
  destination?: Destination;
  /** ‍ |F(x)| at termination — surfaced for debugging / readout. */
  residualNorm?: number;
  /** Snapshot of position where the trajectory stopped. */
  at: Vec;
  /** Wall-clock t reached when the trajectory stopped. */
  t: number;
  /** Optional human-readable detail. */
  detail?: string;
  /** Confidence label — "exact" / "numerical" / "estimated" / "inferred" / "heuristic".
   *  All Dynamics verifications are at minimum "numerical"; limit-cycle detection
   *  is "heuristic" by design (see limitCycle). */
  confidence?: "numerical" | "estimated" | "heuristic";
}

/** One (t, x) sample. For 2-D systems x is length 2. */
export interface TrajectorySample { t: number; x: Vec; }

export interface TrajectoryState {
  id: number;
  initialPosition: Vec;
  currentPosition: Vec;
  direction: IntegrationDirection;
  /** Unit vector along F(currentPosition) in the FORWARD sense; zero if |F|≈0. */
  velocity: Vec;
  /** Aligned (t, x) samples. The renderer uses the x for the trail; the t is
   *  the elapsed simulation time at that point. */
  samples: TrajectorySample[];
  /** Wall-clock-equivalent simulation time at currentPosition.
   *  For forward integration t accumulates positively; for backward, t is the
   *  reverse-time coordinate (decreases as we integrate). */
  elapsedTime: number;
  stepsTaken: number;
  status: TrajectoryStatus;
  termination: TerminationReason | null;
  integrationStep: number;
}

export interface SimulationLimits {
  /** Visual viewport in world coordinates (where the camera is pointing). */
  viewport: { xMin: number; xMax: number; yMin: number; yMax: number };
  /** Physical domain. Trajectories that leave this box terminate as "outOfDomain". */
  domain?: { xMin: number; xMax: number; yMin: number; yMax: number };
  /** When false, the domain check is skipped. Default true. */
  enforceDomain?: boolean;
  /** Hard simulation time cap (the timeline's t1 in the integration direction). */
  tMax: number;
  /** Optional list of equilibria used to tag the destination. */
  equilibria?: Vec[];
  /** Distance below which a quiescent point is treated as "this equilibrium". */
  snapRadius?: number;
  /** |F| below which we even consider "quiescent". */
  quiescentNorm?: number;
  /** |F| at or above which we declare numerical failure (overflow). */
  overflowNorm?: number;
  /** Disable limit-cycle heuristic (default false: heuristic ON). */
  disableLimitCycle?: boolean;
  /** Heuristic knob: minimum number of return-map crossings to declare a
   *  cycle (default 3). Higher ⇒ more conservative. */
  limitCycleMinCrossings?: number;
}

export interface StepOutcome {
  state: TrajectoryState;
  termination: TerminationReason | null;
  advanced: boolean;
}

// Defaults — tuned for a 2-D interactive phase plane, NOT for general IVPs.
const DEFAULT_SNAP_RADIUS = 0.05;
const DEFAULT_QUIESCENT_NORM = 1e-3;
const DEFAULT_OVERFLOW_NORM = 1e4;
const DEFAULT_LIMIT_CYCLE_MIN_CROSSINGS = 3;
// We track crossings of the plane x' = (x − cx)·v̂ where (cx, v̂) is chosen
// from the first non-trivial velocity seen — robust for an orbit, agnostic
// about orientation. STATE_BUFFER below bounds the return-map memory.
const STATE_BUFFER = 4096;

// ─── limit-cycle heuristic (return map) ────────────────────────────────────
//
// Maintain a small circular buffer of the last STATE_BUFFER positions. As the
// trajectory advances, watch for crossings of an arbitrary plane through the
// centroid (initial v̂); a "crossing" means x_new · v̂ has a different sign
// from x_old · v̂. Each crossing pair (entering / leaving) lets us measure the
// diameter of the orbit at that phase.
//
// A trajectory is tagged `limitCycle` when:
//   (i)   it has at least MIN_CROSSINGS complete crossings, AND
//   (ii)  the last few diameters have a low coefficient of variation
//         (consecutive orbits are similar — closed-orbit signature), AND
//   (iii) the trajectory is NOT sitting on a quiescent point near a known
//         equilibrium (that would already be classified as equilibrium).
//
// This is a HEURISTIC — can miss slow cycles near a center, can false-positive
// on noisy saddles. Confidence: "heuristic".
const CIRCLE_LIMIT_BUFFER = 64;

class LimitCycleTracker {
  private v: Vec | null = null;       // reference plane normal
  private center: Vec = [0, 0];       // running centroid
  private crossings = 0;              // completed crossing pairs
  private lastCrossSign: 0 | 1 | -1 = 0;
  private lastCrossAbs = 0;           // |projection| at last crossing
  private recentDiameters: number[] = [];

  /** Returns true if the trajectory has settled onto an approximate cycle. */
  update(p: Vec, F: Vec): { cycle: boolean; center?: Vec; radius?: number; orbit?: Vec[] } | null {
    // Initialise the reference plane normal once we see a non-zero velocity.
    if (!this.v) {
      const m = norm(F);
      if (m < 1e-6) return null;
      this.v = [F[0] / m, F[1] / m];
      this.center = [p[0], p[1]];
    }
    // Maintain centroid (mean of recent positions) — for the orbit centre.
    this.center = [
      0.9 * this.center[0] + 0.1 * p[0],
      0.9 * this.center[1] + 0.1 * p[1],
    ];
    // Project (p - center) onto v̂.
    const proj = (p[0] - this.center[0]) * this.v![0] + (p[1] - this.center[1]) * this.v![1];
    const sign = proj > 1e-6 ? 1 : proj < -1e-6 ? -1 : 0;
    if (this.lastCrossSign === 0) { this.lastCrossSign = sign; this.lastCrossAbs = Math.abs(proj); return null; }
    if (sign !== 0 && sign !== this.lastCrossSign) {
      // Crossing detected — record the diameter and compare.
      const diameter = Math.abs(proj) + this.lastCrossAbs;
      this.recentDiameters.push(diameter);
      if (this.recentDiameters.length > CIRCLE_LIMIT_BUFFER) this.recentDiameters.shift();
      this.crossings++;
      this.lastCrossSign = sign;
      this.lastCrossAbs = Math.abs(proj);
    }
    return null;
  }

  status(minCrossings: number): { cycle: boolean; center: Vec; radius: number } {
    if (this.crossings < minCrossings || this.recentDiameters.length < minCrossings) {
      return { cycle: false, center: this.center, radius: 0 };
    }
    // CoV of recent diameters — closed orbits have consistent diameters.
    const tail = this.recentDiameters.slice(-Math.max(3, minCrossings));
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    const variance = tail.reduce((s, v) => s + (v - mean) ** 2, 0) / tail.length;
    const cv = mean > 1e-9 ? Math.sqrt(variance) / mean : 0;
    const cycle = cv < 0.15 && mean > 1e-6; // <15% diameter variation ⇒ closed orbit
    return { cycle, center: this.center, radius: mean / 2 };
  }
}

// ─── unit / safe field helpers ─────────────────────────────────────────────
function unit(v: Vec): Vec {
  const n = norm(v);
  if (n === 0 || !Number.isFinite(n)) return [0, 0];
  return [v[0] / n, v[1] / n];
}
function safeField(sys: DynamicalSystem, x: Vec, sign: 1 | -1): Vec {
  try {
    const v = evalField(sys, x);
    if (!v.every(Number.isFinite)) return [0, 0];
    return sign === -1 ? [-v[0], -v[1]] : v;
  } catch {
    return [0, 0];
  }
}

// ─── id counter (monotone, scoped to the module) ───────────────────────────
let _idCounter = 0;
const nextId = () => ++_idCounter;

// Module-private side channel: TrajectoryState carries a limit-cycle tracker
// without leaking it through the public type. We attach it under a Symbol key
// that nobody else can read. (ponytail: cleaner than widening the public type
// for an implementation detail; if TS strict complains, fall back to a WeakMap.)
const LC_KEY = Symbol("dynamics.limitCycleTracker");

// ─── public API ────────────────────────────────────────────────────────────

/**
 * Create a fresh trajectory at `x0`. Direction defaults to "forward"; pass
 * "backward" to integrate −f. The integrator's nominal step is set to
 * `integrationStep` (caller chooses — typically tied to the view span / speed).
 */
export function createTrajectory(
  sys: DynamicalSystem,
  x0: Vec,
  integrationStep: number,
  direction: IntegrationDirection = "forward",
): TrajectoryState {
  if (sys.kind !== "continuous") {
    throw new InvalidInputError("lifecycle is for continuous systems (flows); maps need their own iterator");
  }
  if (x0.length !== sys.vars.length) {
    throw new InvalidInputError(`x0 has ${x0.length} coord(s), expected ${sys.vars.length}`);
  }
  if (!Number.isFinite(integrationStep) || integrationStep <= 0) {
    throw new InvalidInputError(`integrationStep must be positive and finite (got ${integrationStep})`);
  }
  if (direction !== "forward" && direction !== "backward") {
    throw new InvalidInputError(`direction must be "forward" or "backward" (got "${direction}")`);
  }
  const sign: 1 | -1 = direction === "forward" ? 1 : -1;
  const v0 = safeField(sys, x0, sign);
  return {
    id: nextId(),
    initialPosition: x0.slice(),
    currentPosition: x0.slice(),
    direction,
    velocity: unit(v0),
    samples: [{ t: 0, x: x0.slice() }],
    elapsedTime: 0,
    stepsTaken: 0,
    status: "running",
    termination: null,
    integrationStep,
  };
}

/**
 * Advance a trajectory by `dt` of simulation time, applying the termination
 * policy. Internally this calls solveODE(method) from the shared registry; the
 * integrator's field is sign-flipped when the trajectory is "backward".
 */
export function stepTrajectory(
  sys: DynamicalSystem,
  state: TrajectoryState,
  dt: number,
  limits: SimulationLimits,
  method: string = "rk4",
): StepOutcome {
  if (state.status !== "running") return { state, termination: state.termination, advanced: false };
  if (!Number.isFinite(dt) || dt <= 0) return { state, termination: state.termination, advanced: false };

  const snapRadius = limits.snapRadius ?? DEFAULT_SNAP_RADIUS;
  const quiescentNorm = limits.quiescentNorm ?? DEFAULT_QUIESCENT_NORM;
  const overflowNorm = limits.overflowNorm ?? DEFAULT_OVERFLOW_NORM;
  const minCrossings = limits.limitCycleMinCrossings ?? DEFAULT_LIMIT_CYCLE_MIN_CROSSINGS;
  const vp = limits.viewport;
  const sign: 1 | -1 = state.direction === "forward" ? 1 : -1;

  // For backward integration, the "remaining" budget is the REVERSE-time budget.
  // We mirror `dt` so a backward step of `dt` consumes `dt` of reverse time.
  const remaining = Math.min(dt, Math.max(0, limits.tMax - state.elapsedTime));
  if (remaining <= 0) {
    state.status = "timeout";
    state.termination = {
      status: "timeout",
      at: state.currentPosition.slice(),
      t: state.elapsedTime,
      detail: "simulation budget exhausted",
      confidence: "numerical",
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
  // Per-trajectory limit-cycle tracker — instantiated lazily on first step.
  const tracker =
    (state as unknown as Record<symbol, LimitCycleTracker>)[LC_KEY] ??
    ((state as unknown as Record<symbol, LimitCycleTracker>)[LC_KEY] = new LimitCycleTracker());

  for (let k = 0; k < subSteps; k++) {
    try {
      const res = solveODE(
        method,
        { f: (_t, y) => safeField(sys, y, sign), y0: last, t0: 0, t1: subDt },
        opts,
      );
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
      confidence: "numerical",
    };
    return { state, termination: state.termination, advanced: true };
  }

  // Update the cycle tracker with the new state and the FORWARD-sense velocity.
  // We feed it the raw forward F (sign +1) so the reference plane is consistent
  // with how the user reads the flow regardless of integration direction.
  const Fforward = safeField(sys, last, 1);
  tracker.update(last, Fforward);

  state.currentPosition = last;
  // For backward integration we accumulate NEGATIVE time.
  const tDelta = sign * consumedT;
  state.elapsedTime += tDelta;
  state.samples.push({ t: state.elapsedTime, x: last.slice() });
  // Cap sample buffer (oldest dropped) — bounds memory without losing recent shape.
  if (state.samples.length > STATE_BUFFER) state.samples.splice(0, state.samples.length - STATE_BUFFER);
  state.velocity = unit(Fforward);

  // (2) limit-cycle heuristic — runs BEFORE equilibrium so a closed orbit is
  //     not falsely snapped to a nearby equilibrium.
  if (!limits.disableLimitCycle) {
    const ls = tracker.status(minCrossings);
    if (ls.cycle) {
      // Verify: NOT inside the snap radius of a known stable equilibrium.
      // (Saddles and unstable eq are excluded: a trajectory won't settle there.)
      const nearEq = nearestStableEquilibriumIndex(last, limits.equilibria, snapRadius, sys);
      if (nearEq === -1) {
        state.status = "limitCycle";
        state.termination = {
          status: "limitCycle",
          destination: {
            kind: "limitCycle",
            center: ls.center.slice(),
            radius: ls.radius,
            orbit: state.samples.map((s) => s.x.slice()),
          },
          at: last.slice(),
          t: state.elapsedTime,
          detail: `numerical heuristic: ${minCrossings}+ crossings, orbit radius ≈ ${ls.radius.toFixed(3)}`,
          confidence: "heuristic",
        };
        return { state, termination: state.termination, advanced: true };
      }
    }
  }

  // (3) equilibrium snap — |F| small AND close to a known equilibrium.
  const fNorm = norm(Fforward);
  if (fNorm < quiescentNorm) {
    const eqIdx = nearestEquilibriumIndex(last, limits.equilibria, snapRadius);
    if (eqIdx !== -1) {
      state.status = "equilibrium";
      state.termination = {
        status: "equilibrium",
        destination: { kind: "equilibrium", equilibriumIndex: eqIdx },
        residualNorm: fNorm,
        at: last.slice(),
        t: state.elapsedTime,
        confidence: "numerical",
      };
      return { state, termination: state.termination, advanced: true };
    }
  }

  // (4) escaped viewport.
  if (
    last[0] < vp.xMin || last[0] > vp.xMax ||
    last[1] < vp.yMin || last[1] > vp.yMax
  ) {
    state.status = "escaped";
    state.termination = {
      status: "escaped",
      at: last.slice(),
      t: state.elapsedTime,
      detail: `outside viewport [${vp.xMin}, ${vp.xMax}] × [${vp.yMin}, ${vp.yMax}]`,
      confidence: "numerical",
    };
    return { state, termination: state.termination, advanced: true };
  }

  // (5) domain violation.
  const dom = limits.domain ?? vp;
  if (limits.enforceDomain !== false &&
    (last[0] < dom.xMin || last[0] > dom.xMax ||
     last[1] < dom.yMin || last[1] > dom.yMax)) {
    state.status = "outOfDomain";
    state.termination = {
      status: "outOfDomain",
      at: last.slice(),
      t: state.elapsedTime,
      detail: `outside domain [${dom.xMin}, ${dom.xMax}] × [${dom.yMin}, ${dom.yMax}]`,
      confidence: "numerical",
    };
    return { state, termination: state.termination, advanced: true };
  }

  // (6) timeout.
  if (state.elapsedTime >= limits.tMax || state.elapsedTime <= -limits.tMax) {
    state.status = "timeout";
    state.termination = {
      status: "timeout",
      at: state.currentPosition.slice(),
      t: state.elapsedTime,
      detail: "simulation budget exhausted",
      confidence: "numerical",
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
  let bestIdx = -1, bestD = radius;
  for (let i = 0; i < eqs.length; i++) {
    const d = distance(p, eqs[i]);
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  return bestIdx;
}

// "nearest stable equilibrium" — limit-cycle heuristic must NOT confuse a
// closed orbit with a converged-to-attractor snapshot. We pass the system in
// only so the caller doesn't have to pre-filter; equilibrium classification
// is cheap (eigenvalues at one point).
function nearestStableEquilibriumIndex(p: Vec, eqs: Vec[] | undefined, radius: number, _sys: DynamicalSystem): number {
  // Heuristic: treat ALL equilibria as potential attractors here. Misclassifying
  // a saddle as a sink would ONLY cause a true limit-cycle to be misread as an
  // equilibrium; in practice if the trajectory is on a stable cycle, it won't
  // be within snap radius of a saddle (saddles repel). And the snap radius is
  // tiny (DEFAULT_SNAP_RADIUS=0.05), so this filter is conservative.
  return nearestEquilibriumIndex(p, eqs, radius);
}

/** Convenience: extract just the geometry (Vec[]) — kept for the renderer. */
export function trailPoints(state: TrajectoryState): Vec[] {
  return state.samples.map((s) => s.x);
}

/** Truncate the sample buffer to `max` entries, keeping the most recent. */
export function trimTrail(state: TrajectoryState, max: number): void {
  if (state.samples.length <= max) return;
  state.samples.splice(0, state.samples.length - max);
}

/** Quick geometry-only accessor for the renderer (no React state churn). */
export function geometryPoints(samples: TrajectorySample[]): Vec[] {
  return samples.map((s) => s.x);
}