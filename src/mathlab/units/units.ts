// Named-unit registry + conversions (spec §40). Each linear unit records its dimension and a
// multiplicative FACTOR to coherent SI base units (1 km = 1000 m ⇒ factor 1000). makeQuantity
// applies the factor on the way in; toUnit removes it on the way out, checking the dimension
// matches first. Affine temperature units (°C, °F) do NOT fit a multiplicative model — they get
// a dedicated convertTemperature(); they are intentionally NOT in UNITS to avoid nonsense like
// "°C × m". Extend the platform by adding a UNITS entry (spec §65-style registry).
import { type Dimension, dim, equalDim, formatDim } from "./dimension.ts";
import { type Quantity, quantity } from "./quantity.ts";
import { InvalidInputError, DimensionError } from "../core/errors.ts";

export interface UnitDef { symbol: string; dim: Dimension; factor: number; }

const L = dim({ length: 1 }), M = dim({ mass: 1 }), T = dim({ time: 1 });
const A = dim({ current: 1 }), K = dim({ temperature: 1 }), MOL = dim({ amount: 1 }), CD = dim({ luminous: 1 });
const FORCE = dim({ mass: 1, length: 1, time: -2 });
const ENERGY = dim({ mass: 1, length: 2, time: -2 });
const POWER = dim({ mass: 1, length: 2, time: -3 });
const PRESSURE = dim({ mass: 1, length: -1, time: -2 });
const VELOCITY = dim({ length: 1, time: -1 });

export const UNITS: Record<string, UnitDef> = {
  // SI base
  m: { symbol: "m", dim: L, factor: 1 }, kg: { symbol: "kg", dim: M, factor: 1 },
  s: { symbol: "s", dim: T, factor: 1 }, A: { symbol: "A", dim: A, factor: 1 },
  K: { symbol: "K", dim: K, factor: 1 }, mol: { symbol: "mol", dim: MOL, factor: 1 },
  cd: { symbol: "cd", dim: CD, factor: 1 },
  // length
  km: { symbol: "km", dim: L, factor: 1000 }, cm: { symbol: "cm", dim: L, factor: 0.01 },
  mm: { symbol: "mm", dim: L, factor: 1e-3 }, mi: { symbol: "mi", dim: L, factor: 1609.344 },
  // mass
  g: { symbol: "g", dim: M, factor: 1e-3 }, mg: { symbol: "mg", dim: M, factor: 1e-6 },
  t: { symbol: "t", dim: M, factor: 1000 },
  // time
  ms: { symbol: "ms", dim: T, factor: 1e-3 }, min: { symbol: "min", dim: T, factor: 60 },
  h: { symbol: "h", dim: T, factor: 3600 }, day: { symbol: "day", dim: T, factor: 86400 },
  // derived
  N: { symbol: "N", dim: FORCE, factor: 1 }, J: { symbol: "J", dim: ENERGY, factor: 1 },
  W: { symbol: "W", dim: POWER, factor: 1 }, Pa: { symbol: "Pa", dim: PRESSURE, factor: 1 },
  Hz: { symbol: "Hz", dim: dim({ time: -1 }), factor: 1 },
  C: { symbol: "C", dim: dim({ current: 1, time: 1 }), factor: 1 },
  "m/s": { symbol: "m/s", dim: VELOCITY, factor: 1 },
  "km/h": { symbol: "km/h", dim: VELOCITY, factor: 1000 / 3600 },
};

/** Build a Quantity of magnitude `value` in the named unit (throws on unknown unit). */
export function makeQuantity(value: number, unit: string): Quantity {
  const u = UNITS[unit];
  if (!u) throw new InvalidInputError(`unknown unit "${unit}"; known: ${Object.keys(UNITS).join(", ")}`);
  return quantity(value * u.factor, u.dim);
}

/** Magnitude of a Quantity expressed in the named unit (throws DimensionError on mismatch). */
export function toUnit(q: Quantity, unit: string): number {
  const u = UNITS[unit];
  if (!u) throw new InvalidInputError(`unknown unit "${unit}"`);
  if (!equalDim(q.dim, u.dim)) {
    throw new DimensionError(`cannot express ${formatDim(q.dim)} in "${unit}" (${formatDim(u.dim)}): dimension mismatch`);
  }
  return q.value / u.factor;
}

/** Convert a magnitude between two named units of the SAME dimension (throws on mismatch). */
export const convert = (value: number, from: string, to: string): number => toUnit(makeQuantity(value, from), to);

// ── Affine temperature (not multiplicative — handled separately) ────────────────────────
export type TempUnit = "K" | "degC" | "degF";
const toKelvin = (v: number, u: TempUnit): number =>
  u === "K" ? v : u === "degC" ? v + 273.15 : (v - 32) * 5 / 9 + 273.15;
const fromKelvin = (k: number, u: TempUnit): number =>
  u === "K" ? k : u === "degC" ? k - 273.15 : (k - 273.15) * 9 / 5 + 32;

/** Affine temperature conversion (K ↔ °C ↔ °F). Kept out of UNITS because °C/°F are not scalars. */
export function convertTemperature(value: number, from: TempUnit, to: TempUnit): number {
  return fromKelvin(toKelvin(value, from), to);
}
