// General Relativity — core types (Layer 1).
//
// A spacetime is described by a METRIC MODEL: a chart (coordinate names), a metric
// tensor g_{μν}(x) and its analytic first derivatives ∂_α g_{μν}(x). Everything else
// — inverse metric, Christoffel symbols, Riemann/Ricci curvature, geodesics — is
// DERIVED generically by the geometry engine (metric.ts) from those two functions.
// The model supplies the metric; the engine supplies the geometry (spec §"DIFFERENTIAL
// GEOMETRY": do NOT hardcode model-specific tensors into the generic functions).
//
// HONESTY (spec): every model carries `provenance`. These are ANALYTIC solutions of
// the Einstein field equations, integrated NUMERICALLY along geodesics — not a
// visualization proxy, and not a numerical solution of the full EFE. `signature` and
// the (−,+,+,+) convention (c = G = 1 geometrized units) are stated explicitly.

/** Spacetime dimension. Fixed at 4 (1 time + 3 space). */
export const DIM = 4;

/** A spacetime point x^μ in the model's chart (length 4). */
export type Coord = number[];
/** A rank-2 tensor with both indices down/up as appropriate, 4×4 row-major. */
export type Tensor2 = number[][];
/** ∂_α T_{μν}: index order [α][μ][ν]. */
export type Tensor3 = number[][][];
/** Γ^μ_{αβ} or R^ρ_{σμν} slices as [i][j][k]. */
export type Christoffel = number[][][];

export interface DomainCheck {
  ok: boolean;
  /** Why the point is outside the valid chart (e.g. "inside event horizon r ≤ rs"). */
  reason?: string;
}

export interface MetricModel {
  id: string;
  label: string;
  /** Scientific provenance string surfaced in the UI (honesty requirement). */
  provenance: string;
  /** Coordinate names, e.g. ["t","r","θ","φ"]. */
  coords: [string, string, string, string];
  /** Metric signature, e.g. "(−,+,+,+)". */
  signature: string;
  /** Model parameters (mass, …). */
  params: Record<string, number>;
  /** Valid-coordinate / domain guard, evaluated before using the metric at x. */
  domain(x: Coord): DomainCheck;
  /** Metric tensor g_{μν}(x) (4×4 symmetric). */
  g(x: Coord): Tensor2;
  /** Analytic first derivatives ∂_α g_{μν}(x): [α][μ][ν]. */
  dg(x: Coord): Tensor3;
  /** Map a chart point to Cartesian (x,y,z) for rendering (drops the time coord). */
  toCartesian(x: Coord): [number, number, number];
}

export interface GeodesicResult {
  /** Affine parameter samples (proper time τ for timelike, affine λ for null). */
  tau: number[];
  /** Position x^μ at each sample. */
  x: Coord[];
  /** 4-velocity u^μ = dx^μ/dτ at each sample. */
  u: Coord[];
  /** Cartesian (x,y,z) of each position, via model.toCartesian — for rendering. */
  cartesian: [number, number, number][];
  /** Why integration stopped. */
  termination: "reached-tau" | "left-domain" | "non-finite";
  /** true if the whole horizon was integrated with a finite state. */
  ok: boolean;
}
