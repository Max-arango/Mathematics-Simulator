import { RANGE, type Surface, type Vec3, type Domain } from "./surfaces.ts";

export interface Bump { u: number; v: number; amp: number; sigma: number }

/** Global topology-preserving deformations applied after morphing. */
export interface DeformOpts { inflate?: number; twist?: number }

export interface TopoMesh {
  interleaved: Float32Array; // [x,y,z, nx,ny,nz] per vertex (shading normals)
  indices: Uint32Array;
  gridPos: Float32Array;     // world position per grid vertex (for picking)
  gu: Float32Array;          // u of each grid vertex
  gv: Float32Array;          // v of each grid vertex
  n: number;                 // grid resolution (vertices per side = n+1)
}

const smooth = (t: number) => t * t * (3 - 2 * t);

// Shortest distance between angles a,b on a period-P circle.
function wrap(a: number, b: number, period: number): number {
  let d = Math.abs(a - b) % period;
  if (d > period / 2) d = period - d;
  return d;
}

/**
 * Build a shaded mesh of surface `src`, optionally morphed toward `dst`
 * (fraction t, only if same domain), plus grab-deformation bumps displaced
 * along the surface normal. Bumps never change topology — they are a
 * continuous self-deformation.
 */
export function buildTopoMesh(src: Surface, dst: Surface | null, t: number, bumps: Bump[], res: number, opts: DeformOpts = {}): TopoMesh {
  const inflate = opts.inflate ?? 0;
  const twist = opts.twist ?? 0;
  const domain: Domain = src.domain;
  const { uMax, vMax } = RANGE[domain];
  const morph = dst && dst.domain === domain ? smooth(t) : 0;
  const target = morph > 0 ? dst! : null;

  const base = (u: number, v: number): Vec3 => {
    const a = src.fn(u, v);
    if (!target) return a;
    const b = target.fn(u, v);
    return [a[0] + (b[0] - a[0]) * morph, a[1] + (b[1] - a[1]) * morph, a[2] + (b[2] - a[2]) * morph];
  };

  const hu = uMax / res * 0.5, hv = vMax / res * 0.5;
  const baseNormal = (u: number, v: number): Vec3 => {
    const pu1 = base(u + hu, v), pu0 = base(u - hu, v);
    const pv1 = base(u, v + hv), pv0 = base(u, v - hv);
    const du: Vec3 = [pu1[0] - pu0[0], pu1[1] - pu0[1], pu1[2] - pu0[2]];
    const dv: Vec3 = [pv1[0] - pv0[0], pv1[1] - pv0[1], pv1[2] - pv0[2]];
    let nx = du[1] * dv[2] - du[2] * dv[1];
    let ny = du[2] * dv[0] - du[0] * dv[2];
    let nz = du[0] * dv[1] - du[1] * dv[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };

  const displacement = (u: number, v: number): number => {
    let d = 0;
    for (const b of bumps) {
      const du = wrap(u, b.u, 2 * Math.PI); // u periodic for torus; harmless on sphere
      const dv = wrap(v, b.v, vMax);
      d += b.amp * Math.exp(-(du * du + dv * dv) / (2 * b.sigma * b.sigma));
    }
    return d;
  };

  const n = res;
  const w = n + 1;
  const gridPos = new Float32Array(w * w * 3);
  const gu = new Float32Array(w * w), gv = new Float32Array(w * w);
  const uAt = (i: number) => (i * uMax) / n;
  const vAt = (j: number) => (j * vMax) / n;

  for (let j = 0; j < w; j++)
    for (let i = 0; i < w; i++) {
      const u = uAt(i), v = vAt(j);
      const p = base(u, v);
      const disp = (bumps.length ? displacement(u, v) : 0) + inflate;
      let x = p[0], y = p[1], z = p[2];
      if (disp) { const nrm = baseNormal(u, v); x += nrm[0] * disp; y += nrm[1] * disp; z += nrm[2] * disp; }
      if (twist) {
        const a = twist * z, c = Math.cos(a), sN = Math.sin(a);
        const nx = x * c - y * sN, ny = x * sN + y * c;
        x = nx; y = ny;
      }
      const k = j * w + i;
      gridPos[k * 3] = x; gridPos[k * 3 + 1] = y; gridPos[k * 3 + 2] = z;
      gu[k] = u; gv[k] = v;
    }

  const idx: number[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }

  // Smooth vertex normals by accumulating face normals. Coincident vertices are
  // merged into a shared "representative" so seams (periodic edges) and poles
  // (collapsed rows) get one consistent normal — no seam line, no pole spikes.
  const torus = domain === "torus";
  const northRep = (n - 1) * n, southRep = northRep + 1;
  const nReps = torus ? n * n : (n - 1) * n + 2;
  const repOf = (i: number, j: number): number => {
    if (torus) return (j % n) * n + (i % n);
    const jj = j % n;
    if (i === 0) return northRep;
    if (i === n) return southRep;
    return (i - 1) * n + jj;
  };
  const repIndex = new Int32Array(w * w);
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) repIndex[j * w + i] = repOf(i, j);

  const repN = new Float32Array(nReps * 3);
  const acc = (rep: number, x: number, y: number, z: number) => { repN[rep * 3] += x; repN[rep * 3 + 1] += y; repN[rep * 3 + 2] += z; };
  for (let t3 = 0; t3 < idx.length; t3 += 3) {
    const ka = idx[t3], kb = idx[t3 + 1], kc = idx[t3 + 2];
    const ax = gridPos[ka * 3], ay = gridPos[ka * 3 + 1], az = gridPos[ka * 3 + 2];
    const e1x = gridPos[kb * 3] - ax, e1y = gridPos[kb * 3 + 1] - ay, e1z = gridPos[kb * 3 + 2] - az;
    const e2x = gridPos[kc * 3] - ax, e2y = gridPos[kc * 3 + 1] - ay, e2z = gridPos[kc * 3 + 2] - az;
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x; // area-weighted
    acc(repIndex[ka], fx, fy, fz); acc(repIndex[kb], fx, fy, fz); acc(repIndex[kc], fx, fy, fz);
  }
  for (let r = 0; r < nReps; r++) {
    const l = Math.hypot(repN[r * 3], repN[r * 3 + 1], repN[r * 3 + 2]) || 1;
    repN[r * 3] /= l; repN[r * 3 + 1] /= l; repN[r * 3 + 2] /= l;
  }

  const interleaved = new Float32Array(w * w * 6);
  for (let k = 0; k < w * w; k++) {
    const r = repIndex[k];
    interleaved[k * 6] = gridPos[k * 3]; interleaved[k * 6 + 1] = gridPos[k * 3 + 1]; interleaved[k * 6 + 2] = gridPos[k * 3 + 2];
    interleaved[k * 6 + 3] = repN[r * 3]; interleaved[k * 6 + 4] = repN[r * 3 + 1]; interleaved[k * 6 + 5] = repN[r * 3 + 2];
  }

  return { interleaved, indices: new Uint32Array(idx), gridPos, gu, gv, n };
}
