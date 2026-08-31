// First-order uncertainty propagation (spec §43) — a FOUNDATION, not a complete error theory.
// A Measurement is value ± absolute-uncertainty. Propagation assumes the inputs are INDEPENDENT
// and errors small, so uncertainties combine in quadrature: absolute adds in quadrature for ±,
// RELATIVE adds in quadrature for ×/÷. Correlated errors and higher-order terms are out of scope
// (they would need a covariance model); this is stated so results are never over-trusted.
import { InvalidInputError } from "../core/errors.ts";

export interface Measurement {
  value: number;
  abs: number;   // absolute uncertainty, ≥ 0
}

export function measurement(value: number, abs: number): Measurement {
  if (!(abs >= 0)) throw new InvalidInputError(`absolute uncertainty must be ≥ 0 (got ${abs})`);
  return { value, abs };
}

/** Relative (fractional) uncertainty |abs / value|; ∞ when value is 0 and abs > 0. */
export const relative = (m: Measurement): number =>
  m.value === 0 ? (m.abs === 0 ? 0 : Infinity) : Math.abs(m.abs / m.value);

const quad = (a: number, b: number): number => Math.hypot(a, b);

/** a + b — values add, absolute uncertainties add in quadrature. */
export const addU = (a: Measurement, b: Measurement): Measurement =>
  ({ value: a.value + b.value, abs: quad(a.abs, b.abs) });

/** a − b — values subtract, absolute uncertainties add in quadrature. */
export const subU = (a: Measurement, b: Measurement): Measurement =>
  ({ value: a.value - b.value, abs: quad(a.abs, b.abs) });

/** a · b — values multiply, RELATIVE uncertainties add in quadrature. */
export function mulU(a: Measurement, b: Measurement): Measurement {
  const value = a.value * b.value;
  return { value, abs: Math.abs(value) * quad(relative(a), relative(b)) };
}

/** a / b — values divide, RELATIVE uncertainties add in quadrature. */
export function divU(a: Measurement, b: Measurement): Measurement {
  const value = a.value / b.value;
  return { value, abs: Math.abs(value) * quad(relative(a), relative(b)) };
}

/** k · a — exact scalar: absolute uncertainty scales by |k|. */
export const scaleU = (a: Measurement, k: number): Measurement =>
  ({ value: k * a.value, abs: Math.abs(k) * a.abs });

/** aⁿ — relative uncertainty scales by |n| (first order: d(xⁿ)/xⁿ = n·dx/x). */
export function powU(a: Measurement, n: number): Measurement {
  const value = a.value ** n;
  return { value, abs: Math.abs(value) * Math.abs(n) * relative(a) };
}
