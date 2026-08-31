// Exact integer arithmetic cross-checked against hand values and native bigint
// operators. modPow especially is checked against `base ** exp % mod` for the
// small cases where the naive form is still tractable.
import { describe, it, expect } from "vitest";
import { toBig, mod, gcd, lcm, extendedEuclid, modPow, modInverse } from "./arithmetic.ts";
import { InvalidInputError, DomainError } from "../core/errors.ts";

describe("gcd", () => {
  it("classic value, zero, and coprime cases", () => {
    expect(gcd(48, 18)).toBe(6n);
    expect(gcd(0, 5)).toBe(5n);
    expect(gcd(5, 0)).toBe(5n);
    expect(gcd(0, 0)).toBe(0n);
    expect(gcd(17, 5)).toBe(1n); // coprime
  });
  it("is non-negative regardless of input signs", () => {
    expect(gcd(-48, 18)).toBe(6n);
    expect(gcd(48, -18)).toBe(6n);
    expect(gcd(-48, -18)).toBe(6n);
  });
});

describe("lcm", () => {
  it("classic value, zero, and negative inputs", () => {
    expect(lcm(4, 6)).toBe(12n);
    expect(lcm(21, 6)).toBe(42n);
    expect(lcm(0, 5)).toBe(0n);
    expect(lcm(-4, 6)).toBe(12n); // non-negative result
  });
});

describe("extendedEuclid", () => {
  const pairs: Array<[bigint, bigint]> = [
    [48n, 18n], [240n, 46n], [17n, 5n], [-48n, 18n], [7n, -3n], [0n, 5n], [5n, 0n],
  ];
  it("satisfies a·x + b·y = g and g = gcd(a,b) ≥ 0 on every pair", () => {
    for (const [a, b] of pairs) {
      const { g, x, y } = extendedEuclid(a, b);
      expect(a * x + b * y).toBe(g);
      expect(g).toBe(gcd(a, b));
      expect(g >= 0n).toBe(true);
    }
  });
});

describe("mod", () => {
  it("returns a non-negative residue for negative operands", () => {
    expect(mod(7, 3)).toBe(1n);
    expect(mod(-7, 3)).toBe(2n); // native -7n % 3n would be -1n
    expect(mod(-1, 5)).toBe(4n);
    expect(mod(10, 5)).toBe(0n);
  });
  it("rejects a zero modulus", () => {
    expect(() => mod(5, 0)).toThrow(InvalidInputError);
  });
});

describe("modPow", () => {
  it("matches naive base**exp % mod on small cases", () => {
    for (const [b, e, m] of [[3n, 4n, 7n], [10n, 5n, 13n], [2n, 10n, 1000n], [5n, 0n, 7n]] as const) {
      expect(modPow(b, e, m)).toBe((b ** e) % m);
    }
  });
  it("handles a large modular exponentiation (7^256 mod 13)", () => {
    expect(modPow(7, 256, 13)).toBe((7n ** 256n) % 13n);
    expect(modPow(2, 1000, 97)).toBe((2n ** 1000n) % 97n);
  });
  it("reduces negative bases and returns [0, m)", () => {
    expect(modPow(-2, 3, 5)).toBe(mod(-8, 5)); // 2n
    expect(modPow(5, 3, 1)).toBe(0n); // everything ≡ 0 (mod 1)
  });
  it("rejects non-positive modulus and negative exponent", () => {
    expect(() => modPow(2, 3, 0)).toThrow(InvalidInputError);
    expect(() => modPow(2, 3, -5)).toThrow(InvalidInputError);
    expect(() => modPow(2, -3, 5)).toThrow(InvalidInputError);
  });
});

describe("modInverse", () => {
  it("a·a⁻¹ ≡ 1 (mod m) for coprime pairs", () => {
    for (const [a, m] of [[3n, 11n], [7n, 26n], [10n, 17n], [123n, 4567n]] as const) {
      const inv = modInverse(a, m);
      expect(mod(a * inv, m)).toBe(1n);
      expect(inv >= 0n && inv < m).toBe(true);
    }
  });
  it("throws DomainError when gcd(a, m) ≠ 1", () => {
    expect(() => modInverse(4, 8)).toThrow(DomainError); // gcd 4
    expect(() => modInverse(6, 9)).toThrow(DomainError); // gcd 3
  });
  it("rejects a non-positive modulus", () => {
    expect(() => modInverse(3, 0)).toThrow(InvalidInputError);
  });
});

describe("integer coercion boundary", () => {
  it("accepts integer numbers and bigints alike", () => {
    expect(toBig(42)).toBe(42n);
    expect(toBig(42n)).toBe(42n);
    expect(gcd(48n, 18)).toBe(6n); // mixed
  });
  it("rejects non-integer floats, NaN and Infinity", () => {
    expect(() => toBig(4.5)).toThrow(InvalidInputError);
    expect(() => gcd(1.5, 2)).toThrow(InvalidInputError);
    expect(() => toBig(NaN)).toThrow(InvalidInputError);
    expect(() => toBig(Infinity)).toThrow(InvalidInputError);
  });
});
