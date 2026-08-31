import { describe, it, expect } from "vitest";
import { C, mul, neg, div, type Complex } from "./complex.ts";
import { parseComplexFn } from "./complexEval.ts";
import { complexDerivative, cauchyRiemann, isHolomorphicAt } from "./holomorphy.ts";

const near = (a: Complex, b: Complex, tol = 1e-5) => {
  const d = Math.round(-Math.log10(tol));
  expect(a.re).toBeCloseTo(b.re, d);
  expect(a.im).toBeCloseTo(b.im, d);
};

const pts: Complex[] = [C(1, 0), C(0, 1), C(1, 1), C(-2, 3), C(0.5, -0.75)];

const sq = parseComplexFn("z^2");
const cexp = parseComplexFn("exp(z)");
const inv = parseComplexFn("1/z");
const cconj = parseComplexFn("conj(z)");
const absSq = parseComplexFn("z * conj(z)"); // |z|²

describe("complexDerivative — cross-checked vs analytic derivative", () => {
  it("d/dz z² = 2z", () => {
    for (const z of pts) near(complexDerivative(sq, z), mul(C(2, 0), z));
  });
  it("d/dz exp(z) = exp(z)", () => {
    for (const z of pts) near(complexDerivative(cexp, z), cexp(z));
  });
  it("d/dz (1/z) = −1/z² (z≠0)", () => {
    for (const z of pts) near(complexDerivative(inv, z), neg(div(C(1, 0), mul(z, z))));
  });
});

describe("cauchyRiemann — holomorphic functions satisfy CR", () => {
  it("z² satisfies at every sample point", () => {
    for (const z of pts) expect(cauchyRiemann(sq, z).satisfies).toBe(true);
  });
  it("exp(z) satisfies at every sample point", () => {
    for (const z of pts) expect(cauchyRiemann(cexp, z).satisfies).toBe(true);
  });
  it("1/z satisfies away from the pole", () => {
    for (const z of pts) expect(cauchyRiemann(inv, z).satisfies).toBe(true);
  });
  it("reports the four partials for f(z)=z (u_x=v_y=1, u_y=v_x=0)", () => {
    const cr = cauchyRiemann(parseComplexFn("z"), C(2, -3));
    expect(cr.u_x).toBeCloseTo(1, 6);
    expect(cr.v_y).toBeCloseTo(1, 6);
    expect(cr.u_y).toBeCloseTo(0, 6);
    expect(cr.v_x).toBeCloseTo(0, 6);
    expect(cr.satisfies).toBe(true);
  });
});

describe("cauchyRiemann — the honesty tests (non-holomorphic)", () => {
  it("conj(z) does NOT satisfy CR (large residual)", () => {
    for (const z of pts) {
      const cr = cauchyRiemann(cconj, z);
      expect(cr.satisfies).toBe(false);
      expect(cr.residual).toBeGreaterThan(1); // ≈2: u_x=1, v_y=−1
    }
  });
  it("conj(z): complexDerivative returns the real-direction quotient (≈1) despite non-holomorphy", () => {
    // Demonstrates why the difference quotient alone is misleading; CR is the honest check.
    near(complexDerivative(cconj, C(2, -3)), C(1, 0));
    expect(isHolomorphicAt(cconj, C(2, -3))).toBe(false);
  });
  it("|z|² = z·conj(z) is non-holomorphic at nonzero points", () => {
    expect(isHolomorphicAt(absSq, C(2, 1))).toBe(false);
    expect(cauchyRiemann(absSq, C(2, 1)).residual).toBeGreaterThan(1);
  });
  it("|z|² IS complex-differentiable ONLY at the origin (CR holds there)", () => {
    expect(isHolomorphicAt(absSq, C(0, 0))).toBe(true);
  });
});

describe("isHolomorphicAt — convenience", () => {
  it("true for exp, false for conj", () => {
    expect(isHolomorphicAt(cexp, C(1, 1))).toBe(true);
    expect(isHolomorphicAt(cconj, C(1, 1))).toBe(false);
  });
  it("honors a custom step h", () => {
    expect(isHolomorphicAt(sq, C(1, 1), 1e-5)).toBe(true);
    expect(isHolomorphicAt(cconj, C(1, 1), 1e-5)).toBe(false);
  });
});
