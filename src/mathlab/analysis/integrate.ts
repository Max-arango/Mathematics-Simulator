// Composite Simpson's rule for ∫_a^b f. n forced even. Returns NaN if the
// integrand is non-finite anywhere in the interval (e.g. a pole inside [a,b]).
export function simpson(f: (x: number) => number, a: number, b: number, n = 1000): number {
  if (a === b) return 0;
  const sign = a < b ? 1 : -1;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (n % 2) n++;
  const h = (hi - lo) / n;
  let sum = f(lo) + f(hi);
  for (let i = 1; i < n; i++) {
    const y = f(lo + i * h);
    if (!Number.isFinite(y)) return NaN;
    sum += (i % 2 ? 4 : 2) * y;
  }
  if (!Number.isFinite(sum)) return NaN;
  return sign * (h / 3) * sum;
}
