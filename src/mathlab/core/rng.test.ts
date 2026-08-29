import { describe, it, expect } from "vitest";
import { makeRng, mulberry32, uniform, int, normal } from "./rng.ts";

const take = (fn: () => number, n: number) => Array.from({ length: n }, fn);

describe("rng reproducibility contract (spec §29)", () => {
  it("same seed => identical first-N sequence", () => {
    const a = take(mulberry32(12345), 50);
    const b = take(mulberry32(12345), 50);
    expect(a).toEqual(b);
  });

  it("different seeds => sequences differ", () => {
    const a = take(mulberry32(1), 50);
    const b = take(mulberry32(2), 50);
    expect(a).not.toEqual(b);
  });

  it("makeRng wraps the same sequence as mulberry32", () => {
    const rng = makeRng(777);
    const raw = mulberry32(777);
    expect(take(() => rng.next(), 20)).toEqual(take(raw, 20));
  });
});

describe("uniform / int ranges", () => {
  it("uniform stays within [a, b)", () => {
    const rng = makeRng(42);
    for (let i = 0; i < 10000; i++) {
      const x = uniform(rng, -3, 5);
      expect(x).toBeGreaterThanOrEqual(-3);
      expect(x).toBeLessThan(5);
    }
  });

  it("int stays within [lo, hi] inclusive and covers both ends", () => {
    const rng = makeRng(99);
    let sawLo = false;
    let sawHi = false;
    for (let i = 0; i < 10000; i++) {
      const n = int(rng, 1, 6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
      if (n === 1) sawLo = true;
      if (n === 6) sawHi = true;
    }
    expect(sawLo && sawHi).toBe(true);
  });
});

describe("normal via Box–Muller", () => {
  it("fixed seed: sample mean/sd track the requested parameters", () => {
    const rng = makeRng(2024);
    const N = 20000;
    const mean = 5;
    const sd = 2;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      const x = normal(rng, mean, sd);
      sum += x;
      sumSq += x * x;
    }
    const m = sum / N;
    const variance = sumSq / N - m * m;
    const s = Math.sqrt(variance);
    // digits=1 => |diff| < 0.05, matching the ±0.05 tolerance in the spec.
    expect(m).toBeCloseTo(mean, 1);
    expect(s).toBeCloseTo(sd, 1);
  });
});
