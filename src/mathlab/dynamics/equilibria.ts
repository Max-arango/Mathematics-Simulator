// Equilibria (fixed points) of a dynamical system, found NUMERICALLY.
//
//   continuous:  solve  field(x) = 0        (rest points of the flow)
//   discrete:    solve  field(x) − x = 0     (fixed points of the map)
//
// METHOD: multivariate Newton from a set of seeds. From each seed we iterate
//   J·Δ = −g(x),   x ← x + Δ     until ‖g(x)‖ < tol or the iteration cap,
// where g is the residual above and J its Jacobian (J_field for continuous,
// J_field − I for discrete). The linear step is solved by LU (linear/matrix.solve);
// a singular Jacobian (solve → null) means Newton has no well-defined step there, so
// that seed is abandoned. Converged roots are de-duplicated within a tolerance.
//
// HONESTY (spec §16): this returns NUMERICAL CANDIDATES, not a proof. Newton only finds
// roots inside the basin of some seed — roots between/beyond the seeds are missed, and
// nothing here certifies existence, count, or completeness. Widen `range`, raise
// `gridPoints`, or pass explicit `seeds` to probe more of state space.
import { ABS_TOL, MAX_ITERATIONS } from "../core/constants.ts";
import { InvalidInputError } from "../core/errors.ts";
import { make, solve } from "../linear/matrix.ts";
import { norm, sub, add, scale, distance, type Vec } from "../linear/vector.ts";
import { evalField, jacobianField, type DynamicalSystem } from "./system.ts";

export interface EquilibriaOptions {
  /** Explicit Newton seeds. When given, `range`/`gridPoints` are ignored. */
  seeds?: Vec[];
  /** Per-dimension search interval for the auto seed grid. Default [-5, 5]. */
  range?: [number, number];
  /** Auto seed grid: points per dimension (grid size = gridPoints^dim). Default 5. */
  gridPoints?: number;
  /** Residual convergence tolerance ‖g(x)‖. Default ABS_TOL. */
  tol?: number;
  /** Newton iteration cap per seed. Default MAX_ITERATIONS. */
  maxIter?: number;
  /** Two roots within this distance are treated as the same point. Default 1e-6. */
  dedupeTol?: number;
}

const DEFAULT_RANGE: [number, number] = [-5, 5];
const DEFAULT_GRID = 5;
const DEFAULT_DEDUPE = 1e-6;
// Guard against combinatorial blow-up of the auto grid in high dimensions.
const MAX_AUTO_SEEDS = 4096;

const NOTE =
  "NUMERICAL CANDIDATES: equilibria found by Newton iteration from a finite seed set. " +
  "This is not a proof of existence or completeness — roots outside the seeds' basins are " +
  "missed and near-degenerate (singular-Jacobian) roots are skipped. Widen the range, raise " +
  "gridPoints, or pass explicit seeds to search more of state space.";

// Inclusive linspace; a single point collapses to the interval midpoint.
function linspace(a: number, b: number, n: number): number[] {
  if (n <= 1) return [(a + b) / 2];
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

// Cartesian product of a per-dimension axis into a flat list of seed points.
function grid(axes: number[][]): Vec[] {
  return axes.reduce<Vec[]>((acc, axis) => acc.flatMap((pt) => axis.map((v) => [...pt, v])), [[]]);
}

function seedsFor(sys: DynamicalSystem, opts: EquilibriaOptions): Vec[] {
  if (opts.seeds) return opts.seeds;
  const range = opts.range ?? DEFAULT_RANGE;
  const g = opts.gridPoints ?? DEFAULT_GRID;
  const total = Math.pow(g, sys.vars.length);
  if (total > MAX_AUTO_SEEDS) {
    throw new InvalidInputError(
      `auto seed grid would be ${g}^${sys.vars.length} = ${total} points (> ${MAX_AUTO_SEEDS}); ` +
        `pass explicit seeds or lower gridPoints for a ${sys.vars.length}-D system`,
    );
  }
  const axis = linspace(range[0], range[1], g);
  return grid(sys.vars.map(() => axis));
}

// Residual g(x) whose roots are the equilibria: field(x) for a flow, field(x)−x for a map.
const residual = (sys: DynamicalSystem, x: Vec): Vec =>
  sys.kind === "discrete" ? sub(evalField(sys, x), x) : evalField(sys, x);

// One Newton run from a seed. Returns the converged root or null (singular step,
// non-finite iterate, or cap reached without converging).
function newton(sys: DynamicalSystem, seed: Vec, tol: number, maxIter: number): Vec | null {
  let x = seed.slice();
  for (let iter = 0; iter < maxIter; iter++) {
    const g = residual(sys, x);
    if (!g.every(Number.isFinite)) return null;
    if (norm(g) < tol) return x;
    // Residual Jacobian: J_field for a flow, J_field − I for a map (d/dx of field(x)−x).
    const jf = jacobianField(sys, x);
    const a = sys.kind === "discrete" ? jf.map((row, i) => row.map((v, j) => (i === j ? v - 1 : v))) : jf;
    const delta = solve(make(a), scale(g, -1));
    if (delta === null) return null; // singular Jacobian → no Newton step here
    x = add(x, delta);
  }
  const g = residual(sys, x);
  return g.every(Number.isFinite) && norm(g) < tol ? x : null;
}

/**
 * Find equilibria (continuous) / fixed points (discrete) of `sys` numerically.
 * Returns candidate points plus a `note` stating the numerical, seed-dependent nature
 * of the result (see file header). Each returned point satisfies ‖g(x)‖ < tol.
 */
export function findEquilibria(
  sys: DynamicalSystem,
  opts: EquilibriaOptions = {},
): { points: Vec[]; note: string } {
  const tol = opts.tol ?? ABS_TOL;
  const maxIter = opts.maxIter ?? MAX_ITERATIONS;
  const dedupeTol = opts.dedupeTol ?? DEFAULT_DEDUPE;

  const points: Vec[] = [];
  for (const seed of seedsFor(sys, opts)) {
    const root = newton(sys, seed, tol, maxIter);
    if (root && !points.some((p) => distance(p, root) < dedupeTol)) points.push(root);
  }
  return { points, note: NOTE };
}
