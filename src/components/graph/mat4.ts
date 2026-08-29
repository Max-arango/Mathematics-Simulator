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
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Camera position on a sphere (Z up).
  const ex = dist * cp * cy, ey = dist * cp * sy, ez = dist * sp;
  return lookAt(ex, ey, ez, 0, 0, 0, 0, 0, 1);
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
