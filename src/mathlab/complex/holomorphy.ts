// Numerical complex differentiation and a Cauchy–Riemann test.
//
// Spec §38: a function of a complex variable can have all four real partials
// (u_x, u_y, v_x, v_y) exist and still NOT be complex-differentiable. Complex
// differentiability at a point requires the Cauchy–Riemann equations
//   u_x = v_y   and   u_y = −v_x   (f = u + iv)
// so we test those directly instead of assuming every function is holomorphic.
// The classic counterexample is conj(z): its partials exist everywhere but CR
// fails everywhere, so it is nowhere complex-differentiable.
//
// Everything here is NUMERICAL (finite differences), so results are pointwise
// estimates, not proofs, and degrade near branch cuts and singularities where
// a central difference straddles a discontinuity.

import type { Complex } from "./complex.ts";
import { C, sub, div } from "./complex.ts";
import { DERIV_H } from "../core/constants.ts";

// Relative tolerance for the CR residual. Central differences with h≈1e-6 leave
// a residual ~1e-10·(partial magnitude) for a genuinely holomorphic function,
// while a non-holomorphic one (e.g. conj) leaves an O(1) residual — a ~7-order
// gap, so this threshold separates them with room to spare.
const CR_REL_TOL = 1e-6;

const shift = (z: Complex, dx: number, dy: number): Complex => ({ re: z.re + dx, im: z.im + dy });

/**
 * Numerical estimate of f'(z) via a central difference along the REAL axis:
 *   (f(z+h) − f(z−h)) / (2h),  h real (default DERIV_H).
 * For a holomorphic f this equals the complex derivative (direction-independent);
 * for a non-holomorphic f it merely returns the real-direction difference quotient,
 * which is NOT a true complex derivative — use cauchyRiemann to tell them apart.
 */
export function complexDerivative(f: (z: Complex) => Complex, z: Complex, h = DERIV_H): Complex {
  return div(sub(f(shift(z, h, 0)), f(shift(z, -h, 0))), C(2 * h, 0));
}

export interface CauchyRiemann {
  u_x: number;
  u_y: number;
  v_x: number;
  v_y: number;
  satisfies: boolean;
  residual: number;
}

/**
 * Numerically estimate the four real partials of u=Re f and v=Im f (central
 * differences in the x and y directions) and test the Cauchy–Riemann equations
 * u_x≈v_y, u_y≈−v_x at `z`.
 *   residual = max(|u_x − v_y|, |u_y + v_x|)
 *   satisfies = residual < CR_REL_TOL · scale   (scale = max partial magnitude, ≥1)
 * Pointwise and numerical — noisy near branch cuts / singularities.
 */
export function cauchyRiemann(f: (z: Complex) => Complex, z: Complex, h = DERIV_H): CauchyRiemann {
  const fxp = f(shift(z, h, 0));
  const fxm = f(shift(z, -h, 0));
  const fyp = f(shift(z, 0, h));
  const fym = f(shift(z, 0, -h));

  const u_x = (fxp.re - fxm.re) / (2 * h);
  const v_x = (fxp.im - fxm.im) / (2 * h);
  const u_y = (fyp.re - fym.re) / (2 * h);
  const v_y = (fyp.im - fym.im) / (2 * h);

  const residual = Math.max(Math.abs(u_x - v_y), Math.abs(u_y + v_x));
  const scale = Math.max(Math.abs(u_x), Math.abs(u_y), Math.abs(v_x), Math.abs(v_y), 1);
  const satisfies = residual < CR_REL_TOL * scale;

  return { u_x, u_y, v_x, v_y, satisfies, residual };
}

/**
 * Convenience: does f satisfy Cauchy–Riemann at z? This is a POINTWISE,
 * NUMERICAL check (not a proof of holomorphy over any region).
 */
export function isHolomorphicAt(f: (z: Complex) => Complex, z: Complex, h = DERIV_H): boolean {
  return cauchyRiemann(f, z, h).satisfies;
}
