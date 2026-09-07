// Flat Minkowski spacetime in Cartesian coordinates, signature -+++. The trivial
// (zero-curvature) analytic solution of the vacuum Einstein equations — used to
// validate the whole metric/Christoffel/curvature/geodesic pipeline before any
// non-trivial (Schwarzschild/Kerr) model is added.
import { makeMetric } from "../metric.ts";

export const minkowski = makeMetric({
  name: "Minkowski",
  coords: ["t", "x", "y", "z"],
  params: {},
  componentsSource: [
    ["-1", "0", "0", "0"],
    ["0", "1", "0", "0"],
    ["0", "0", "1", "0"],
    ["0", "0", "0", "1"],
  ],
  signature: "-+++",
  provenance: "exact/analytic (trivial flat solution of the vacuum Einstein equations)",
  chart: "Cartesian",
});
