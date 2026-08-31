// A dimensional Quantity: a numeric value together with its physical Dimension (spec §40).
// The value is always stored in COHERENT SI BASE units (m, kg, s, A, K, mol, cd); a display
// unit is applied only at the registry boundary (units.ts). Arithmetic enforces dimensional
// consistency: add/sub REQUIRE equal dimensions (else DimensionError — the "5 m + 2 s" case),
// while mul/div/pow combine dimensions. Quantities are plain serializable records.
import { type Dimension, addDim, subDim, scaleDim, equalDim, formatDim } from "./dimension.ts";
import { DimensionError } from "../core/errors.ts";

export interface Quantity {
  value: number;      // magnitude in coherent SI base units
  dim: Dimension;
}

export const quantity = (value: number, dim: Dimension): Quantity => ({ value, dim });

/** a + b — throws DimensionError unless the dimensions match (spec §40). */
export function addQ(a: Quantity, b: Quantity): Quantity {
  if (!equalDim(a.dim, b.dim)) {
    throw new DimensionError(`cannot add ${formatDim(a.dim)} + ${formatDim(b.dim)}: dimension mismatch`);
  }
  return { value: a.value + b.value, dim: a.dim };
}

/** a − b — throws DimensionError unless the dimensions match. */
export function subQ(a: Quantity, b: Quantity): Quantity {
  if (!equalDim(a.dim, b.dim)) {
    throw new DimensionError(`cannot subtract ${formatDim(a.dim)} − ${formatDim(b.dim)}: dimension mismatch`);
  }
  return { value: a.value - b.value, dim: a.dim };
}

/** a · b — dimensions add. */
export const mulQ = (a: Quantity, b: Quantity): Quantity => ({ value: a.value * b.value, dim: addDim(a.dim, b.dim) });

/** a / b — dimensions subtract. */
export const divQ = (a: Quantity, b: Quantity): Quantity => ({ value: a.value / b.value, dim: subDim(a.dim, b.dim) });

/** aⁿ — dimensions scale by n (n may be fractional, e.g. √area). */
export const powQ = (a: Quantity, n: number): Quantity => ({ value: a.value ** n, dim: scaleDim(a.dim, n) });

/** k · a — scalar scaling leaves the dimension unchanged. */
export const scaleQ = (a: Quantity, k: number): Quantity => ({ value: k * a.value, dim: a.dim });
