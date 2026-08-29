// Gamma function and its logarithm — the seed of the special-function registry (spec §39).
// These are needed by the probability distributions: binomial/Poisson pmf use logGamma
// (for log-factorials / log-binomial coefficients), so a numerically stable log-domain
// implementation matters more than a raw gamma.
//
// METHOD: Lanczos approximation (g = 7, n = 9 coefficients). Γ(z) is approximated by
//   Γ(z+1) = √(2π) · (z + g + ½)^(z+½) · e^(−(z+g+½)) · A_g(z),
//   A_g(z) = c₀ + Σ_{k=1}^{g+1} c_k / (z + k).
// We work in log space throughout, so logGamma is stable for large arguments (no overflow).
// For 0 < x < ½ we apply Euler's reflection Γ(x)Γ(1−x) = π/sin(πx); on that sub-interval
// sin(πx) > 0 so the log is real. ACCURACY: relative error ~1e-14 for x > 0 (double-precision
// limit of the g = 7 Lanczos coefficients).
import { DomainError } from "../core/errors.ts";

// Lanczos g = 7 coefficients (Godfrey's set), matched to the (z + g + ½) shift below.
const G = 7;
const LANCZOS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);

/**
 * Natural log of the Gamma function for x > 0. logGamma(n) = ln((n−1)!) for positive
 * integers n. Relative accuracy ~1e-14. Throws DomainError for x ≤ 0.
 */
export function logGamma(x: number): number {
  if (!Number.isFinite(x) || x <= 0) {
    throw new DomainError(`logGamma is defined here for x > 0 (got ${x})`);
  }
  // Reflection for the left tail keeps the Lanczos sum well-conditioned; sin(πx) > 0 on (0, ½).
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + G + 0.5;
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i] / (z + i);
  return LOG_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Gamma function. Γ(x) = exp(logGamma(x)) for x > 0; extended to x < 0 by Euler reflection
 * Γ(x) = π / (sin(πx)·Γ(1−x)). Poles at 0, −1, −2, … raise DomainError.
 */
export function gamma(x: number): number {
  if (x > 0) return Math.exp(logGamma(x));
  if (Number.isInteger(x)) {
    throw new DomainError(`gamma has poles at non-positive integers (got ${x})`);
  }
  // x < 0, non-integer: reflection.
  return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
}
