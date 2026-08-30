// Probability distribution abstraction + self-describing registry (spec §39, §65). The
// Distribution interface is the extension point: every concrete distribution exposes the
// same shape (moments, support, cdf, seeded sample) so a UI or dispatcher can treat them
// uniformly. Discrete distributions add pmf, continuous ones add pdf. All sampling routes
// through the seeded Rng (spec §29) — never Math.random — so every draw is replayable.
import type { Rng } from "../core/rng.ts";
import { InvalidInputError } from "../core/errors.ts";
import {
  makeBernoulli,
  makeBinomial,
  makeUniform,
  makeNormal,
  makeExponential,
  makePoisson,
} from "./distributions.ts";

export interface Distribution {
  name: string;
  kind: "discrete" | "continuous";
  params: Record<string, number>;
  mean: number;
  variance: number;
  support: { lo: number; hi: number };
  pmf?(k: number): number; // discrete only
  pdf?(x: number): number; // continuous only
  cdf(x: number): number;
  sample(rng: Rng): number;
}

/** Registry mapping distribution name → factory. Add a distribution by adding one entry. */
export const DISTRIBUTIONS: Record<string, (params: Record<string, number>) => Distribution> = {
  bernoulli: makeBernoulli,
  binomial: makeBinomial,
  uniform: makeUniform,
  normal: makeNormal,
  exponential: makeExponential,
  poisson: makePoisson,
};

/**
 * Construct a distribution by name. Throws InvalidInputError on an unknown name; the factory
 * itself throws InvalidInputError/DomainError on invalid parameters.
 */
export function makeDistribution(name: string, params: Record<string, number>): Distribution {
  const factory = DISTRIBUTIONS[name];
  if (!factory) {
    throw new InvalidInputError(
      `unknown distribution "${name}"; available: ${Object.keys(DISTRIBUTIONS).join(", ")}`,
    );
  }
  return factory(params);
}
