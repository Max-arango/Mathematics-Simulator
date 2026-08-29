// Error function erf and its complement erfc — needed by the Normal distribution's cdf
// (Φ(x) = ½·erfc(−(x−μ)/(σ√2))). Part of the special-function seed set (spec §39).
//
// METHOD: Abramowitz & Stegun 7.1.26, a rational×Gaussian approximation valid for x ≥ 0:
//   erf(x) ≈ 1 − (a₁t + a₂t² + a₃t³ + a₄t⁴ + a₅t⁵)·e^(−x²),  t = 1/(1 + p·x).
// Odd symmetry erf(−x) = −erf(x) extends it to the whole line. ACCURACY: |error| ≤ 1.5e-7
// (the documented A&S bound) — this is the accuracy CEILING; do not expect double precision.
// erfc is returned as 1 − erf, so its absolute error inherits the same ~1.5e-7 bound (relative
// accuracy degrades in the far tail where erfc → 0, acceptable for the distribution cdfs here).

const P = 0.3275911;
const A1 = 0.254829592;
const A2 = -0.284496736;
const A3 = 1.421413741;
const A4 = -1.453152027;
const A5 = 1.061405429;

/** Error function. erf(0) = 0, erf(±∞) = ±1, odd: erf(−x) = −erf(x). |error| ≤ 1.5e-7. */
export function erf(x: number): number {
  if (x === 0) return 0; // A&S 7.1.26 leaves a ~1e-9 residual at 0; pin the exact value.
  if (x < 0) return -erf(-x);
  const t = 1 / (1 + P * x);
  const poly = ((((A5 * t + A4) * t + A3) * t + A2) * t + A1) * t;
  return 1 - poly * Math.exp(-x * x);
}

/** Complementary error function erfc(x) = 1 − erf(x). Same ~1.5e-7 absolute-error ceiling. */
export function erfc(x: number): number {
  return 1 - erf(x);
}
