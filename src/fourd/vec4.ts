// 4D vectors, rotations in the six coordinate planes, and perspective
// projection 4D → 3D. The 4th coordinate (w) is carried through so it can be
// mapped to color: position uses x,y,z; the fourth dimension becomes hue.

export type Vec4 = [number, number, number, number];

/** Rotation angles (radians) for the six independent planes of 4-space. */
export interface Angles6 { xy: number; xz: number; xw: number; yz: number; yw: number; zw: number }

export const ZERO_ANGLES: Angles6 = { xy: 0, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 };

// Rotate components (i, j) of v by angle a. Indices: 0=x,1=y,2=z,3=w.
function rotPlane(v: Vec4, i: number, j: number, a: number) {
  if (a === 0) return;
  const c = Math.cos(a), s = Math.sin(a);
  const vi = v[i], vj = v[j];
  v[i] = vi * c - vj * s;
  v[j] = vi * s + vj * c;
}

/** Apply all six plane rotations (fixed order) to a copy of v. */
export function rotate4(v: Vec4, a: Angles6): Vec4 {
  const r: Vec4 = [v[0], v[1], v[2], v[3]];
  rotPlane(r, 0, 1, a.xy);
  rotPlane(r, 0, 2, a.xz);
  rotPlane(r, 0, 3, a.xw);
  rotPlane(r, 1, 2, a.yz);
  rotPlane(r, 1, 3, a.yw);
  rotPlane(r, 2, 3, a.zw);
  return r;
}

/**
 * Perspective projection 4D → 3D from a viewer at distance d along +w.
 * scale = d / (d − w): points with larger w loom larger. Returns [x, y, z, w]
 * (projected position + original w for coloring). Falls back to orthographic
 * when the point is at/behind the 4D eye.
 */
export function project4to3(v: Vec4, d: number): Vec4 {
  const denom = d - v[3];
  const s = denom > 1e-4 ? d / denom : 1;
  return [v[0] * s, v[1] * s, v[2] * s, v[3]];
}

export const PLANES: (keyof Angles6)[] = ["xy", "xz", "xw", "yz", "yw", "zw"];
