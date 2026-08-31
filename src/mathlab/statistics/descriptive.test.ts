// Descriptive statistics cross-checked against hand-computed values on known samples.
import { describe, it, expect } from "vitest";
import {
  mean, median, mode, variance, stdev, quantile, min, max, range,
  covariance, correlation, summary,
} from "./descriptive.ts";
import { DimensionError, InvalidInputError } from "../core/errors.ts";

// Canonical sample: mean 5, population var 4, sample var 32/7.
const S = [2, 4, 4, 4, 5, 5, 7, 9];

describe("central tendency", () => {
  it("mean/median/mode", () => {
    expect(mean(S)).toBe(5);
    expect(median(S)).toBe(4.5);            // even n → average of middle two (4,5)
    expect(mode(S)).toEqual([4]);           // 4 occurs 3×
    expect(median([1, 2, 3])).toBe(2);      // odd n
    expect(mode([1, 1, 2, 2, 3]).sort((a, b) => a - b)).toEqual([1, 2]); // multimodal
    expect(mode([1, 2, 3])).toEqual([1, 2, 3]); // all distinct → all modes
  });
});

describe("dispersion", () => {
  it("variance sample vs population; stdev", () => {
    expect(variance(S, false)).toBeCloseTo(4, 10);       // population
    expect(variance(S, true)).toBeCloseTo(32 / 7, 10);   // sample (default)
    expect(variance(S)).toBeCloseTo(32 / 7, 10);
    expect(stdev(S, false)).toBeCloseTo(2, 10);
  });
  it("min/max/range", () => {
    expect(min(S)).toBe(2); expect(max(S)).toBe(9); expect(range(S)).toBe(7);
  });
});

describe("quantiles (type-7)", () => {
  it("q0=min, q1=max, q.5=median, q1/q3 on S", () => {
    expect(quantile(S, 0)).toBe(2);
    expect(quantile(S, 1)).toBe(9);
    expect(quantile(S, 0.5)).toBe(median(S));
    expect(quantile(S, 0.25)).toBeCloseTo(4, 10);
    expect(quantile(S, 0.75)).toBeCloseTo(5.5, 10);
    expect(() => quantile(S, 1.5)).toThrow(InvalidInputError);
  });
});

describe("bivariate", () => {
  const x = [1, 2, 3, 4];
  it("correlation ±1 for exact linear relations; cov(x,x)=var(x)", () => {
    expect(correlation(x, [3, 5, 7, 9])).toBeCloseTo(1, 10);   // y = 2x+1
    expect(correlation(x, [9, 7, 5, 3])).toBeCloseTo(-1, 10);  // y = -2x+11
    expect(covariance(x, x)).toBeCloseTo(variance(x), 10);
    expect(Math.abs(correlation(x, [1, 0, 1, 0]))).toBeLessThan(1); // weak/none
  });
  it("length mismatch → DimensionError; zero-variance → InvalidInputError", () => {
    expect(() => covariance([1, 2], [1])).toThrow(DimensionError);
    expect(() => correlation([1, 2, 3], [5, 5, 5])).toThrow(InvalidInputError);
  });
});

describe("summary + empty guards", () => {
  it("summary fields", () => {
    const s = summary(S);
    expect(s.n).toBe(8);
    expect(s.mean).toBe(5);
    expect(s.median).toBe(4.5);
    expect(s.min).toBe(2); expect(s.max).toBe(9);
    expect(s.q1).toBeCloseTo(4, 10); expect(s.q3).toBeCloseTo(5.5, 10);
    expect(s.stdev).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });
  it("empty input throws", () => {
    expect(() => mean([])).toThrow(InvalidInputError);
    expect(() => median([])).toThrow(InvalidInputError);
    expect(() => variance([])).toThrow(InvalidInputError);
    expect(() => variance([5])).toThrow(InvalidInputError); // sample needs n≥2
  });
});
