// Generic Monte Carlo estimation (spec §31). A trial maps a seeded Rng draw to a real value;
// the estimate is the sample mean, with a standard error and a 95% confidence interval. The
// estimate is NEVER exact — it is a random variable whose spread is `standardError`. All
// randomness routes through the seeded Rng (spec §29) so an estimate is fully replayable from
// its seed. Mean/variance are accumulated with Welford's algorithm for numerical stability.
import type { Rng } from "../core/rng.ts";
import { makeRng, uniform } from "../core/rng.ts";
import { InvalidInputError, ResourceLimitError } from "../core/errors.ts";
import { MAX_SAMPLES } from "../core/constants.ts";

export interface MonteCarloResult {
  estimate: number;
  standardError: number;   // sampleStd / √N — shrinks like 1/√N; NOT a hard error bound
  samples: number;
  seed: number;
  ci95: [number, number];  // estimate ± 1.96·standardError (asymptotic normal CI)
}

/**
 * Estimate E[trial(Rng)] over `samples` seeded draws. Throws InvalidInputError for a
 * non-positive/non-integer count and ResourceLimitError above MAX_SAMPLES.
 */
export function monteCarlo(
  trial: (rng: Rng) => number,
  opts: { samples: number; seed: number },
): MonteCarloResult {
  const { samples, seed } = opts;
  if (!Number.isInteger(samples) || samples <= 0) {
    throw new InvalidInputError(`Monte Carlo samples must be a positive integer (got ${samples})`);
  }
  if (samples > MAX_SAMPLES) {
    throw new ResourceLimitError(`Monte Carlo samples ${samples} exceeds MAX_SAMPLES ${MAX_SAMPLES}`);
  }
  const rng = makeRng(seed);
  let mean = 0;
  let m2 = 0;
  for (let i = 1; i <= samples; i++) {
    const x = trial(rng);
    const delta = x - mean;
    mean += delta / i;
    m2 += delta * (x - mean);
  }
  // sample variance (n−1); a single sample has undefined spread → SE 0.
  const variance = samples > 1 ? m2 / (samples - 1) : 0;
  const standardError = Math.sqrt(variance / samples);
  return {
    estimate: mean,
    standardError,
    samples,
    seed,
    ci95: [mean - 1.96 * standardError, mean + 1.96 * standardError],
  };
}

/**
 * Estimate π by the hit ratio of uniform points in [−1,1]² landing inside the unit disk
 * (each hit contributes 4, so the mean is 4·(π/4) = π). Result is an ESTIMATE, not π.
 */
export function estimatePi(samples: number, seed: number): MonteCarloResult {
  return monteCarlo((rng) => {
    const x = uniform(rng, -1, 1);
    const y = uniform(rng, -1, 1);
    return x * x + y * y <= 1 ? 4 : 0;
  }, { samples, seed });
}

/**
 * Mean-value Monte Carlo estimate of ∫_a^b f(x) dx = (b−a)·E[f(U)], U ~ Uniform(a,b).
 * Not exact; see standardError for the spread.
 */
export function estimateIntegral(
  f: (x: number) => number,
  a: number,
  b: number,
  samples: number,
  seed: number,
): MonteCarloResult {
  if (!(a < b)) throw new InvalidInputError(`estimateIntegral requires a < b (got a=${a}, b=${b})`);
  const width = b - a;
  return monteCarlo((rng) => width * f(uniform(rng, a, b)), { samples, seed });
}
