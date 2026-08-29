// Univariate minimization by GOLDEN-SECTION SEARCH — a derivative-free bracket method.
//
// ASSUMPTION (load-bearing): f is UNIMODAL on [a,b], i.e. it has a single interior minimum
// and is non-increasing then non-decreasing. Given that, golden-section keeps a bracket
// [a,b] guaranteed to contain the minimum and shrinks it by the golden ratio each step,
// reusing one of the two interior probes so only ONE new f-evaluation is needed per
// iteration. If f is NOT unimodal the returned point is still a valid local minimum of the
// final tiny bracket, but it may not be the global minimum on [a,b] — this is a LOCAL method.
//
// The ratio 1/φ = (√5−1)/2 is what makes an interior point reusable: shrinking by that
// factor leaves the surviving probe positioned as an interior probe of the new interval.
//
// Being derivative-free, there is no gradient; gradientNorm is reported as NaN.
import { InvalidInputError } from "../core/errors.ts";
import { ABS_TOL, MAX_ITERATIONS } from "../core/constants.ts";
import type { OptResult } from "./objective.ts";

/** 1/φ = (√5 − 1)/2 ≈ 0.6180339887 — the golden-section shrink factor. */
const INV_PHI = (Math.sqrt(5) - 1) / 2;

export interface GoldenSectionOptions {
  tol?: number;           // stop when the bracket width < tol (default ABS_TOL)
  maxIterations?: number; // iteration cap (default MAX_ITERATIONS; ample for any sane bracket)
}

/**
 * Golden-section search for a MINIMUM of `f` on the interval [a, b] (unimodal assumption).
 * Converges when the bracket width falls below `tol`. Throws InvalidInputError unless
 * a < b and both endpoints are finite.
 *
 * The reported `solution` is the length-1 vector [midpoint of the final bracket]; the
 * `trajectory` records the bracket midpoint at every step (first entry = midpoint of the
 * initial [a,b], last entry = solution).
 */
export function goldenSection(
  f: (x: number) => number,
  a: number,
  b: number,
  opts: GoldenSectionOptions = {},
): OptResult {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new InvalidInputError(`goldenSection needs finite endpoints; got [${a}, ${b}]`);
  }
  if (a >= b) {
    throw new InvalidInputError(`goldenSection needs a < b; got a=${a}, b=${b}`);
  }

  const tol = opts.tol ?? ABS_TOL;
  const maxIterations = opts.maxIterations ?? MAX_ITERATIONS;

  let lo = a;
  let hi = b;
  // Two interior probes; one is reused each iteration (that is the whole point of φ).
  let c = hi - INV_PHI * (hi - lo);
  let d = lo + INV_PHI * (hi - lo);
  let fc = f(c);
  let fd = f(d);

  const trajectory: number[][] = [[(lo + hi) / 2]];
  let iterations = 0;
  let converged = false;
  let termination = "max-iterations";

  while (iterations < maxIterations) {
    if (hi - lo < tol) {
      converged = true;
      termination = "interval-tol";
      break;
    }
    if (fc < fd) {
      // minimum is in [lo, d] → drop the right; the old c becomes the new d (reused).
      hi = d;
      d = c;
      fd = fc;
      c = hi - INV_PHI * (hi - lo);
      fc = f(c);
    } else {
      // minimum is in [c, hi] → drop the left; the old d becomes the new c (reused).
      lo = c;
      c = d;
      fc = fd;
      d = lo + INV_PHI * (hi - lo);
      fd = f(d);
    }
    iterations++;
    trajectory.push([(lo + hi) / 2]);
  }
  // Final bracket may have satisfied tol on the last shrink (loop exits on the cap).
  if (!converged && hi - lo < tol) {
    converged = true;
    termination = "interval-tol";
  }

  const x = (lo + hi) / 2;
  return {
    solution: [x],
    objective: f(x),
    iterations,
    converged,
    gradientNorm: NaN, // derivative-free method — no gradient
    termination,
    method: "golden-section",
    warnings: converged ? [] : [`bracket width ${(hi - lo).toExponential(3)} did not reach tol ${tol} within ${maxIterations} iterations`],
    trajectory,
  };
}
