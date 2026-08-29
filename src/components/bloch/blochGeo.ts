// Static Bloch-sphere wireframe: meridians, parallels, bright equator, and
// coloured X/Y/Z axes. Returns interleaved [x,y,z, r,g,b] line vertices.

const MESH = [0.22, 0.27, 0.4];
const EQ = [0.42, 0.52, 0.72];
const AX = { x: [0.95, 0.42, 0.42], y: [0.45, 0.9, 0.55], z: [0.5, 0.62, 1.0] };

const SEG = 64; // segments per circle

export function buildBlochGeo(): Float32Array {
  const v: number[] = [];
  const seg = (a: number[], b: number[], col: number[]) => v.push(a[0], a[1], a[2], ...col, b[0], b[1], b[2], ...col);
  const sph = (theta: number, phi: number): number[] => [
    Math.sin(theta) * Math.cos(phi),
    Math.sin(theta) * Math.sin(phi),
    Math.cos(theta),
  ];

  // Meridians (constant φ).
  for (let m = 0; m < 12; m++) {
    const phi = (m * Math.PI) / 6;
    for (let i = 0; i < SEG; i++) {
      const t0 = (i * 2 * Math.PI) / SEG, t1 = ((i + 1) * 2 * Math.PI) / SEG;
      seg(sph(t0, phi), sph(t1, phi), MESH);
    }
  }
  // Parallels (constant θ).
  for (let p = 1; p < 12; p++) {
    const theta = (p * Math.PI) / 12;
    const col = Math.abs(theta - Math.PI / 2) < 1e-6 ? EQ : MESH;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i * 2 * Math.PI) / SEG, a1 = ((i + 1) * 2 * Math.PI) / SEG;
      seg(sph(theta, a0), sph(theta, a1), col);
    }
  }
  // Axes (slightly past the surface).
  const e = 1.18;
  seg([-e, 0, 0], [e, 0, 0], AX.x);
  seg([0, -e, 0], [0, e, 0], AX.y);
  seg([0, 0, -e], [0, 0, e], AX.z);
  return new Float32Array(v);
}

type V3 = [number, number, number];
const GOLD = [1.0, 0.82, 0.2];

function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: V3): V3 { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

/** Faded trajectory trail (cool, recedes with age) + the bright spin arrow. */
export function buildDynamic(vec: V3, trajectory: V3[], showTrail: boolean): Float32Array {
  const v: number[] = [];
  const push = (a: number[], b: number[], col: number[]) => v.push(a[0], a[1], a[2], ...col, b[0], b[1], b[2], ...col);

  // Trail: cool teal, older segments fade toward black so the spin stands out.
  if (showTrail)
    for (let i = 1; i < trajectory.length; i++) {
      const t = i / trajectory.length;
      const f = 0.12 + 0.45 * t;
      push(trajectory[i - 1], trajectory[i], [0.18 * f, 0.5 * f, 0.62 * f]);
    }

  // Spin arrow: gold shaft + 3D arrowhead cone at the tip.
  const dir = norm(vec);
  const headLen = 0.16, headR = 0.055;
  const base: V3 = [vec[0] - dir[0] * headLen, vec[1] - dir[1] * headLen, vec[2] - dir[2] * headLen];
  push([0, 0, 0], base, GOLD);
  const up: V3 = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const side = norm(cross(dir, up));
  const up2 = norm(cross(side, dir));
  const N = 12;
  const ring: V3[] = [];
  for (let k = 0; k < N; k++) {
    const a = (k * 2 * Math.PI) / N;
    ring.push([
      base[0] + (Math.cos(a) * side[0] + Math.sin(a) * up2[0]) * headR,
      base[1] + (Math.cos(a) * side[1] + Math.sin(a) * up2[1]) * headR,
      base[2] + (Math.cos(a) * side[2] + Math.sin(a) * up2[2]) * headR,
    ]);
  }
  for (let k = 0; k < N; k++) {
    push(ring[k], vec, GOLD);            // side to apex
    push(ring[k], ring[(k + 1) % N], GOLD); // base ring
  }
  return new Float32Array(v);
}

/** Live pulse preview: the rotation axis (both directions) + the ghost arc. */
export function buildPreview(axis: [number, number, number], ghost: [number, number, number][]): Float32Array {
  const v: number[] = [];
  const push = (a: number[], b: number[], col: number[]) => v.push(a[0], a[1], a[2], ...col, b[0], b[1], b[2], ...col);
  const axCol = [0.3, 0.85, 0.95];
  const e = 1.15;
  push([-axis[0] * e, -axis[1] * e, -axis[2] * e], [axis[0] * e, axis[1] * e, axis[2] * e], axCol);
  const gCol = [0.4, 0.95, 1.0];
  for (let i = 1; i < ghost.length; i++) push(ghost[i - 1], ghost[i], gCol);
  return new Float32Array(v);
}
