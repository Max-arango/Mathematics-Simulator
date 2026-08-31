// Primality, factorization and the classic multiplicative-number-theory
// functions (spec §34, §69, §71). Built on arithmetic.ts — the exact bigint
// modPow/gcd — so every result here is exact. The same boundary policy applies:
// public functions accept `number | bigint` (an `Integer`), each argument is
// coerced by `toBig` which rejects non-integer floats; the sole `number` API is
// `primesUpTo`, whose range is bounded and documented below.
//
// ── isPrime: DETERMINISTIC Miller–Rabin ────────────────────────────────────
// Miller–Rabin is only probabilistic with random bases, but with a fixed set of
// witnesses it is a PROOF below a known bound. Using the first twelve primes
//   {2,3,5,7,11,13,17,19,23,29,31,37}
// as witnesses is deterministic (no false positives) for every
//   n < 3,317,044,064,679,887,385,961,981  ≈ 3.317 × 10²⁴
// (Sorenson–Webster). Above that bound the result is still almost-certainly
// correct but no longer a proof — documented as the honest ceiling. All of this
// domain's other functions call isPrime only on values far below it.
//
// ── factorize: trial division + Pollard's rho ──────────────────────────────
// Small prime factors are stripped by trial division (primes < 1000); whatever
// remains is split with Pollard's rho (Floyd cycle, retry on differing c) down
// to primes verified by isPrime. Expected O(n¹ᐟ⁴) per factor. PRACTICAL CEILING:
// this comfortably factors integers up to ~10¹⁸–10²⁰ and any number with a small
// or medium largest prime factor; it is NOT a subexponential (GNFS/quadratic
// sieve) factorizer, so a hard semiprime of two ~30-digit primes is out of reach.
// For every input in range the product of the returned prime^exp equals n exactly.
import { InvalidInputError, ResourceLimitError } from "../core/errors.ts";
import { toBig, modPow, gcd, type Integer } from "./arithmetic.ts";

/** Deterministic Miller–Rabin witnesses: the first twelve primes. */
const MR_WITNESSES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n] as const;

/** Upper bound on `primesUpTo` — a 10⁷ sieve is a ~10 MB byte array, still cheap. */
export const PRIMES_UP_TO_MAX = 10_000_000;

// Declared before SMALL_PRIMES because that const calls primesUpTo() at module-eval
// time, and primesUpTo reads PRIMES_UP_TO_MAX (avoids a temporal-dead-zone error).

/** Small primes stripped by trial division before Pollard's rho takes over. */
const SMALL_PRIMES: bigint[] = primesUpTo(1000).map(BigInt);

/** One Miller–Rabin round: does base `a` witness that odd `n` is composite? */
function mrProbablePrime(n: bigint, a: bigint, d: bigint, r: number): boolean {
  let x = modPow(a, d, n);
  if (x === 1n || x === n - 1n) return true;
  for (let i = 1; i < r; i++) {
    x = (x * x) % n;
    if (x === n - 1n) return true;
  }
  return false; // a proves n composite
}

/**
 * Deterministic primality test (see file header for the proven bound).
 * Handles n < 2, small primes and even numbers before the Miller–Rabin rounds.
 */
export function isPrime(nIn: Integer): boolean {
  const n = toBig(nIn);
  if (n < 2n) return false;
  for (const p of MR_WITNESSES) {
    if (n === p) return true;
    if (n % p === 0n) return false; // small factor ⟹ composite (also catches evens)
  }
  // write n − 1 = d · 2^r with d odd
  let d = n - 1n;
  let r = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    r++;
  }
  for (const a of MR_WITNESSES) {
    if (!mrProbablePrime(n, a, d, r)) return false;
  }
  return true;
}

/** Pollard's rho: returns a non-trivial factor of composite, odd `n`. */
function pollardRho(n: bigint): bigint {
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; ; c++) {
    let x = 2n;
    let y = 2n;
    let d = 1n;
    const f = (v: bigint): bigint => (v * v + c) % n;
    while (d === 1n) {
      x = f(x);
      y = f(f(y));
      d = gcd(x - y, n); // gcd abs's its argument
    }
    if (d !== n) return d; // success
    // d === n: this c cycled without splitting — try the next polynomial
  }
}

/** Recursively split `n` into primes, accumulating multiplicities into `add`. */
function factorRho(n: bigint, add: (p: bigint) => void): void {
  if (n === 1n) return;
  if (isPrime(n)) {
    add(n);
    return;
  }
  const d = pollardRho(n);
  factorRho(d, add);
  factorRho(n / d, add);
}

/**
 * Prime factorization as ascending { prime, exponent } pairs. n must be ≥ 1
 * (InvalidInputError otherwise); factorize(1) = [] (empty product = 1). The
 * product of prime^exponent over the result reconstructs n exactly.
 */
