// Primality / factorization / arithmetic-function tests (spec §69, §71).
// Factorization is checked by reconstruction (∏ prime^exp === n); primality is
// checked on named primes, a Carmichael number, and even/edge inputs.
import { describe, it, expect } from "vitest";
import {
  isPrime, factorize, divisors, eulerPhi, mobius, primesUpTo, collatz,
} from "./primes.ts";
import { InvalidInputError, ResourceLimitError } from "../core/errors.ts";

const product = (f: { prime: bigint; exponent: number }[]): bigint =>
  f.reduce((acc, { prime, exponent }) => acc * prime ** BigInt(exponent), 1n);

describe("isPrime", () => {
  it("small and edge cases", () => {
    expect([...Array(2).keys()].map((n) => isPrime(n))).toEqual([false, false]); // 0,1
    expect([2, 3, 5, 7, 11, 13].map((n) => isPrime(n))).toEqual([true, true, true, true, true, true]);
    expect([4, 6, 8, 9, 15].map((n) => isPrime(n))).toEqual([false, false, false, false, false]);
  });
  it("large primes: 2^31−1 and 1e9+7", () => {
    expect(isPrime(2147483647n)).toBe(true); // Mersenne M31
    expect(isPrime(1000000007n)).toBe(true);
    expect(isPrime(2147483647n - 2n)).toBe(false); // 2^31−3 = 5·... composite
  });
  it("Carmichael numbers are correctly composite (Fermat would be fooled)", () => {
    expect(isPrime(561n)).toBe(false); // 3·11·17
    expect(isPrime(41041n)).toBe(false); // Carmichael 7·11·13·41
  });
});

describe("factorize", () => {
  it("reconstructs n for semiprime, prime power, and mixed", () => {
    for (const n of [12n, 360n, 1000000007n, 2n ** 20n, 3n * 3n * 3n * 3n, 9973n * 9967n, 1n]) {
      expect(product(factorize(n))).toBe(n);
    }
  });
  it("shapes: prime power and semiprime", () => {
    expect(factorize(32n)).toEqual([{ prime: 2n, exponent: 5 }]);
    expect(factorize(15n)).toEqual([{ prime: 3n, exponent: 1 }, { prime: 5n, exponent: 1 }]);
    expect(factorize(1n)).toEqual([]);
  });
  it("rejects n < 1", () => {
    expect(() => factorize(0n)).toThrow(InvalidInputError);
    expect(() => factorize(-5n)).toThrow(InvalidInputError);
  });
});

describe("divisors", () => {
  it("sorted, and count = ∏(eᵢ+1)", () => {
    expect(divisors(12n)).toEqual([1n, 2n, 3n, 4n, 6n, 12n]); // 3·2 = 6 divisors
    expect(divisors(1n)).toEqual([1n]);
    for (const n of [36n, 100n, 97n, 360n]) {
      const expected = factorize(n).reduce((c, { exponent }) => c * (exponent + 1), 1);
      expect(divisors(n).length).toBe(expected);
    }
  });
});

describe("eulerPhi", () => {
  it("φ(p)=p−1, φ(p^k)=p^k−p^(k−1), φ(12)=4, φ(1)=1", () => {
    expect(eulerPhi(7n)).toBe(6n); // prime
    expect(eulerPhi(1000000007n)).toBe(1000000006n);
    expect(eulerPhi(8n)).toBe(4n); // 2^3 − 2^2
    expect(eulerPhi(27n)).toBe(18n); // 3^3 − 3^2
    expect(eulerPhi(12n)).toBe(4n);
    expect(eulerPhi(1n)).toBe(1n);
  });
});

describe("mobius", () => {
  it("μ(1)=1, μ(prime)=−1, μ(squareful)=0, μ(6)=1", () => {
    expect(mobius(1n)).toBe(1);
    expect(mobius(2n)).toBe(-1);
    expect(mobius(13n)).toBe(-1);
    expect(mobius(4n)).toBe(0); // 2^2
    expect(mobius(12n)).toBe(0); // 2^2·3
    expect(mobius(6n)).toBe(1); // 2·3, two distinct primes
    expect(mobius(30n)).toBe(-1); // 2·3·5, three distinct primes
  });
});

describe("primesUpTo", () => {
  it("sieve of Eratosthenes to 30", () => {
    expect(primesUpTo(30)).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
    expect(primesUpTo(1)).toEqual([]);
    expect(primesUpTo(2)).toEqual([2]);
  });
  it("π(100) = 25 and π(1000) = 168", () => {
    expect(primesUpTo(100).length).toBe(25);
    expect(primesUpTo(1000).length).toBe(168);
  });
  it("rejects bad input and over-cap limits", () => {
    expect(() => primesUpTo(-1)).toThrow(InvalidInputError);
    expect(() => primesUpTo(1.5)).toThrow(InvalidInputError);
    expect(() => primesUpTo(2e7)).toThrow(ResourceLimitError);
  });
});

describe("collatz", () => {
  it("6 → 1 in 8 steps with the exact sequence", () => {
    const { sequence, steps } = collatz(6n);
    expect(sequence).toEqual([6n, 3n, 10n, 5n, 16n, 8n, 4n, 2n, 1n]);
    expect(steps).toBe(8);
  });
  it("27 terminates at 1 in 111 steps", () => {
    const { sequence, steps } = collatz(27n);
    expect(sequence[sequence.length - 1]).toBe(1n);
    expect(steps).toBe(111);
  });
  it("1 is already terminal; n < 1 rejected", () => {
    expect(collatz(1n)).toEqual({ sequence: [1n], steps: 0 });
    expect(() => collatz(0n)).toThrow(InvalidInputError);
  });
});
