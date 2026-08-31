// 1D wave equation  u_tt = c² · u_xx  by the explicit leapfrog scheme (central
// differences in both time and space) on a uniform grid with Dirichlet boundaries.
//
//   u[n+1][i] = 2u[n][i] − u[n−1][i] + C²·( u[n][i+1] − 2u[n][i] + u[n][i−1] )
//
// with Courant number C = c·dt/dx. The very first step has no u[n−1], so it is taken
// from the initial velocity v₀(x) via a Taylor step that substitutes u_tt = c²·u_xx:
//
//   u[1][i] = u[0][i] + dt·v₀(x_i) + ½·C²·( u[0][i+1] − 2u[0][i] + u[0][i−1] )
//
// STABILITY (spec §27). The CFL condition for this scheme is C ≤ 1: a wave must not
// cross more than one cell per step, else the shortest mode is amplified and the
// solution explodes. Like heat1d there is no usable regime past the limit, so this
// solver REFUSES — C > 1 throws NumericalInstabilityError naming C and the CFL bound
// — rather than returning a blown-up grid flagged stable:false. (At exactly C = 1
// leapfrog is dispersion-free / "magic"; below it a small phase error accumulates,
// which is why the standing-wave round-trip test uses a few-percent tolerance.)
//
// Foundation scope: explicit leapfrog only, Dirichlet only, constant c, 1D.
import { InvalidInputError, NumericalInstabilityError, ResourceLimitError } from "../core/errors.ts";
import { buildGrid, MAX_CELLS } from "./grid.ts";
import type { Grid1D, PDEResult1D } from "./types.ts";

export interface Wave1DParams {
  grid: Grid1D;
  c: number; // wave speed c > 0
  dt: number; // time step > 0
  steps: number; // number of time steps (result has steps+1 time rows)
  initial: (x: number) => number; // u(x, 0) on the interior
  initialVelocity?: (x: number) => number; // u_t(x, 0); default 0 (rest)
  boundary: { left: number; right: number }; // Dirichlet values, held fixed ∀ t
}

export function wave1d(p: Wave1DParams): PDEResult1D {
  const { grid, c, dt, steps, initial, boundary } = p;
  const initialVelocity = p.initialVelocity ?? (() => 0);
  if (!(c > 0) || !Number.isFinite(c)) throw new InvalidInputError(`c must be > 0 (got ${c})`);
  if (!(dt > 0) || !Number.isFinite(dt)) throw new InvalidInputError(`dt must be > 0 (got ${dt})`);
  if (!Number.isInteger(steps) || steps < 1) throw new InvalidInputError(`steps must be a positive integer (got ${steps})`);
  if (!Number.isFinite(boundary.left) || !Number.isFinite(boundary.right)) throw new InvalidInputError("boundary.left/right must be finite");

  const x = buildGrid(grid);
  const nx = x.length;
  if ((steps + 1) * nx > MAX_CELLS) {
    throw new ResourceLimitError(`space-time grid ${steps + 1}×${nx} exceeds MAX_CELLS=${MAX_CELLS}; reduce steps or nx`);
  }

  const dx = x[1] - x[0];
  const courant = (c * dt) / dx;
  if (courant > 1) {
    throw new NumericalInstabilityError(
      `leapfrog wave scheme violates CFL for Courant C=${courant.toExponential(3)} > 1 (C = c·dt/dx); ` +
        `reduce dt below ${(dx / c).toExponential(3)} or coarsen the grid`,
    );
  }
  const c2 = courant * courant;

  // t=0 row: interior from initial, boundary nodes from Dirichlet.
  const u0 = new Array<number>(nx);
  for (let i = 0; i < nx; i++) u0[i] = initial(x[i]);
  u0[0] = boundary.left;
  u0[nx - 1] = boundary.right;
  if (!u0.every(Number.isFinite)) throw new InvalidInputError("initial(x) produced a non-finite value");

  const t: number[] = new Array(steps + 1);
  t[0] = 0;
  const u: number[][] = [u0];

  // First step from the initial velocity (½·C² Taylor step, u_tt = c²·u_xx).
  const u1 = new Array<number>(nx);
  u1[0] = boundary.left;
  u1[nx - 1] = boundary.right;
  for (let i = 1; i < nx - 1; i++) {
    const v0 = initialVelocity(x[i]);
    if (!Number.isFinite(v0)) throw new InvalidInputError("initialVelocity(x) produced a non-finite value");
    u1[i] = u0[i] + dt * v0 + 0.5 * c2 * (u0[i + 1] - 2 * u0[i] + u0[i - 1]);
  }
  u.push(u1);
  t[1] = dt;

  // Leapfrog for the remaining steps: needs the two previous time levels.
  let prev = u0;
  let cur = u1;
  for (let n = 1; n < steps; n++) {
    const next = new Array<number>(nx);
    next[0] = boundary.left; // Dirichlet, held fixed every step
    next[nx - 1] = boundary.right;
    for (let i = 1; i < nx - 1; i++) {
      next[i] = 2 * cur[i] - prev[i] + c2 * (cur[i + 1] - 2 * cur[i] + cur[i - 1]);
    }
    prev = cur;
    cur = next;
    u.push(next);
    t[n + 1] = (n + 1) * dt;
  }

  return { x, t, u, method: "leapfrog", stable: true, stabilityNumber: courant, warnings: [] };
}
