// Numeric inverse of g_mu_nu at a point, via the existing generic NxN linear
// solver (linear/matrix.ts::inverse) — no second inversion routine. A singular
// metric is a legitimate physical/coordinate-chart failure (not a crash), so it
// surfaces through MathResult rather than throwing.
import { make, inverse } from "../linear/matrix.ts";
import { domainError, exact, numericalError, type MathResult } from "../core/result.ts";

/** g^mu_nu at a point, given g_mu_nu as a dense array. */
export function invertMetric(g: number[][]): MathResult<number[][]> {
  const n = g.length;
  if (n === 0 || g.some((row) => row.length !== n)) {
    return domainError("metric must be a square matrix to invert");
  }
  const inv = inverse(make(g));
  if (inv === null) {
    return numericalError("metric is singular at this point (no inverse exists)");
  }
  // A direct LU-based numeric inverse of a fully-determined matrix, not an
  // iterative approximation — tagged "exact" per ADR-004 (same convention as
  // other closed-form-but-floating-point results elsewhere in the codebase).
  return exact(inv.data);
}
