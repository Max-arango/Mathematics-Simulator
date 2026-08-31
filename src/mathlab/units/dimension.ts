// Physical dimensions as a vector over the 7 SI base dimensions (spec §40/§41). A dimension is
// the exponent tuple (length, mass, time, current, temperature, amount, luminous); dimensionless
// is the zero vector. Multiplying quantities ADDS dimensions, dividing SUBTRACTS, powering SCALES.
// This keeps dimensional-consistency checks to a vector equality — 5 m + 2 s is rejected because
// their dimension vectors differ, not by any unit-string parsing.
import { EPSILON } from "../core/constants.ts";

export type DimKey = "length" | "mass" | "time" | "current" | "temperature" | "amount" | "luminous";
export const DIM_KEYS: readonly DimKey[] = ["length", "mass", "time", "current", "temperature", "amount", "luminous"];

// SI symbol for each base dimension, used when formatting a dimension signature.
const DIM_SYMBOL: Record<DimKey, string> = {
  length: "L", mass: "M", time: "T", current: "I", temperature: "Θ", amount: "N", luminous: "J",
};

export type Dimension = Record<DimKey, number>;

/** Build a dimension from a partial exponent map; unset base dimensions default to 0. */
export function dim(exponents: Partial<Dimension> = {}): Dimension {
  const d = {} as Dimension;
  for (const k of DIM_KEYS) d[k] = exponents[k] ?? 0;
  return d;
}

export const DIMENSIONLESS: Dimension = dim();

export const addDim = (a: Dimension, b: Dimension): Dimension => {
  const d = {} as Dimension;
  for (const k of DIM_KEYS) d[k] = a[k] + b[k];
  return d;
};
export const subDim = (a: Dimension, b: Dimension): Dimension => {
  const d = {} as Dimension;
  for (const k of DIM_KEYS) d[k] = a[k] - b[k];
  return d;
};
export const scaleDim = (a: Dimension, n: number): Dimension => {
  const d = {} as Dimension;
  for (const k of DIM_KEYS) d[k] = a[k] * n;
  return d;
};
export const equalDim = (a: Dimension, b: Dimension): boolean =>
  DIM_KEYS.every((k) => Math.abs(a[k] - b[k]) < EPSILON);
export const isDimensionless = (a: Dimension): boolean => equalDim(a, DIMENSIONLESS);

/** Human-readable signature, e.g. "L·T⁻¹" for velocity, "1" for dimensionless. */
export function formatDim(d: Dimension): string {
  const sup = (n: number): string => {
    if (n === 1) return "";
    const s = String(n).replace("-", "⁻").replace(/[0-9]/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c]);
    return s;
  };
  const parts = DIM_KEYS.filter((k) => Math.abs(d[k]) > EPSILON).map((k) => `${DIM_SYMBOL[k]}${sup(d[k])}`);
  return parts.length ? parts.join("·") : "1";
}
