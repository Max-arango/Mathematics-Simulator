// 1D heat / diffusion equation  u_t = α · u_xx  by the explicit FTCS scheme
// (Forward-Time, Centred-Space) on a uniform grid with Dirichlet boundaries.
//
//   u[n+1][i] = u[n][i] + r · ( u[n][i+1] − 2·u[n][i] + u[n][i−1] ),   r = α·dt/dx²
//
// STABILITY (spec §27, the core discipline). Von-Neumann analysis gives the hard
// bound r ≤ 1/2: above it FTCS AMPLIFIES the shortest wavelength every step and the
// grid blows up — a result that is not merely inaccurate but qualitatively false
// (oscillates, diverges). Because there is no "slightly-wrong-but-usable" regime
// past 1/2, this solver REFUSES: r > 1/2 throws NumericalInstabilityError naming r
// and the limit, rather than returning garbage flagged stable:false. Returned
// results therefore always carry stable:true (and r ≤ 1/2 keeps the discrete
// maximum principle, so the interior never exceeds its initial/boundary extremes).
//
// This is a foundation, not a library: explicit-only (no Crank–Nicolson/implicit),
// Dirichlet-only, constant α, 1D. Implicit schemes lift the r ≤ 1/2 shackle but need
// a linear solve per step — out of scope here.
import { InvalidInputError, NumericalInstabilityError, ResourceLimitError } from "../core/errors.ts";
import { buildGrid, MAX_CELLS } from "./grid.ts";
import type { Grid1D, PDEResult1D } from "./types.ts";

export interface Heat1DParams {
  grid: Grid1D;
  alpha: number; // thermal diffusivity α > 0
  dt: number; // time step > 0
  steps: number; // number of time steps (result has steps+1 time rows)
  initial: (x: number) => number; // u(x, 0) on the interior
  boundary: { left: number; right: number }; // Dirichlet values, held fixed ∀ t
}

export function heat1d(p: Heat1DParams): PDEResult1D {
  const { grid, alpha, dt, steps, initial, boundary } = p;
  if (!(alpha > 0) || !Number.isFinite(alpha)) throw new InvalidInputError(`alpha must be > 0 (got ${alpha})`);
  if (!(dt > 0) || !Number.isFinite(dt)) throw new InvalidInputError(`dt must be > 0 (got ${dt})`);
  if (!Number.isInteger(steps) || steps < 1) throw new InvalidInputError(`steps must be a positive integer (got ${steps})`);
  if (!Number.isFinite(boundary.left) || !Number.isFinite(boundary.right)) throw new InvalidInputError("boundary.left/right must be finite");

  const x = buildGrid(grid);
  const nx = x.length;
  if ((steps + 1) * nx > MAX_CELLS) {
    throw new ResourceLimitError(`space-time grid ${steps + 1}×${nx} exceeds MAX_CELLS=${MAX_CELLS}; reduce steps or nx`);
  }

  const dx = x[1] - x[0];
  const r = (alpha * dt) / (dx * dx); // diffusion number
  if (r > 0.5) {
    throw new NumericalInstabilityError(
      `FTCS heat scheme is unstable for r=${r.toExponential(3)} > 0.5 (r = α·dt/dx²); ` +
        `reduce dt below ${(0.5 * dx * dx / alpha).toExponential(3)} or coarsen the grid`,
    );
  }

  // t=0 row: interior from the initial condition, boundary nodes from Dirichlet.
  const u0 = new Array<number>(nx);
  for (let i = 0; i < nx; i++) u0[i] = initial(x[i]);
  u0[0] = boundary.left;
  u0[nx - 1] = boundary.right;
  if (!u0.every(Number.isFinite)) throw new InvalidInputError("initial(x) produced a non-finite value");

  const t: number[] = new Array(steps + 1);
  t[0] = 0;
  const u: number[][] = [u0];
  let cur = u0;

  for (let n = 0; n < steps; n++) {
    const next = new Array<number>(nx);
    next[0] = boundary.left; // Dirichlet, held fixed every step
    next[nx - 1] = boundary.right;
    for (let i = 1; i < nx - 1; i++) {
      next[i] = cur[i] + r * (cur[i + 1] - 2 * cur[i] + cur[i - 1]);
    }
    cur = next;
    u.push(next);
    t[n + 1] = (n + 1) * dt;
  }

  return { x, t, u, method: "FTCS", stable: true, stabilityNumber: r, warnings: [] };
}
