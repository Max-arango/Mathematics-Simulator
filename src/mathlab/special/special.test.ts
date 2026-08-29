import { describe, it, expect } from "vitest";
import { logGamma, gamma } from "./gamma.ts";
import { erf, erfc } from "./erf.ts";
import { DomainError } from "../core/errors.ts";

// ln((n−1)!) computed exactly (small n) as the cross-check reference for logGamma.
const lnFactorial = (m: number): number => {
  let s = 0;
  for (let k = 2; k <= m; k++) s += Math.log(k);
  return s;
};

describe("logGamma — Lanczos, ~1e-14 for x>0 (spec §39)", () => {
  it("logGamma(n) = ln((n−1)!) for n = 1..10", () => {
    for (let n = 1; n <= 10; n++) {
      expect(logGamma(n)).toBeCloseTo(lnFactorial(n - 1), 10);
    }
  });

  it("logGamma(0.5) = ln(√π)", () => {
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
  });

  it("stays accurate for large x (logGamma(100) vs ln(99!))", () => {
    // Relative accuracy ~1e-14: absolute error on a value ~359 stays ~1e-12.
    expect(logGamma(100)).toBeCloseTo(lnFactorial(99), 9);
  });

  it("throws DomainError for x ≤ 0", () => {
    expect(() => logGamma(0)).toThrow(DomainError);
    expect(() => logGamma(-1)).toThrow(DomainError);
  });
});

describe("gamma", () => {
  it("gamma(0.5) = √π", () => expect(gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 12));
  it("gamma(1) = 1", () => expect(gamma(1)).toBeCloseTo(1, 12));
  it("gamma(5) = 4! = 24", () => expect(gamma(5)).toBeCloseTo(24, 10));
  it("gamma(6) = 5! = 120", () => expect(gamma(6)).toBeCloseTo(120, 9));

  it("reflection: gamma(−0.5) = −2√π", () => {
    expect(gamma(-0.5)).toBeCloseTo(-2 * Math.sqrt(Math.PI), 10);
  });

  it("poles at non-positive integers throw DomainError", () => {
    expect(() => gamma(0)).toThrow(DomainError);
    expect(() => gamma(-2)).toThrow(DomainError);
  });
});

describe("erf / erfc — A&S 7.1.26, |error| ≤ 1.5e-7 (accuracy ceiling)", () => {
  it("erf(0) = 0", () => expect(erf(0)).toBe(0));

  it("erf saturates: erf(6) ≈ 1", () => expect(erf(6)).toBeCloseTo(1, 6));

  it("erf(1) ≈ 0.8427007 within the stated 1.5e-7", () => {
    const reference = 0.8427007929497149; // true erf(1)
    expect(Math.abs(erf(1) - reference)).toBeLessThanOrEqual(1.5e-7);
    expect(erf(1)).toBeCloseTo(0.8427007, 6);
  });

  it("odd symmetry erf(−x) = −erf(x)", () => {
    for (const x of [0.3, 1, 2.5]) expect(erf(-x)).toBeCloseTo(-erf(x), 12);
  });

  it("erfc(x) = 1 − erf(x)", () => {
    for (const x of [-2, -0.5, 0, 0.5, 2]) expect(erfc(x)).toBeCloseTo(1 - erf(x), 12);
  });

  it("erfc(0) = 1", () => expect(erfc(0)).toBeCloseTo(1, 12));
});
