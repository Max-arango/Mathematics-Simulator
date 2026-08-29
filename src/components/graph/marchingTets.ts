// Isosurface extraction for implicit surfaces g(x,y,z)=0 via marching
// tetrahedra (each cube split into 6 tets — tiny case logic, watertight, no
// 256-entry table). Returns interleaved triangle vertices [x,y,z, nx,ny,nz].
// Normals come from the numerical gradient of g, so shading works for any
// winding (the surface shader uses |dot(n,L)|).

type G = (x: number, y: number, z: number) => number;

// 6-tetrahedron decomposition of a cube (corner indices), all sharing edge 0–6.
const TETS = [
  [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6],
  [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6],
];
// Unit-cube corner offsets.
const C = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];

export interface Bounds { xmin: number; xmax: number; ymin: number; ymax: number; zmin: number; zmax: number }

export function marchingTets(g: G, b: Bounds, res: number): Float32Array {
  const nx = res, ny = res, nz = res;
  const dx = (b.xmax - b.xmin) / nx, dy = (b.ymax - b.ymin) / ny, dz = (b.zmax - b.zmin) / nz;
  const gx = (i: number) => b.xmin + i * dx;
  const gy = (j: number) => b.ymin + j * dy;
  const gz = (k: number) => b.zmin + k * dz;

  // Precompute the scalar field on the (res+1)^3 lattice (NaN -> large +).
  const field = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  const fi = (i: number, j: number, k: number) => (k * (ny + 1) + j) * (nx + 1) + i;
  for (let k = 0; k <= nz; k++)
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        const val = g(gx(i), gy(j), gz(k));
        field[fi(i, j, k)] = Number.isFinite(val) ? val : 1e9;
      }

  const h = Math.min(dx, dy, dz) * 0.5;
  const grad = (x: number, y: number, z: number): [number, number, number] => {
    let nX = (g(x + h, y, z) - g(x - h, y, z)) / (2 * h);
    let nY = (g(x, y + h, z) - g(x, y - h, z)) / (2 * h);
    let nZ = (g(x, y, z + h) - g(x, y, z - h)) / (2 * h);
    const l = Math.hypot(nX, nY, nZ) || 1;
    nX /= l; nY /= l; nZ /= l;
    return [nX, nY, nZ];
  };

  const out: number[] = [];
  const emit = (p: [number, number, number]) => {
    const n = grad(p[0], p[1], p[2]);
    out.push(p[0], p[1], p[2], n[0], n[1], n[2]);
  };
  // Linear interpolation to the g=0 crossing on edge (pa,pb).
  const cross = (pa: [number, number, number], va: number, pb: [number, number, number], vb: number): [number, number, number] => {
    const t = va / (va - vb);
    return [pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1]), pa[2] + t * (pb[2] - pa[2])];
  };

  const cp = [0, 0, 0, 0, 0, 0, 0, 0].map(() => [0, 0, 0] as [number, number, number]);
  const cv = new Float32Array(8);

  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        for (let c = 0; c < 8; c++) {
          const ci = i + C[c][0], cj = j + C[c][1], ck = k + C[c][2];
          cp[c][0] = gx(ci); cp[c][1] = gy(cj); cp[c][2] = gz(ck);
          cv[c] = field[fi(ci, cj, ck)];
        }
        for (const tet of TETS) marchTet(tet, cp, cv, cross, emit);
      }
  return new Float32Array(out);
}

function marchTet(
  tet: number[],
  cp: [number, number, number][],
  cv: Float32Array,
  cross: (pa: [number, number, number], va: number, pb: [number, number, number], vb: number) => [number, number, number],
  emit: (p: [number, number, number]) => void,
) {
  const inside: number[] = [], outside: number[] = [];
  for (const c of tet) (cv[c] < 0 ? inside : outside).push(c);
  const n = inside.length;
  if (n === 0 || n === 4) return;
  const P = (a: number, b: number) => cross(cp[a], cv[a], cp[b], cv[b]);

  if (n === 1 || n === 3) {
    // One vertex on the minority side → single triangle across its 3 edges.
    const solo = n === 1 ? inside[0] : outside[0];
    const others = tet.filter((c) => c !== solo);
    emit(P(solo, others[0])); emit(P(solo, others[1])); emit(P(solo, others[2]));
  } else {
    // Two vs two → quad (two triangles) across the four crossing edges.
    const [a0, a1] = inside, [b0, b1] = outside;
    const e00 = P(a0, b0), e01 = P(a0, b1), e11 = P(a1, b1), e10 = P(a1, b0);
    emit(e00); emit(e01); emit(e11);
    emit(e00); emit(e11); emit(e10);
  }
}
