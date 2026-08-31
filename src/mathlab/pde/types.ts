// Shared shapes for the 1D partial-differential-equation (PDE) solvers.
//
// This is a MINIMAL, extensible foundation (spec §25–§27), not a PDE library: it
// covers explicit finite-difference marching of the two canonical time-dependent
// 1D equations — heat (parabolic, heat1d.ts) and wave (hyperbolic, wave1d.ts) —
// plus a steady-state 2D elliptic solver (laplace2d.ts, its own result shape).
//
// Every time-marching solver returns this same PDEResult1D and, per spec §27,
// SELF-REPORTS its stability: `stabilityNumber` is the scheme's dimensionless
// stability parameter (heat r = α·dt/dx², wave Courant C = c·dt/dx) and `stable`
// says whether the run stayed inside the scheme's stability region. A solver never
// hands back a blown-up grid dressed as truth — it either refuses (throwing
// NumericalInstabilityError) or returns `stable:false` with a loud warning.
// heat1d and wave1d both REFUSE (throw) above their limits; the flag is kept in the
// shape so future conditionally-stable schemes can flag-and-warn instead.

/** Result of a 1D time-marching finite-difference solve. u[timeIndex][spaceIndex]. */
export interface PDEResult1D {
  x: number[]; // spatial grid, length nx, x[0]=xMin … x[nx-1]=xMax (uniform)
  t: number[]; // time samples, length steps+1, t[0]=0 … t[steps]=steps·dt
  u: number[][]; // solution surface: u[n] is the profile at time t[n], length nx
  method: string; // scheme identifier, e.g. "FTCS" / "leapfrog"
  stable: boolean; // did the run stay inside the scheme's stability region?
  stabilityNumber: number; // r = α·dt/dx² (heat) or Courant C = c·dt/dx (wave)
  warnings: string[];
}

/** Uniform 1D spatial grid: nx points (BOTH boundaries included) over [xMin, xMax]. */
export interface Grid1D {
  xMin: number;
  xMax: number;
  nx: number; // interior + 2 boundary points; dx = (xMax − xMin)/(nx − 1); nx ≥ 3
}
