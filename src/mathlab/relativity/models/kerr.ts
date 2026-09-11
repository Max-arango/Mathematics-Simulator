// Kerr metric: the exact vacuum (Ricci-flat) solution of the Einstein field
// equations for a rotating, uncharged, axisymmetric mass, in Boyer-Lindquist
// coordinates (t, r, theta, phi). Geometrized units G=c=1: M is mass and
// a=J/M is the spin parameter (both measured in length). Physically a must
// satisfy |a|<=M (a>M would be a naked singularity, not a black hole) — this
// is documented here but not enforced, matching Schwarzschild's convention of
// not policing e.g. M<0.
//   Sigma = r^2 + a^2 cos^2(theta)
//   Delta = r^2 - 2Mr + a^2
//   ds^2 = -(1-2Mr/Sigma) dt^2 - (4Mar sin^2(theta)/Sigma) dt dphi
//          + (Sigma/Delta) dr^2 + Sigma dtheta^2
//          + (r^2+a^2+2Ma^2 r sin^2(theta)/Sigma) sin^2(theta) dphi^2
// Note the off-diagonal g_tphi term: this is the first metric in this module
// with genuine frame-dragging (t-phi coupling), unlike the diagonal
// Minkowski/Schwarzschild metrics.
import { makeMetric, type MetricModel } from "../metric.ts";

/** Build a Kerr metric for mass M and spin parameter a=J/M (geometrized units, G=c=1). */
export function makeKerr(M: number, a: number): MetricModel {
  // Sigma = r^2 + a^2*cos(theta)^2, Delta = r^2 - 2*M*r + a^2.
  const Sigma = "(r^2+a^2*cos(theta)^2)";
  const Delta = "(r^2-2*M*r+a^2)";
  return makeMetric({
    name: "Kerr",
    coords: ["t", "r", "theta", "phi"],
    params: { M, a },
    componentsSource: [
      [`-(1-2*M*r/${Sigma})`, "0", "0", `-2*M*a*r*sin(theta)^2/${Sigma}`],
      ["0", `${Sigma}/${Delta}`, "0", "0"],
      ["0", "0", Sigma, "0"],
      [
        `-2*M*a*r*sin(theta)^2/${Sigma}`,
        "0",
        "0",
        `(r^2+a^2+2*M*a^2*r*sin(theta)^2/${Sigma})*sin(theta)^2`,
      ],
    ],
    signature: "-+++",
    provenance:
      "exact/analytic solution of the vacuum Einstein field equations " +
      "(idealized rotating, uncharged, axisymmetric spacetime)",
    chart: "Boyer-Lindquist coordinates (stationary, axisymmetric)",
    // The outer horizon r_+ = M + sqrt(M^2-a^2) (root of Delta=0) and the region
    // at/inside it lie outside this chart's domain of validity, same pattern as
    // Schwarzschild's r>2M. Note the ergosphere (where g_tt>=0, between r_+ and
    // the larger root of g_tt=0) is NOT excluded here: it is a real, physically
    // meaningful region outside the horizon where frame-dragging forces every
    // observer to co-rotate, not a coordinate pathology.
    validRegion: (x) => x[1] > M + Math.sqrt(M * M - a * a),
  });
}
