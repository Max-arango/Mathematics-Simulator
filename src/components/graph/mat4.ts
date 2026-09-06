// Minimal column-major 4x4 matrix helpers for the 3D surface view.
export type Mat4 = Float32Array;

export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

/** Project a world point through an MVP to CSS pixels. null if behind the camera. */
export function project(mvp: Mat4, x: number, y: number, z: number, w: number, h: number): { x: number; y: number } | null {
  const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
  if (cw <= 1e-6) return null;
  const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
  const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
  return { x: (cx / cw * 0.5 + 0.5) * w, y: (1 - (cy / cw * 0.5 + 0.5)) * h };
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

/** Orbit camera looking at the origin: rotate around Z by `yaw`, tilt by `pitch`, distance `dist`. */
export function orbitView(yaw: number, pitch: number, dist: number): Mat4 {
  return orbitViewAt(yaw, pitch, dist, 0, 0, 0);
}

/** Orbit camera looking at an arbitrary target (tx,ty,tz) — lets the view PAN/FLY
 *  through the scene, not just spin around the origin. */
export function orbitViewAt(yaw: number, pitch: number, dist: number, tx: number, ty: number, tz: number): Mat4 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const ex = tx + dist * cp * cy, ey = ty + dist * cp * sy, ez = tz + dist * sp;
  return lookAt(ex, ey, ez, tx, ty, tz, 0, 0, 1);
}

/** Camera basis (right, up) for a given yaw/pitch — for screen-plane panning. */
export function orbitBasis(yaw: number, pitch: number): { right: [number, number, number]; up: [number, number, number] } {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // z = normalize(eye − target) points from target toward camera.
  const zx = cp * cy, zy = cp * sy, zz = sp;
  // right = normalize(worldUp × z), up = z × right  (worldUp = +Z).
  let rx = 0 * zz - 1 * zy, ry = 1 * zx - 0 * zz, rz = 0 * zy - 0 * zx; // (0,0,1)×z
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  const ux = zy * rz - zz * ry, uy = zz * rx - zx * rz, uz = zx * ry - zy * rx;
  return { right: [rx, ry, rz], up: [ux, uy, uz] };
}

function lookAt(ex: number, ey: number, ez: number, tx: number, ty: number, tz: number, ux: number, uy: number, uz: number): Mat4 {
  let zx = ex - tx, zy = ey - ty, zz = ez - tz;
  let zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
  let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
  const xl = Math.hypot(xx, xy, xz); xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1,
  ]);
}
