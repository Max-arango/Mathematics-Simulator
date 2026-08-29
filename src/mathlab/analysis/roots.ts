// Numeric root finding by sign-change bracketing + bisection refinement.
// Robust for continuous f; ignores roots without a sign change (e.g. tangencies).
export function findRoots(f: (x: number) => number, xmin: number, xmax: number, samples = 2000, tol = 1e-10): number[] {
  const roots: number[] = [];
  const step = (xmax - xmin) / samples;
  let xPrev = xmin;
  let fPrev = f(xPrev);
  for (let i = 1; i <= samples; i++) {
    const x = xmin + i * step;
    const fx = f(x);
    if (fPrev === 0) roots.push(xPrev);
    else if (Number.isFinite(fPrev) && Number.isFinite(fx) && fPrev * fx < 0) {
      roots.push(bisect(f, xPrev, x, tol));
    }
    xPrev = x;
    fPrev = fx;
  }
  // Dedupe roots closer than the sample step.
  return roots.filter((r, i) => i === 0 || Math.abs(r - roots[i - 1]) > step * 0.5);
}

function bisect(f: (x: number) => number, a: number, b: number, tol: number): number {
  let fa = f(a);
  for (let i = 0; i < 100 && b - a > tol; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (fa * fm < 0) b = m;
    else { a = m; fa = fm; }
  }
  return (a + b) / 2;
}

/** Newton-Raphson iterates from x0; returns the visited points (for visualisation). */
export function newtonSteps(f: (x: number) => number, df: (x: number) => number, x0: number, maxIter = 30, tol = 1e-12): number[] {
  const xs = [x0];
  let x = x0;
  for (let i = 0; i < maxIter; i++) {
    const d = df(x);
    if (!Number.isFinite(d) || d === 0) break;
    const next = x - f(x) / d;
    xs.push(next);
    if (Math.abs(next - x) < tol) break;
    x = next;
  }
  return xs;
}
