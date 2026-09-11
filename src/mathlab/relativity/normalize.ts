// Timelike unit-norm normalization: given a metric model, a spacetime point x,
// and the SPATIAL part of a 4-velocity (u^1..u^(n-1); e.g. u^r, u^theta, u^phi
// for a spherical chart), solve g_mu_nu u^mu u^nu = -1 for the missing u^0
// (u^t) component. This is the standard "parametrize by proper time for a
// massive test particle" step every geodesic spawner needs — not UI logic.
//
// Expanding the norm condition with u^0 = y unknown and u^i (i>=1) given:
//   g_00 y^2 + 2y*sum_i(g_0i u^i) + sum_{i,j>=1}(g_ij u^i u^j) = -1
// i.e. a quadratic A*y^2 + B*y + C = 0 with:
//   A = g_00, B = 2*sum_i(g_0i u^i), C = 1 + sum_{i,j>=1}(g_ij u^i u^j)
// This is fully general — off-diagonal g_0i (Kerr's g_tphi) falls out of the
// same formula; a diagonal metric (Minkowski/Schwarzschild) just has B=0.
import { evalMetric, type MetricModel } from "./metric.ts";
import { domainError, exact, type MathResult } from "../core/result.ts";
import { InvalidInputError } from "../core/errors.ts";

/**
 * Solve for the future-pointing (u^0>0) timelike-unit-norm u^0, given the
 * spatial components u^1..u^(n-1). Returns the full n-vector u with u[0] filled in.
 */
export function normalizeTimelikeVelocity(model: MetricModel, x: number[], uSpatial: number[]): MathResult<number[]> {
  const n = model.coords.length;
  if (uSpatial.length !== n - 1) {
    throw new InvalidInputError(`expected ${n - 1} spatial velocity components, got ${uSpatial.length}`);
  }
  const g = evalMetric(model, x);
  const u = [0, ...uSpatial];

  const A = g[0][0];
  let B = 0;
  for (let i = 1; i < n; i++) B += 2 * g[0][i] * u[i];
  let C = 1;
  for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) C += g[i][j] * u[i] * u[j];

  let roots: number[];
  if (A === 0) {
    if (B === 0) return domainError("g_00 and its coupling to u^0 both vanish — u^t is undetermined");
    roots = [-C / B];
  } else {
    const disc = B * B - 4 * A * C;
    if (disc < 0) return domainError("no real u^t solves the timelike norm condition (spacelike configuration)");
    const sq = Math.sqrt(disc);
    roots = [(-B + sq) / (2 * A), (-B - sq) / (2 * A)];
  }

  const future = roots.filter((r) => Number.isFinite(r) && r > 0);
  if (future.length === 0) return domainError("no future-pointing (u^t>0) real root");
  // Signature -+++ with a genuinely timelike-admissible C makes exactly one
  // root future-pointing; if degenerate/both positive, take the larger |u^t|
  // root deterministically rather than guessing.
  const u0 = future.reduce((best, r) => (Math.abs(r) > Math.abs(best) ? r : best));
  u[0] = u0;
  return exact(u);
}
