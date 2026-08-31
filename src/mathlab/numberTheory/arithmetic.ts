// Exact integer arithmetic: the number-theory foundation (spec §34).
//
// WHY bigint everywhere. Every function here is exact by construction — gcd,
// modular exponentiation, modular inverse — the kind of value where a single
// float64 rounding step silently corrupts the answer (7^256 already overflows
// 2^53). So the entire number-theory domain is built on `bigint`, never float.
// There is no `number`-returning convenience here; the moment a result could be
// wrong it must be a bigint. Small-`number` conveniences appear only in primes.ts
// (`primesUpTo`) where the values are provably bounded and that boundary is
// documented at the call site.
//
// BOUNDARY POLICY (number | bigint in, bigint out). Public functions accept
// `number | bigint` for ergonomics — callers write `gcd(48, 18)` not
// `gcd(48n, 18n)` — but every argument is immediately coerced to bigint by
// `toBig`, which REJECTS anything that is not an exact integer (floats, NaN,
// Infinity) with InvalidInputError. A `number` is only ever a syntactic
// shorthand for an integer literal; it never introduces float semantics.
//
// Sign conventions:
//  • gcd / lcm return a NON-NEGATIVE result (the standard convention).
//  • extendedEuclid returns g ≥ 0 with a·x + b·y = g exactly.
//  • mod / modPow / modInverse return a canonical residue in [0, m).
import { InvalidInputError, DomainError } from "../core/errors.ts";

/** Public integer input: a bigint, or a `number` that is an exact integer. */
export type Integer = number | bigint;

/**
 * Coerce a public `Integer` argument to bigint. A `number` must be an exact
 * integer — non-integers, NaN and Infinity are rejected rather than truncated,
 * because a silently-floored argument is a wrong answer, not a convenience.
 */
export function toBig(x: Integer): bigint {
  if (typeof x === "bigint") return x;
  if (!Number.isInteger(x)) throw new InvalidInputError(`expected an integer, got ${x}`);
  return BigInt(x);
}

/** |x| for bigint. */
function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

/**
 * Always-non-negative modulo: the representative of `a mod m` in [0, |m|).
 * Unlike the native `%` (which follows the sign of the dividend, so
 * `-7n % 3n === -1n`), this returns 2n for mod(-7, 3). `m` must be non-zero.
 */
export function mod(aIn: Integer, mIn: Integer): bigint {
  const m = toBig(mIn);
  if (m === 0n) throw new InvalidInputError("mod: modulus must be non-zero");
  const n = abs(m);
  const r = toBig(aIn) % n;
  return r < 0n ? r + n : r;
}

/**
 * Greatest common divisor, non-negative. gcd(0, 0) = 0; gcd(0, b) = |b|.
 * Euclidean algorithm on absolute values.
 */
export function gcd(aIn: Integer, bIn: Integer): bigint {
  let a = abs(toBig(aIn));
  let b = abs(toBig(bIn));
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * Least common multiple, non-negative. lcm(a, 0) = 0 (the only multiple both
 * share). Computed as |a / gcd · b| to keep the intermediate product small.
 */
export function lcm(aIn: Integer, bIn: Integer): bigint {
  const a = toBig(aIn);
  const b = toBig(bIn);
  if (a === 0n || b === 0n) return 0n;
  return abs((a / gcd(a, b)) * b);
}

/**
 * Extended Euclidean algorithm: returns { g, x, y } with a·x + b·y = g and
 * g = gcd(a, b) ≥ 0. The Bézout coefficients let modInverse and CRT read the
 * cofactors directly. Iterative form (no recursion depth to blow).
 */
export function extendedEuclid(aIn: Integer, bIn: Integer): { g: bigint; x: bigint; y: bigint } {
  const a = toBig(aIn);
  const b = toBig(bIn);
  let [oldR, r] = [a, b];
  let [oldS, s] = [1n, 0n];
  let [oldT, t] = [0n, 1n];
  while (r !== 0n) {
    const q = oldR / r; // bigint division truncates toward zero — exact here
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
    [oldT, t] = [t, oldT - q * t];
  }
  // oldR is ±gcd; normalise to a non-negative g, negating the cofactors in step
  // so a·x + b·y = g is preserved.
  if (oldR < 0n) return { g: -oldR, x: -oldS, y: -oldT };
  return { g: oldR, x: oldS, y: oldT };
}

/**
 * Fast modular exponentiation: base^exp mod m, result in [0, m).
 * Square-and-multiply, so O(log exp) multiplications of bounded-size bigints —
 * the naive `base ** exp % m` would build an astronomically large integer first.
 * Requires exp ≥ 0 and m > 0 (else InvalidInputError). base may be negative; it
 * is reduced to its canonical residue first.
 */
export function modPow(baseIn: Integer, expIn: Integer, mIn: Integer): bigint {
  const m = toBig(mIn);
  if (m <= 0n) throw new InvalidInputError("modPow: modulus must be positive");
  let exp = toBig(expIn);
  if (exp < 0n) throw new InvalidInputError("modPow: exponent must be non-negative");
  if (m === 1n) return 0n; // everything ≡ 0 (mod 1)
  let result = 1n;
  let b = mod(baseIn, m);
  while (exp > 0n) {
    if (exp & 1n) result = (result * b) % m;
    b = (b * b) % m;
    exp >>= 1n;
  }
  return result;
}

/**
 * Modular multiplicative inverse: the a⁻¹ in [0, m) with a·a⁻¹ ≡ 1 (mod m).
 * Exists iff gcd(a, m) = 1; otherwise there is no inverse and this throws
 * DomainError. m must be positive (InvalidInputError otherwise). Found via the
 * Bézout x from extendedEuclid: a·x + m·y = 1 ⟹ a·x ≡ 1 (mod m).
 */
export function modInverse(aIn: Integer, mIn: Integer): bigint {
  const m = toBig(mIn);
  if (m <= 0n) throw new InvalidInputError("modInverse: modulus must be positive");
  const a = mod(aIn, m);
  const { g, x } = extendedEuclid(a, m);
  if (g !== 1n) {
    throw new DomainError(`modInverse: ${toBig(aIn)} is not invertible modulo ${m} (gcd = ${g})`);
  }
  return mod(x, m);
}
