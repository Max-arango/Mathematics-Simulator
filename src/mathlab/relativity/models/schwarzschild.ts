// Schwarzschild metric: the exact vacuum (Ricci-flat) solution of the Einstein
// field equations for a non-rotating, uncharged, spherically symmetric mass,
// in Schwarzschild coordinates (t, r, theta, phi). Geometrized units G=c=1, so
// the single parameter M is mass measured in length (r has units of M).
//   ds^2 = -(1-2M/r) dt^2 + dr^2/(1-2M/r) + r^2 dtheta^2 + r^2 sin^2(theta) dphi^2
import { makeMetric, type MetricModel } from "../metric.ts";

/** Build a Schwarzschild metric for a given mass M (geometrized units, G=c=1). */
export function makeSchwarzschild(M: number): MetricModel {
  return makeMetric({
    name: "Schwarzschild",
    coords: ["t", "r", "theta", "phi"],
    params: { M },
    componentsSource: [
      ["-(1-2*M/r)", "0", "0", "0"],
      ["0", "1/(1-2*M/r)", "0", "0"],
      ["0", "0", "r^2", "0"],
      ["0", "0", "0", "r^2*sin(theta)^2"],
    ],
    signature: "-+++",
    provenance:
      "exact/analytic solution of the vacuum Einstein field equations " +
      "(idealized non-rotating, uncharged, spherically symmetric spacetime)",
    chart: "Schwarzschild coordinates (static, spherically symmetric)",
    // The coordinate singularity at r=2M (event horizon) and the true curvature
    // singularity at r=0 both lie outside this chart's domain of validity.
    validRegion: (x) => x[1] > 2 * M,
  });
}
