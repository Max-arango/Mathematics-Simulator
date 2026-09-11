// Spherical <-> Cartesian coordinate conversion for the equatorial-chart VISUAL
// pipeline shared by Dynamics3DView's General Relativity mode (Schwarzschild/Kerr
// geodesics are integrated in (t,r,theta,phi); the camera/click plumbing is
// Cartesian). Pure coordinate algebra, no physics — the forward direction is the
// exact map already used to plot a geodesic's states; the inverse is its algebraic
// inverse, used to turn a clicked Cartesian point into a geodesic start point.
import type { Vec3 } from "../dynamics3d/types.ts";

export interface Spherical { r: number; theta: number; phi: number; }

/** (r, theta, phi) -> Cartesian (x, y, z), standard physics convention (theta from +z). */
export function sphericalToCartesian(r: number, theta: number, phi: number): Vec3 {
  return [r * Math.sin(theta) * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(theta)];
}

/** Cartesian (x, y, z) -> (r, theta, phi), the algebraic inverse of sphericalToCartesian.
 *  At r=0 theta/phi are undefined; theta defaults to pi/2 (equatorial) and phi to 0. */
export function cartesianToSpherical(p: Vec3): Spherical {
  const r = Math.hypot(p[0], p[1], p[2]);
  if (r === 0) return { r: 0, theta: Math.PI / 2, phi: 0 };
  return { r, theta: Math.acos(p[2] / r), phi: Math.atan2(p[1], p[0]) };
}
