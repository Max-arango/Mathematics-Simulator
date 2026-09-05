// Basins of attraction (§4–6, §20) — approximate WHICH long-term destination each
// region of state space flows to. Sample a grid of initial conditions, integrate
// each to a termination verdict (shared lifecycle), and label the cell.
//
// COST + HONESTY (§5, §17, §18): this is O(cells × steps) — expensive, and NOT to
// run inside a render loop. The sampler is INCREMENTAL and CANCELABLE: `step(n)`
// classifies n cells and reports done/total so the caller spreads work across
// frames and can stop early. Every label is a NUMERICAL verdict from a FINITE-TIME
// integration — "timeout" / "unknown" honestly mean "the integrator hadn't decided",
// not "diverges". No assumption that every orbit ends at an equilibrium (§4).
import { createTrajectory, stepTrajectory, type SimulationLimits } from "./lifecycle.ts";
import { attractorForDestination, type Attractor } from "./attractors.ts";
import type { Rect } from "./geometry.ts";
import type { Vec } from "../linear/vector.ts";
import type { DynamicalSystem } from "./system.ts";

export type BasinLabel =
  | { kind: "attractor"; index: number }   // index into the `attractors` array (stable identity, §6)
  | { kind: "limitCycle" }                 // periodic, not matched to a known cycle attractor
  | { kind: "escape" }                     // left the sampled domain
  | { kind: "timeout" }                    // budget exhausted, still moving
  | { kind: "numericalFailure" }
  | { kind: "unknown" };

export interface BasinGrid {
  cols: number;
  rows: number;
  bounds: Rect;
  attractors: Attractor[];
  /** row-major (row-major over rows×cols); null = not yet computed. */
  labels: (BasinLabel | null)[];
}

export type BasinResolution = "low" | "medium" | "high";
const RES_COLS: Record<BasinResolution, number> = { low: 16, medium: 28, high: 44 };

export interface BasinOptions {
  resolution?: BasinResolution;
  /** Simulation time budget per IC. Default 40. */
  tMax?: number;
  /** RK4 nominal step per IC. Default 0.06 (coarse — basins prize speed over fidelity). */
  h?: number;
  /** Sim-time advanced per stepTrajectory call. Default 0.5. */
  chunk?: number;
  /** Match radius pinning a termination to an attractor. Default 0.5. */
  matchRadius?: number;
}

export interface BasinSampler {
  grid: BasinGrid;
  total: number;
  done: number;
  /** Classify up to `budget` more cells. Returns true once the whole grid is done. */
  step(budget: number): boolean;
}

/** World coordinate of a cell centre (col,row). Exposed so the renderer can size cells. */
export function cellCenter(grid: BasinGrid, col: number, row: number): Vec {
  const { bounds, cols, rows } = grid;
  const x = bounds.xMin + ((col + 0.5) / cols) * (bounds.xMax - bounds.xMin);
  const y = bounds.yMin + ((row + 0.5) / rows) * (bounds.yMax - bounds.yMin);
  return [x, y];
}

/**
 * Build an incremental basin sampler over `bounds`. `attractors` gives the cells
 * their stable identity (attractor index); `equilibria` lets the integrator snap
 * to rest points. Drive it with `step(budget)` until it returns true.
 */
export function createBasinSampler(
  sys: DynamicalSystem,
  bounds: Rect,
  attractors: Attractor[],
  equilibria: Vec[],
  opts: BasinOptions = {},
): BasinSampler {
  const cols = RES_COLS[opts.resolution ?? "medium"];
  const width = bounds.xMax - bounds.xMin;
  const height = bounds.yMax - bounds.yMin;
  const aspect = height > 0 ? width / height : 1;
  const rows = Math.max(4, Math.round(cols / Math.max(aspect, 1e-6)));

  const tMax = opts.tMax ?? 40;
  const h = opts.h ?? 0.06;
  const chunk = opts.chunk ?? 0.5;
  const matchRadius = opts.matchRadius ?? 0.5;
  const stepGuard = Math.ceil(tMax / chunk) + 5;

  const limits: SimulationLimits = {
    viewport: bounds,
    domain: bounds,
    enforceDomain: true,
    tMax,
    equilibria,
  };

  const grid: BasinGrid = {
    cols, rows, bounds, attractors,
    labels: new Array<BasinLabel | null>(cols * rows).fill(null),
  };

  const classify = (x: number, y: number): BasinLabel => {
    const tr = createTrajectory(sys, [x, y], h);
    let guard = 0;
    while (tr.status === "running" && guard++ < stepGuard) {
      stepTrajectory(sys, tr, chunk, limits);
    }
    const term = tr.termination;
    if (!term) return { kind: "unknown" };
    switch (term.status) {
      case "equilibrium":
      case "limitCycle": {
        const a = attractorForDestination(term.at, term.status, attractors, matchRadius);
        if (a) return { kind: "attractor", index: attractors.indexOf(a) };
        return term.status === "limitCycle" ? { kind: "limitCycle" } : { kind: "unknown" };
      }
      case "escaped":
      case "outOfDomain":
        return { kind: "escape" };
      case "timeout":
        return { kind: "timeout" };
      case "numericalFailure":
        return { kind: "numericalFailure" };
      default:
        return { kind: "unknown" };
    }
  };

  const total = cols * rows;
  let cursor = 0;

  return {
    grid,
    total,
    get done() { return cursor; },
    step(budget: number): boolean {
      const end = Math.min(total, cursor + Math.max(1, budget));
      for (; cursor < end; cursor++) {
        const col = cursor % cols;
        const row = Math.floor(cursor / cols);
        const [x, y] = cellCenter(grid, col, row);
        grid.labels[cursor] = classify(x, y);
      }
      return cursor >= total;
    },
  };
}
