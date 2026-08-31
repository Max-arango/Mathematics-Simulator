// Regression fits cross-checked against exact analytical models and known coefficients.
import { describe, it, expect } from "vitest";
import { linearRegression, polynomialRegression } from "./regression.ts";
import { DimensionError, InvalidInputError, NumericalInstabilityError } from "../core/errors.ts";

describe("linearRegression", () => {
  it("recovers an exact line y = 3x + 2 with R²=1", () => {
    const x = [0, 1, 2, 3, 4];
    const y = x.map((xi) => 3 * xi + 2);
    const f = linearRegression(x, y);
    expect(f.slope).toBeCloseTo(3, 9);
    expect(f.intercept).toBeCloseTo(2, 9);
    expect(f.r2).toBeCloseTo(1, 9);
    for (const r of f.residuals) expect(Math.abs(r)).toBeLessThan(1e-9);
    expect(f.predict(10)).toBeCloseTo(32, 9);
  });

  it("fits noisy data with 0 < R² < 1 and a slope near truth", () => {
    const x = [1, 2, 3, 4, 5, 6];
    const y = [2.1, 3.9, 6.2, 7.8, 10.1, 11.9]; // ≈ 2x
    const f = linearRegression(x, y);
    expect(f.slope).toBeGreaterThan(1.8);
    expect(f.slope).toBeLessThan(2.2);
    expect(f.r2).toBeGreaterThan(0.99);
    expect(f.r2).toBeLessThanOrEqual(1);
  });

  it("constant y → slope 0, R²=1 (SS_tot=0 exact-fit convention)", () => {
    const f = linearRegression([1, 2, 3], [5, 5, 5]);
    expect(f.slope).toBeCloseTo(0, 9);
    expect(f.intercept).toBeCloseTo(5, 9);
    expect(f.r2).toBe(1);
  });
});

describe("polynomialRegression", () => {
  it("recovers y = x² − 2x + 1 (coeffs ascending [1,−2,1], R²=1)", () => {
    const x = [0, 1, 2, 3, 4];
    const y = x.map((xi) => xi * xi - 2 * xi + 1);
    const f = polynomialRegression(x, y, 2);
    expect(f.coefficients[0]).toBeCloseTo(1, 8);
    expect(f.coefficients[1]).toBeCloseTo(-2, 8);
    expect(f.coefficients[2]).toBeCloseTo(1, 8);
    expect(f.r2).toBeCloseTo(1, 9);
    expect(f.predict(5)).toBeCloseTo(16, 7); // 25-10+1
  });

  it("degree-1 polynomial matches linearRegression", () => {
    const x = [1, 2, 3, 4], y = [2.2, 4.1, 5.9, 8.1];
    const p = polynomialRegression(x, y, 1);
    const l = linearRegression(x, y);
    expect(p.coefficients[0]).toBeCloseTo(l.intercept, 9);
    expect(p.coefficients[1]).toBeCloseTo(l.slope, 9);
  });

  it("guards: mismatch, bad degree, too few points, collinear x", () => {
    expect(() => linearRegression([1, 2], [1])).toThrow(DimensionError);
    expect(() => polynomialRegression([1, 2, 3], [1, 2, 3], 0)).toThrow(InvalidInputError);
    expect(() => polynomialRegression([1, 2], [1, 2], 3)).toThrow(InvalidInputError);
    // all x identical → rank-deficient design matrix
    expect(() => linearRegression([2, 2, 2], [1, 2, 3])).toThrow(NumericalInstabilityError);
  });
});
