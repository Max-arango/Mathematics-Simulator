// Monte Carlo: estimates are random variables (seeded ⇒ reproducible), never exact.
import { describe, it, expect } from "vitest";
import { monteCarlo, estimatePi, estimateIntegral } from "./monteCarlo.ts";
import { InvalidInputError, ResourceLimitError } from "../core/errors.ts";

describe("estimatePi", () => {
  it("approaches π and is reproducible from its seed", () => {
    const r = estimatePi(400_000, 12345);
    expect(Math.abs(r.estimate - Math.PI)).toBeLessThan(0.02);
    expect(r.standardError).toBeGreaterThan(0);
    // true value lies within a few standard errors
    expect(Math.abs(r.estimate - Math.PI)).toBeLessThan(4 * r.standardError);
    // reproducible
    expect(estimatePi(400_000, 12345).estimate).toBe(r.estimate);
    // different seed ⇒ different estimate
    expect(estimatePi(400_000, 6789).estimate).not.toBe(r.estimate);
  });
});

describe("estimateIntegral", () => {
  it("∫₀¹ x² dx ≈ 1/3 and ∫₀^π sin ≈ 2", () => {
    expect(estimateIntegral((x) => x * x, 0, 1, 200_000, 7).estimate).toBeCloseTo(1 / 3, 2);
    expect(estimateIntegral(Math.sin, 0, Math.PI, 200_000, 7).estimate).toBeCloseTo(2, 1);
  });
  it("requires a < b", () => {
    expect(() => estimateIntegral((x) => x, 1, 0, 100, 1)).toThrow(InvalidInputError);
  });
});

describe("standard error", () => {
  it("shrinks like 1/√N (4× samples ⇒ ≈½ SE)", () => {
    const seN = estimatePi(20_000, 55).standardError;
    const se4N = estimatePi(80_000, 55).standardError;
    expect(seN / se4N).toBeGreaterThan(1.5);
    expect(seN / se4N).toBeLessThan(2.5);
  });
  it("ci95 is estimate ± 1.96·SE", () => {
    const r = estimatePi(50_000, 3);
    expect(r.ci95[0]).toBeCloseTo(r.estimate - 1.96 * r.standardError, 12);
    expect(r.ci95[1]).toBeCloseTo(r.estimate + 1.96 * r.standardError, 12);
  });
});

describe("guards", () => {
  it("rejects non-positive and over-cap sample counts", () => {
    expect(() => monteCarlo(() => 1, { samples: 0, seed: 1 })).toThrow(InvalidInputError);
    expect(() => monteCarlo(() => 1, { samples: 2.5, seed: 1 })).toThrow(InvalidInputError);
    expect(() => monteCarlo(() => 1, { samples: 10_000_001, seed: 1 })).toThrow(ResourceLimitError);
  });
  it("estimates a known mean exactly for a constant trial", () => {
    const r = monteCarlo(() => 7, { samples: 1000, seed: 1 });
    expect(r.estimate).toBeCloseTo(7, 12);
    expect(r.standardError).toBeCloseTo(0, 12);
  });
});
