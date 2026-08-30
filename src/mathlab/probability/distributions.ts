// The six seed distributions (spec §39). Each factory validates its parameters (throwing
// InvalidInputError/DomainError), then returns a Distribution with closed-form mean/variance,
// a cdf, and a seeded sampler. Discrete pmfs (binomial, Poisson) are evaluated in the log
// domain via logGamma to stay stable for large counts; the Normal cdf uses erfc. Sampling
// reuses core/rng (spec §29) so draws are reproducible.
import { uniform as rngUniform, normal as rngNormal } from "../core/rng.ts";
import { InvalidInputError } from "../core/errors.ts";
import { logGamma } from "../special/gamma.ts";
import { erfc } from "../special/erf.ts";
import type { Distribution } from "./distribution.ts";

// ── parameter helpers ────────────────────────────────────────────────────────
const need = (params: Record<string, number>, key: string): number => {
  const v = params[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new InvalidInputError(`parameter "${key}" must be a finite number (got ${v})`);
  }
  return v;
};

const SQRT_2 = Math.SQRT2;
const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** log C(n, k) via logGamma. Requires 0 ≤ k ≤ n integers. */
const logChoose = (n: number, k: number): number =>
  logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

// ── Bernoulli(p) ───────────────────────────────────────────────────────────
export function makeBernoulli(params: Record<string, number>): Distribution {
  const p = need(params, "p");
  if (p < 0 || p > 1) throw new InvalidInputError(`Bernoulli p must be in [0,1] (got ${p})`);
  return {
    name: "bernoulli",
    kind: "discrete",
    params: { p },
    mean: p,
    variance: p * (1 - p),
    support: { lo: 0, hi: 1 },
    pmf: (k) => (k === 1 ? p : k === 0 ? 1 - p : 0),
    cdf: (x) => (x < 0 ? 0 : x < 1 ? 1 - p : 1),
    sample: (rng) => (rng.next() < p ? 1 : 0),
  };
}

// ── Binomial(n, p) ──────────────────────────────────────────────────────────
export function makeBinomial(params: Record<string, number>): Distribution {
  const n = need(params, "n");
  const p = need(params, "p");
  if (!Number.isInteger(n) || n < 0) throw new InvalidInputError(`Binomial n must be an integer ≥ 0 (got ${n})`);
  if (p < 0 || p > 1) throw new InvalidInputError(`Binomial p must be in [0,1] (got ${p})`);

  const pmf = (k: number): number => {
    if (!Number.isInteger(k) || k < 0 || k > n) return 0;
    if (p === 0) return k === 0 ? 1 : 0; // avoid 0·ln0 = NaN
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  };
  return {
    name: "binomial",
    kind: "discrete",
    params: { n, p },
    mean: n * p,
    variance: n * p * (1 - p),
    support: { lo: 0, hi: n },
    pmf,
    cdf: (x) => {
      if (x < 0) return 0;
      const kMax = Math.min(n, Math.floor(x));
      let s = 0;
      for (let k = 0; k <= kMax; k++) s += pmf(k);
      return s;
    },
    // ponytail: sum of n Bernoulli draws — O(n) per sample, exact. For very large n a
    // BTPE/inversion sampler would be faster; add it only if n grows large in practice.
    sample: (rng) => {
      let count = 0;
      for (let i = 0; i < n; i++) if (rng.next() < p) count++;
      return count;
    },
  };
}

// ── Uniform(a, b) — continuous ───────────────────────────────────────────────
export function makeUniform(params: Record<string, number>): Distribution {
  const a = need(params, "a");
  const b = need(params, "b");
  if (!(a < b)) throw new InvalidInputError(`Uniform requires a < b (got a=${a}, b=${b})`);
  const width = b - a;
  return {
    name: "uniform",
    kind: "continuous",
    params: { a, b },
    mean: (a + b) / 2,
    variance: (width * width) / 12,
    support: { lo: a, hi: b },
    pdf: (x) => (x >= a && x <= b ? 1 / width : 0),
    cdf: (x) => (x < a ? 0 : x > b ? 1 : (x - a) / width),
    sample: (rng) => rngUniform(rng, a, b),
  };
}

// ── Normal(mu, sigma) — continuous ────────────────────────────────────────────
export function makeNormal(params: Record<string, number>): Distribution {
  const mu = need(params, "mu");
  const sigma = need(params, "sigma");
  if (sigma <= 0) throw new InvalidInputError(`Normal sigma must be > 0 (got ${sigma})`);
  return {
    name: "normal",
    kind: "continuous",
    params: { mu, sigma },
    mean: mu,
    variance: sigma * sigma,
    support: { lo: -Infinity, hi: Infinity },
    pdf: (x) => {
      const z = (x - mu) / sigma;
      return Math.exp(-0.5 * z * z) / (sigma * SQRT_2PI);
    },
    // Φ(x) = ½·erfc(−(x−μ)/(σ√2)). Accuracy inherits erf's ~1.5e-7 ceiling.
    cdf: (x) => 0.5 * erfc(-(x - mu) / (sigma * SQRT_2)),
    sample: (rng) => rngNormal(rng, mu, sigma),
  };
}

// ── Exponential(lambda) — continuous ─────────────────────────────────────────
export function makeExponential(params: Record<string, number>): Distribution {
  const lambda = need(params, "lambda");
  if (lambda <= 0) throw new InvalidInputError(`Exponential lambda must be > 0 (got ${lambda})`);
  return {
    name: "exponential",
    kind: "continuous",
    params: { lambda },
    mean: 1 / lambda,
    variance: 1 / (lambda * lambda),
    support: { lo: 0, hi: Infinity },
    pdf: (x) => (x < 0 ? 0 : lambda * Math.exp(-lambda * x)),
    cdf: (x) => (x < 0 ? 0 : 1 - Math.exp(-lambda * x)),
    // Inverse-CDF sampling: x = −ln(1−u)/λ. 1−next() ∈ (0,1] keeps the log finite.
    sample: (rng) => -Math.log(1 - rng.next()) / lambda,
  };
}

// ── Poisson(lambda) — discrete ────────────────────────────────────────────────
export function makePoisson(params: Record<string, number>): Distribution {
  const lambda = need(params, "lambda");
  if (lambda <= 0) throw new InvalidInputError(`Poisson lambda must be > 0 (got ${lambda})`);

  const pmf = (k: number): number => {
    if (!Number.isInteger(k) || k < 0) return 0;
    return Math.exp(k * Math.log(lambda) - lambda - logGamma(k + 1));
  };
  return {
    name: "poisson",
    kind: "discrete",
    params: { lambda },
    mean: lambda,
    variance: lambda,
    support: { lo: 0, hi: Infinity },
    pmf,
    cdf: (x) => {
      if (x < 0) return 0;
      const kMax = Math.floor(x);
      let s = 0;
      for (let k = 0; k <= kMax; k++) s += pmf(k);
      return s;
    },
    // Knuth's multiplication method: expected O(λ) draws. ponytail: exp(−λ) underflows to 0
    // for λ ≳ 745, which would loop forever — above that ceiling fall back to a rounded
    // Normal(λ, √λ) approximation (still seeded/reproducible). Upgrade path: a PTRS sampler
    // for exact large-λ draws if that regime ever matters.
    sample: (rng) => {
      const L = Math.exp(-lambda);
      if (L === 0) return Math.max(0, Math.round(rngNormal(rng, lambda, Math.sqrt(lambda))));
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= rng.next();
      } while (p > L);
      return k - 1;
    },
  };
}
