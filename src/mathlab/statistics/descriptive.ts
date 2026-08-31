// Descriptive statistics (spec §71): closed-form summaries of a single column
// (`number[]`) plus the two bivariate measures (covariance, Pearson correlation).
// These are the building blocks the regression and visualization domains sit on top
// of, so they are plain free functions over arrays — no Dataset coupling here; callers
// pull a column with statistics/dataset `column(ds, name)` and pass the array in.
//
// Conventions used throughout:
//  • Any statistic that is undefined on its input throws InvalidInputError rather than
//    returning NaN — empty data everywhere, and additionally n < 2 for the SAMPLE
//    variance/stdev/covariance (the n−1 denominator is 0) and for correlation.
//  • variance/stdev/covariance default to the SAMPLE estimator (Bessel's n−1
//    correction); pass sample=false for the POPULATION estimator (divide by n).
//  • quantile uses linear interpolation between order statistics — the type-7 / R
//    default (also NumPy's default): h = (n−1)·q, interpolate between sorted[⌊h⌋] and
//    sorted[⌈h⌉]. Hence quantile(0)=min, quantile(1)=max, quantile(0.5)=median (and,
//    for even n, the average of the two middle values).
import { DimensionError, InvalidInputError } from "../core/errors.ts";
import { EPSILON } from "../core/constants.ts";

/** Throw InvalidInputError if the sample is empty (a mean/median/… of nothing is undefined). */
function nonEmpty(xs: number[], stat: string): void {
  if (xs.length === 0) throw new InvalidInputError(`${stat} of an empty array is undefined`);
}

export function mean(xs: number[]): number {
  nonEmpty(xs, "mean");
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Middle value; the average of the two middle values when the length is even. */
export function median(xs: number[]): number {
  nonEmpty(xs, "median");
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * All values tied for the highest frequency, sorted ascending. When every value is
 * distinct they all share frequency 1, so mode returns the whole (deduplicated,
 * sorted) sample — i.e. "no mode" surfaces as "every value is a mode", not an error.
 */
export function mode(xs: number[]): number[] {
  nonEmpty(xs, "mode");
  const counts = new Map<number, number>();
  let best = 0;
  for (const x of xs) {
    const c = (counts.get(x) ?? 0) + 1;
    counts.set(x, c);
    if (c > best) best = c;
  }
  const modes: number[] = [];
  for (const [value, c] of counts) if (c === best) modes.push(value);
  return modes.sort((a, b) => a - b);
}

/** Sample (n−1) variance by default; population (n) when sample=false. n<2 undefined for sample. */
export function variance(xs: number[], sample = true): number {
  nonEmpty(xs, "variance");
  const n = xs.length;
  const denom = sample ? n - 1 : n;
  if (denom <= 0) throw new InvalidInputError("sample variance needs at least 2 values");
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / denom;
}

/** Square root of variance; same sample/population convention and guards. */
export function stdev(xs: number[], sample = true): number {
  return Math.sqrt(variance(xs, sample));
}

/** q-quantile, q ∈ [0,1], via type-7 linear interpolation (see file header). */
export function quantile(xs: number[], q: number): number {
  nonEmpty(xs, "quantile");
  if (!Number.isFinite(q) || q < 0 || q > 1) throw new InvalidInputError(`quantile q must be in [0,1] (got ${q})`);
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

export function min(xs: number[]): number {
  nonEmpty(xs, "min");
  return Math.min(...xs);
}

export function max(xs: number[]): number {
  nonEmpty(xs, "max");
  return Math.max(...xs);
}

/** max − min (spread of the sample). */
export function range(xs: number[]): number {
  return max(xs) - min(xs);
}

/** Sample (n−1) covariance by default; population (n) when sample=false. */
export function covariance(xs: number[], ys: number[], sample = true): number {
  if (xs.length !== ys.length) throw new DimensionError(`covariance needs equal lengths (${xs.length} vs ${ys.length})`);
  nonEmpty(xs, "covariance");
  const n = xs.length;
  const denom = sample ? n - 1 : n;
  if (denom <= 0) throw new InvalidInputError("sample covariance needs at least 2 values");
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / denom;
}

/**
 * Pearson correlation coefficient r ∈ [−1,1] (clamped against float overshoot). The
 * n−1 vs n factor cancels in the ratio, so no sample/population flag. Undefined — and
 * therefore an InvalidInputError — when either variable has (near-)zero variance.
 */
export function correlation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length) throw new DimensionError(`correlation needs equal lengths (${xs.length} vs ${ys.length})`);
  nonEmpty(xs, "correlation");
  const n = xs.length;
  if (n < 2) throw new InvalidInputError("correlation needs at least 2 values");
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  if (denom < EPSILON) throw new InvalidInputError("correlation undefined: a variable has zero variance");
  return Math.max(-1, Math.min(1, sxy / denom));
}

export interface Summary {
  n: number;
  mean: number;
  median: number;
  stdev: number; // sample
  min: number;
  max: number;
  q1: number; // 25th percentile
  q3: number; // 75th percentile
}

/** Five-number-summary-plus: n, mean, median, sample stdev, min, max, q1, q3. Needs n ≥ 2 (sample stdev). */
export function summary(xs: number[]): Summary {
  nonEmpty(xs, "summary");
  return {
    n: xs.length,
    mean: mean(xs),
    median: median(xs),
    stdev: stdev(xs),
    min: min(xs),
    max: max(xs),
    q1: quantile(xs, 0.25),
    q3: quantile(xs, 0.75),
  };
}
