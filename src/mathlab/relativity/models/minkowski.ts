// Minkowski spacetime — flat, the correctness baseline for the whole GR subsystem.
//
//   coords (t,x,y,z) Cartesian,  g_{μν} = diag(−1, +1, +1, +1),  ∂g = 0.
//
// Consequences the tests pin down: all Christoffel symbols vanish, Riemann/Ricci/
// scalar are zero, and geodesics are straight lines x^μ(τ) = x^μ_0 + u^μ τ. If any of
// these break, the generic engine (metric.ts) is wrong — not the model.
import { DIM, type Coord, type Tensor2, type Tensor3, type MetricModel } from "../types.ts";

function g(_x: Coord): Tensor2 {
  return [
    [-1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

function dg(_x: Coord): Tensor3 {
  return Array.from({ length: DIM }, () => Array.from({ length: DIM }, () => new Array<number>(DIM).fill(0)));
}

export const minkowski: MetricModel = {
  id: "minkowski",
  label: "Minkowski (flat)",
  provenance: "Exact flat solution; the trivial vacuum solution of the Einstein field equations (zero curvature).",
  coords: ["t", "x", "y", "z"],
  signature: "(−,+,+,+)",
  params: {},
  domain: () => ({ ok: true }),
  g,
  dg,
  toCartesian: (x) => [x[1], x[2], x[3]],
};
