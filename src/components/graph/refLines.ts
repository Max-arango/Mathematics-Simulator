// Reference geometry for the 3D view: xy-grid (cartesian plane), colored X/Y/Z
// axes, and a probe marker at (px, py, pz). Returns interleaved [x,y,z, r,g,b].
// Pure + testable: no WebGL here.

const GRID = [0.16, 0.2, 0.3];
const BOX = [0.24, 0.3, 0.42];
const AX = { x: [0.95, 0.42, 0.42], y: [0.45, 0.9, 0.55], z: [0.5, 0.62, 1.0] };
const PROBE = [0.96, 0.8, 0.3];

export interface RefOpts { grid?: boolean; axes?: boolean; box?: boolean }

export function buildRefLines(
  range: number,
  probe: { x: number; y: number; z: number } | null,
  opts: RefOpts = {},
  zRange = range,
): Float32Array {
  const { grid = true, axes = true, box = false } = opts;
  const v: number[] = [];
  const seg = (a: number[], b: number[], c: number[]) => v.push(a[0], a[1], a[2], ...c, b[0], b[1], b[2], ...c);
  const R = range;
  const Z = zRange;

  // Ground grid on z = 0 (skip the two center lines; axes draw those).
  if (grid)
    for (let i = -R; i <= R; i++) {
      if (i === 0) continue;
      seg([i, -R, 0], [i, R, 0], GRID);
      seg([-R, i, 0], [R, i, 0], GRID);
    }

  // Bounding box spanning [-R, R]² × [-Z, Z].
  if (box) {
    const c: [number, number][] = [[-R, -R], [R, -R], [R, R], [-R, R]];
    for (let e = 0; e < 4; e++) {
      const [ax, ay] = c[e], [bx, by] = c[(e + 1) % 4];
      seg([ax, ay, -Z], [bx, by, -Z], BOX); // bottom
      seg([ax, ay, Z], [bx, by, Z], BOX);   // top
      seg([ax, ay, -Z], [ax, ay, Z], BOX);  // vertical pillar
    }
  }

  // Axes through the origin.
  if (axes) {
    seg([-R, 0, 0], [R, 0, 0], AX.x);
    seg([0, -R, 0], [0, R, 0], AX.y);
    seg([0, 0, -Z], [0, 0, Z], AX.z);
    const t = 0.12;
    for (let i = -R; i <= R; i++) {
      if (i === 0) continue;
      seg([i, -t, 0], [i, t, 0], AX.x);
      seg([-t, i, 0], [t, i, 0], AX.y);
    }
    // z ticks use the z extent, which may differ from x/y.
    const zStep = niceIntStep(Z);
    for (let i = -Math.floor(Z / zStep) * zStep; i <= Z; i += zStep) {
      if (Math.abs(i) < 1e-9) continue;
      seg([-t, 0, i], [t, 0, i], AX.z);
    }
  }

  // Probe: vertical stick from the plane to the surface + a small 3D cross.
  if (probe && Number.isFinite(probe.z)) {
    const { x, y, z } = probe;
    seg([x, y, 0], [x, y, z], PROBE);
    const c = 0.25;
    seg([x - c, y, z], [x + c, y, z], PROBE);
    seg([x, y - c, z], [x, y + c, z], PROBE);
    seg([x, y, z - c], [x, y, z + c], PROBE);
  }

  return new Float32Array(v);
}

/** Vertex count for a given float buffer (6 floats per vertex). */
export const vertexCount = (buf: Float32Array) => buf.length / 6;

/** Integer-ish tick step so a tall z axis doesn't draw hundreds of ticks. */
export function niceIntStep(extent: number): number {
  const raw = extent / 6; // aim ~6 ticks each side
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const f = raw / p;
  return Math.max(1, (f < 2 ? 1 : f < 5 ? 2 : 5) * p);
}
