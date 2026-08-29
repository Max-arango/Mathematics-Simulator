// Adaptive Simpson quadrature. Recursively bisects until the local Simpson error
// estimate |S_left + S_right − S| / 15 falls under tolerance. Reports evaluation
// count, convergence, and estimated error in meta. The fixed-rule
// analysis/integrate.ts stays untouched for back-compat.
import { type MathResult, approx, exact, undefinedResult } from "../core/result.ts";

const simpson = (fa: number, fm: number, fb: number, h: number): number => (h / 6) * (fa + 4 * fm + fb);

interface Recur { value: number; converged: boolean }

function recurse(
  f: (x: number) => number,
  a: number, b: number,
  fa: number, fm: number, fb: number,
  whole: number, tol: number, depth: number,
  evals: { n: number },
): Recur {
  const m = (a + b) / 2;
  const lm = (a + m) / 2;
  const rm = (m + b) / 2;
  const flm = f(lm);
  const frm = f(rm);
  evals.n += 2;
  if (!Number.isFinite(flm) || !Number.isFinite(frm)) return { value: NaN, converged: false };
  const left = simpson(fa, flm, fm, m - a);
  const right = simpson(fm, frm, fb, b - m);
  const err = left + right - whole;
  // Converged: Richardson-corrected error under tolerance.
  if (depth <= 0) return { value: left + right + err / 15, converged: false };
  if (Math.abs(err) <= 15 * tol) return { value: left + right + err / 15, converged: true };
  const lr = recurse(f, a, m, fa, flm, fm, left, tol / 2, depth - 1, evals);
  const rr = recurse(f, m, b, fm, frm, fb, right, tol / 2, depth - 1, evals);
  return { value: lr.value + rr.value, converged: lr.converged && rr.converged };
}

export function adaptiveSimpson(
  f: (x: number) => number,
  a: number, b: number,
  tol = 1e-10, maxDepth = 50,
): MathResult<number> {
  if (a === b) return exact(0);
  // Reversed bounds: integrate forward, negate.
  if (a > b) {
    const r = adaptiveSimpson(f, b, a, tol, maxDepth);
    if (r.kind === "approx") return approx(-r.value, { error: r.error, evals: r.evals, converged: r.converged });
    if (r.kind === "notConverged") return { kind: "notConverged", value: r.value === undefined ? undefined : -r.value, reason: r.reason };
    return r;
  }

  const m = (a + b) / 2;
  const fa = f(a), fm = f(m), fb = f(b);
  const evals = { n: 3 };
  if (!Number.isFinite(fa) || !Number.isFinite(fm) || !Number.isFinite(fb)) {
    return undefinedResult("non-finite integrand sample at an endpoint or midpoint");
  }
  const whole = simpson(fa, fm, fb, b - a);
  const r = recurse(f, a, b, fa, fm, fb, whole, tol, maxDepth, evals);

  if (!Number.isFinite(r.value)) return undefinedResult("non-finite integrand sample inside interval (singularity/pole)");
  if (!r.converged) {
    return { kind: "notConverged", value: r.value, reason: `did not reach tol=${tol} within maxDepth=${maxDepth}` };
  }
  return approx(r.value, { error: Math.abs(tol), evals: evals.n, converged: true });
}