export function factorize(nIn: Integer): { prime: bigint; exponent: number }[] {
  let n = toBig(nIn);
  if (n < 1n) throw new InvalidInputError("factorize: n must be a positive integer");
  const counts = new Map<bigint, number>();
  const add = (p: bigint) => counts.set(p, (counts.get(p) ?? 0) + 1);
  for (const p of SMALL_PRIMES) {
    if (p * p > n) break; // remaining n is 1 or prime
    while (n % p === 0n) {
      add(p);
      n /= p;
    }
  }
  factorRho(n, add);
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([prime, exponent]) => ({ prime, exponent }));
}

/**
 * All positive divisors of n, sorted ascending. n ≥ 1 (InvalidInputError
 * otherwise). Built multiplicatively from the factorization, so the count is
 * ∏(eᵢ + 1).
 */
export function divisors(nIn: Integer): bigint[] {
  const n = toBig(nIn);
  if (n < 1n) throw new InvalidInputError("divisors: n must be a positive integer");
  let divs = [1n];
  for (const { prime, exponent } of factorize(n)) {
    const base = [...divs];
    let pk = 1n;
    for (let e = 1; e <= exponent; e++) {
      pk *= prime;
      for (const d of base) divs.push(d * pk);
    }
  }
  return divs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Euler's totient φ(n): the count of integers in [1, n] coprime to n. Computed
 * from the factorization as ∏ p^(e−1)·(p−1). φ(1) = 1. n ≥ 1 required.
 */
export function eulerPhi(nIn: Integer): bigint {
  const n = toBig(nIn);
  if (n < 1n) throw new InvalidInputError("eulerPhi: n must be a positive integer");
  let result = 1n;
  for (const { prime, exponent } of factorize(n)) {
    result *= (prime - 1n) * prime ** BigInt(exponent - 1);
  }
  return result;
}

/**
 * Möbius function μ(n): 0 if n is divisible by a square (any exponent ≥ 2),
 * else (−1)^k for k distinct prime factors. μ(1) = 1. n ≥ 1 required.
 */
export function mobius(nIn: Integer): -1 | 0 | 1 {
  const n = toBig(nIn);
  if (n < 1n) throw new InvalidInputError("mobius: n must be a positive integer");
  const f = factorize(n);
  for (const { exponent } of f) if (exponent >= 2) return 0; // squareful
  return f.length % 2 === 0 ? 1 : -1;
}

/**
 * Sieve of Eratosthenes: all primes ≤ limit as `number`s. This is the domain's
 * one `number` API — safe because primes and index arithmetic stay well under
 * 2⁵³ for any limit ≤ PRIMES_UP_TO_MAX. `limit` must be a non-negative integer;
 * above the cap it throws ResourceLimitError (the sieve would allocate too much).
 */
export function primesUpTo(limit: number): number[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new InvalidInputError("primesUpTo: limit must be a non-negative integer");
  }
  if (limit > PRIMES_UP_TO_MAX) {
    throw new ResourceLimitError(`primesUpTo: limit ${limit} exceeds cap ${PRIMES_UP_TO_MAX}`);
  }
  if (limit < 2) return [];
  const composite = new Uint8Array(limit + 1);
  const primes: number[] = [];
  for (let i = 2; i <= limit; i++) {
    if (composite[i]) continue;
    primes.push(i);
    for (let j = i * i; j <= limit; j += i) composite[j] = 1; // i*i ≤ 10¹⁴ < 2⁵³
  }
  return primes;
}

/** Absurd-length guard for Collatz: no known n reaches anywhere near this. */
export const COLLATZ_MAX_STEPS = 1_000_000;

/**
 * Collatz / hailstone sequence from n down to 1: n/2 when even, 3n+1 when odd.
 * Returns the full sequence (including the starting n and the final 1) and the
 * step count. n ≥ 1 required. A run exceeding COLLATZ_MAX_STEPS throws
 * ResourceLimitError rather than looping forever (the conjecture is unproven).
 */
export function collatz(nIn: Integer): { sequence: bigint[]; steps: number } {
  let n = toBig(nIn);
  if (n < 1n) throw new InvalidInputError("collatz: n must be a positive integer");
  const sequence: bigint[] = [n];
  let steps = 0;
  while (n !== 1n) {
    n = (n & 1n) === 0n ? n / 2n : 3n * n + 1n;
    sequence.push(n);
    steps++;
    if (steps > COLLATZ_MAX_STEPS) {
      throw new ResourceLimitError(`collatz: exceeded ${COLLATZ_MAX_STEPS} steps from ${nIn}`);
    }
  }
  return { sequence, steps };
}
