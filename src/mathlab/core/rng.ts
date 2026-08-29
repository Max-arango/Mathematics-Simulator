// Seeded PRNG for reproducible sampling (spec §29). Reproducibility contract:
// the same integer seed ALWAYS yields the identical sequence of draws, so any
// Monte Carlo / sampling result can be replayed exactly. Never uses Math.random
// (unseeded, non-reproducible). Algorithm: mulberry32 — a fast 32-bit generator
// with good statistical quality for simulation use (not for cryptography).

export interface Rng {
  next(): number; // uniform in [0, 1)
}

/** Standard mulberry32: returns a stateful generator of uniforms in [0, 1). */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const makeRng = (seed: number): Rng => {
  const next = mulberry32(seed);
  return { next };
};

/** Uniform in [a, b). */
export const uniform = (rng: Rng, a: number, b: number): number => a + (b - a) * rng.next();

/** Integer in [loInclusive, hiInclusive]. */
export const int = (rng: Rng, loInclusive: number, hiInclusive: number): number =>
  loInclusive + Math.floor(rng.next() * (hiInclusive - loInclusive + 1));

/**
 * Normal(mean, sd) via Box–Muller. Computes the transform pair and returns one
 * value per call (the second is discarded — no shared cache, so behaviour stays
 * purely a function of the rng's state). 1 - next() keeps the log argument in
 * (0, 1], avoiding log(0).
 */
export const normal = (rng: Rng, mean = 0, sd = 1): number => {
  const u1 = 1 - rng.next();
  const u2 = rng.next();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z0;
};
