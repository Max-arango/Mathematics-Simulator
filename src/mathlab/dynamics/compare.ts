// Trajectory comparison (§13) — the separation Δ(t) = ‖X₁(t) − X₂(t)‖ between two
// orbits integrated on a SHARED clock (same t₀, t₁, h ⇒ aligned fixed-step grids).
// The seed of sensitivity-to-initial-conditions / stability / chaos study; here
// just the raw numerical separation series. No new integrator — reuses simulate().
import { distance, type Vec } from "../linear/vector.ts";
import { simulate } from "./trajectory.ts";
import type { DynamicalSystem } from "./system.ts";
import type { TrajectorySample } from "./lifecycle.ts";

export interface SeparationPoint { t: number; delta: number; }

/** Δ(t) from two aligned sample series (matched by index up to the shorter one). */
export function separationSeries(a: TrajectorySample[], b: TrajectorySample[]): SeparationPoint[] {
  const n = Math.min(a.length, b.length);
  const out: SeparationPoint[] = [];
  for (let i = 0; i < n; i++) out.push({ t: a[i].t, delta: distance(a[i].x, b[i].x) });
  return out;
}

export interface CompareOptions { t0?: number; t1: number; h?: number; method?: string; }

/**
 * Integrate two initial conditions on a shared clock and return both orbits plus
 * their separation Δ(t). Fixed-step RK4 (shared t₀/t₁/h) keeps the two time grids
 * aligned so Δ is a plain per-index distance.
 */
export function compareTrajectories(
  sys: DynamicalSystem, p1: Vec, p2: Vec, opts: CompareOptions,
): { a: Vec[]; b: Vec[]; t: number[]; separation: SeparationPoint[] } {
  const t0 = opts.t0 ?? 0;
  const method = opts.method ?? "rk4";
  const ra = simulate(sys, p1, { method, t0, t1: opts.t1, h: opts.h });
  const rb = simulate(sys, p2, { method, t0, t1: opts.t1, h: opts.h });
  const n = Math.min(ra.t.length, rb.t.length);
  const separation: SeparationPoint[] = [];
  for (let i = 0; i < n; i++) separation.push({ t: ra.t[i], delta: distance(ra.states[i], rb.states[i]) });
  return { a: ra.states, b: rb.states, t: ra.t.slice(0, n), separation };
}
