// Distribution registry + the six seed distributions. Cross-validated against closed-form
// moments and analytical cdf values; sampling checked for reproducibility (§29) and for
// convergence of sample statistics to the true moments (§70/§71).
import { describe, it, expect } from "vitest";
import { makeDistribution, DISTRIBUTIONS } from "./distribution.ts";
import { makeRng } from "../core/rng.ts";
import { InvalidInputError } from "../core/errors.ts";

const sampleN = (name: string, params: Record<string, number>, n: number, seed: number): number[] => {
  const d = makeDistribution(name, params);
  const rng = makeRng(seed);
  return Array.from({ length: n }, () => d.sample(rng));
};
const meanOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const varOf = (xs: number[]) => { const m = meanOf(xs); return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length; };

describe("distribution registry", () => {
  it("lists all six and rejects unknown names", () => {
    expect(Object.keys(DISTRIBUTIONS).sort()).toEqual(
      ["bernoulli", "binomial", "exponential", "normal", "poisson", "uniform"],
    );
    expect(() => makeDistribution("weibull", {})).toThrow(InvalidInputError);
  });
});

describe("closed-form moments", () => {
  const cases: [string, Record<string, number>, number, number][] = [
    ["bernoulli", { p: 0.3 }, 0.3, 0.21],
    ["binomial", { n: 10, p: 0.3 }, 3, 2.1],
    ["uniform", { a: 2, b: 8 }, 5, 3],
    ["normal", { mu: 1, sigma: 2 }, 1, 4],
    ["exponential", { lambda: 2 }, 0.5, 0.25],
    ["poisson", { lambda: 4 }, 4, 4],
  ];
  for (const [name, params, mean, variance] of cases) {
    it(`${name} mean/variance`, () => {
      const d = makeDistribution(name, params);
      expect(d.mean).toBeCloseTo(mean, 10);
      expect(d.variance).toBeCloseTo(variance, 10);
    });
  }
});

describe("pmf/pdf normalization (§71)", () => {
  it("discrete pmfs sum to 1", () => {
    const bino = makeDistribution("binomial", { n: 10, p: 0.37 });
    let s = 0; for (let k = 0; k <= 10; k++) s += bino.pmf!(k);
    expect(s).toBeCloseTo(1, 9);
    const pois = makeDistribution("poisson", { lambda: 3 });
    let sp = 0; for (let k = 0; k <= 60; k++) sp += pois.pmf!(k);
    expect(sp).toBeCloseTo(1, 8);
  });
  it("continuous pdfs integrate to ≈1 (coarse)", () => {
    const exp = makeDistribution("exponential", { lambda: 1 });
    let s = 0; const dx = 0.001; for (let x = 0; x < 30; x += dx) s += exp.pdf!(x + dx / 2) * dx;
    expect(s).toBeCloseTo(1, 2);
  });
});

describe("cdf at analytical points", () => {
  it("Normal Φ(0)=.5, Φ(1.96)≈.975, symmetry", () => {
    const z = makeDistribution("normal", { mu: 0, sigma: 1 });
    expect(z.cdf(0)).toBeCloseTo(0.5, 6);
    expect(z.cdf(1.96)).toBeCloseTo(0.975, 3);
    expect(z.cdf(-1)).toBeCloseTo(1 - z.cdf(1), 6);
    expect(z.cdf(1e9)).toBeCloseTo(1, 6);
  });
  it("Exponential cdf(mean)=1−e⁻¹; monotone in [0,1]", () => {
    const e = makeDistribution("exponential", { lambda: 2 });
    expect(e.cdf(0.5)).toBeCloseTo(1 - Math.exp(-1), 9);
    let prev = -1;
    for (let x = 0; x <= 5; x += 0.25) { const c = e.cdf(x); expect(c).toBeGreaterThanOrEqual(prev); expect(c).toBeLessThanOrEqual(1); prev = c; }
  });
});

describe("reproducible sampling (§29)", () => {
  it("same seed ⇒ identical sequence; different seed ⇒ differs", () => {
    for (const [name, params] of [["normal", { mu: 0, sigma: 1 }], ["poisson", { lambda: 5 }]] as const) {
      const a = sampleN(name, params, 200, 123);
      const b = sampleN(name, params, 200, 123);
      const c = sampleN(name, params, 200, 999);
      expect(a).toEqual(b);
      expect(a).not.toEqual(c);
    }
  });
});

describe("sample statistics converge to moments (§70)", () => {
  const N = 50000;
  const cases: [string, Record<string, number>][] = [
    ["normal", { mu: 1, sigma: 2 }],
    ["exponential", { lambda: 2 }],
    ["binomial", { n: 10, p: 0.3 }],
    ["poisson", { lambda: 4 }],
  ];
  for (const [name, params] of cases) {
    it(`${name} sample mean/var ≈ true`, () => {
      const d = makeDistribution(name, params);
      const xs = sampleN(name, params, N, 4242);
      expect(meanOf(xs)).toBeCloseTo(d.mean, 1);         // ~±0.05
      expect(varOf(xs)).toBeGreaterThan(d.variance * 0.9);
      expect(varOf(xs)).toBeLessThan(d.variance * 1.1);
    });
  }
});

describe("parameter validation", () => {
  it("rejects bad params", () => {
    expect(() => makeDistribution("normal", { mu: 0, sigma: 0 })).toThrow(InvalidInputError);
    expect(() => makeDistribution("binomial", { n: 5, p: 1.2 })).toThrow(InvalidInputError);
    expect(() => makeDistribution("exponential", { lambda: -1 })).toThrow(InvalidInputError);
    expect(() => makeDistribution("binomial", { n: 2.5, p: 0.5 })).toThrow(InvalidInputError);
  });
});
