// Central numerical tolerances. No magic numbers scattered across the engine —
// numeric subsystems import from here so tolerance policy is auditable in one place.
export const EPSILON = 1e-12;          // "effectively zero" for exact-ish comparisons
export const ABS_TOL = 1e-9;           // absolute convergence tolerance
export const REL_TOL = 1e-9;           // relative convergence tolerance
export const MAX_ITERATIONS = 100;     // iterative solver cap
export const DERIV_H = 1e-6;           // step for numerical (finite-difference) derivatives

/** |a − b| within absolute tolerance. */
export const nearlyEqual = (a: number, b: number, tol = ABS_TOL): boolean => Math.abs(a - b) <= tol;
