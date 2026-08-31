// 2D steady-state elliptic solver on the unit square [0,1]×[0,1] with Dirichlet
// boundaries, by Gauss–Seidel iteration of the 5-point finite-difference stencil.
//
//   Laplace:  ∇²u = 0            Poisson:  ∇²u = f(x,y)
//
// Discretising  ∂²u/∂x² + ∂²u/∂y² = f  with central differences (spacings dx, dy)
// and solving the centre node gives the Gauss–Seidel sweep
//
//   u[i][j] ← ( wx·(u[i+1][j]+u[i−1][j]) + wy·(u[i][j+1]+u[i][j−1]) − f_ij ) / (2wx+2wy)
//   wx = 1/dx²,  wy = 1/dy²
//
// updating IN PLACE so each node immediately sees its already-updated neighbours
// (Gauss–Seidel converges ~2× faster than Jacobi for the same work). This is an
// ELLIPTIC / steady-state problem, so there is no CFL-style time-step stability to
// police (spec §27); the honesty concern here is CONVERGENCE, and the solver reports
// it truthfully: it sweeps until the residual max|∇²u − f| drops below `tol`, and if
// it hits the `maxIter` cap first it returns converged:false with a warning rather
// than passing off an unconverged field as the answer.
//
// Ponytail: plain Gauss–Seidel. Its spectral radius is ρ ≈ 1 − O(1/N²), so iteration
// count grows ~N² with the grid — fine for the modest grids this foundation targets.
// If large grids ever matter, SOR (over-relaxation) or multigrid is the upgrade path;
// deliberately out of scope for a minimal foundation.
import { InvalidInputError, ResourceLimitError } from "../core/errors.ts";
import { MAX_CELLS } from "./grid.ts";
import { MAX_GRID } from "../core/constants.ts";

/** A Dirichlet edge value: a constant, or a function of the coordinate ALONG that edge. */
type EdgeBC = number | ((s: number) => number);

export interface Laplace2DParams {
  nx: number; // grid points along x (including both boundaries), nx ≥ 3
  ny: number; // grid points along y (including both boundaries), ny ≥ 3
  // Dirichlet data. top/bottom are functions of x; left/right are functions of y.
  // Where two edges meet at a corner the vertical edge (left/right) wins.
  boundary: { top: EdgeBC; bottom: EdgeBC; left: EdgeBC; right: EdgeBC };
  source?: (x: number, y: number) => number; // f(x,y) for Poisson ∇²u=f; omit ⇒ Laplace (f≡0)
  maxIter?: number; // sweep cap (default 10000)
  tol?: number; // residual tolerance on max|∇²u − f| (default 1e-6)
}

export interface Laplace2DResult {
  u: number[][]; // u[i][j] = value at (x_i, y_j); i indexes x (0..nx-1), j indexes y (0..ny-1)
  iterations: number; // Gauss–Seidel sweeps performed
  converged: boolean; // residual < tol reached before maxIter
  residual: number; // final max|∇²u − f| over interior nodes
  warnings: string[];
}

const DEFAULT_MAX_ITER = 10000;
const DEFAULT_TOL = 1e-6;

const asFn = (b: EdgeBC): ((s: number) => number) => (typeof b === "number" ? () => b : b);

export function laplace2d(p: Laplace2DParams): Laplace2DResult {
  const { nx, ny, boundary } = p;
  if (!Number.isInteger(nx) || nx < 3) throw new InvalidInputError(`nx must be an integer ≥ 3 (got ${nx})`);
  if (!Number.isInteger(ny) || ny < 3) throw new InvalidInputError(`ny must be an integer ≥ 3 (got ${ny})`);
  if (nx > MAX_GRID || ny > MAX_GRID) throw new ResourceLimitError(`grid ${nx}×${ny} exceeds MAX_GRID=${MAX_GRID} per axis`);
  if (nx * ny > MAX_CELLS) throw new ResourceLimitError(`grid ${nx}×${ny} exceeds MAX_CELLS=${MAX_CELLS}`);

  const maxIter = p.maxIter ?? DEFAULT_MAX_ITER;
  const tol = p.tol ?? DEFAULT_TOL;
  if (!Number.isInteger(maxIter) || maxIter < 1) throw new InvalidInputError(`maxIter must be a positive integer (got ${maxIter})`);
  if (!(tol > 0) || !Number.isFinite(tol)) throw new InvalidInputError(`tol must be > 0 (got ${tol})`);

  const dx = 1 / (nx - 1);
  const dy = 1 / (ny - 1);
  const x = Array.from({ length: nx }, (_, i) => i * dx);
  const y = Array.from({ length: ny }, (_, j) => j * dy);
  const source = p.source ?? (() => 0);
  const [top, bottom, left, right] = [asFn(boundary.top), asFn(boundary.bottom), asFn(boundary.left), asFn(boundary.right)];

  // Allocate u[i][j] and stamp the boundary. Apply bottom/top (functions of x) first,
  // then left/right (functions of y) so vertical edges win at the corners.
  const u: number[][] = Array.from({ length: nx }, () => new Array<number>(ny).fill(0));
  let bSum = 0;
  let bCount = 0;
  const stamp = (i: number, j: number, v: number) => {
    if (!Number.isFinite(v)) throw new InvalidInputError("boundary produced a non-finite value");
    u[i][j] = v;
    bSum += v;
    bCount++;
  };
  for (let i = 0; i < nx; i++) {
    stamp(i, 0, bottom(x[i]));
    stamp(i, ny - 1, top(x[i]));
  }
  for (let j = 0; j < ny; j++) {
    stamp(0, j, left(y[j]));
    stamp(nx - 1, j, right(y[j]));
  }
  // Warm start: seed the interior with the boundary mean (constant BC ⇒ converges at once).
  const seed = bSum / bCount;
  for (let i = 1; i < nx - 1; i++) for (let j = 1; j < ny - 1; j++) u[i][j] = seed;

  const wx = 1 / (dx * dx);
  const wy = 1 / (dy * dy);
  const denom = 2 * (wx + wy);

  // Precompute the interior source term f_ij once (f is fixed across sweeps).
  const f: number[][] = Array.from({ length: nx }, (_, i) => Array.from({ length: ny }, (_, j) => source(x[i], y[j])));

  const residualOf = (): number => {
    let res = 0;
    for (let i = 1; i < nx - 1; i++) {
      for (let j = 1; j < ny - 1; j++) {
        const lap = wx * (u[i + 1][j] - 2 * u[i][j] + u[i - 1][j]) + wy * (u[i][j + 1] - 2 * u[i][j] + u[i][j - 1]);
        res = Math.max(res, Math.abs(lap - f[i][j]));
      }
    }
    return res;
  };

  let iterations = 0;
  let residual = residualOf();
  const warnings: string[] = [];
  while (iterations < maxIter && residual > tol) {
    for (let i = 1; i < nx - 1; i++) {
      for (let j = 1; j < ny - 1; j++) {
        u[i][j] = (wx * (u[i + 1][j] + u[i - 1][j]) + wy * (u[i][j + 1] + u[i][j - 1]) - f[i][j]) / denom;
      }
    }
    iterations++;
    residual = residualOf();
  }

  const converged = residual <= tol;
  if (!converged) {
    warnings.push(`Gauss–Seidel did not reach tol=${tol} in ${maxIter} sweeps (residual=${residual.toExponential(3)}); result is NOT converged`);
  }
  return { u, iterations, converged, residual, warnings };
}
