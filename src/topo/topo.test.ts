import { describe, it, expect } from "vitest";
import { SURFACES, SURFACE_BY_ID, RANGE, eulerChar, homeomorphic, type Surface } from "./surfaces.ts";
import { buildTopoMesh } from "./mesh.ts";

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// A closed surface must actually close up over its parameter domain:
//  - torus domain: fn periodic in u AND v (no torn seam)
//  - sphere domain: fn(0,·) and fn(π,·) each collapse to a single pole point,
//    and fn is periodic in v.
describe("every surface is a properly closed manifold", () => {
  const vs = Array.from({ length: 12 }, (_, i) => (i / 12) * 2 * Math.PI);
  const check = (s: Surface) => {
    const { uMax, vMax } = RANGE[s.domain];
    if (s.domain === "torus") {
      for (const v of vs) expect(dist(s.fn(0, v), s.fn(uMax, v)), `${s.id} u-seam`).toBeLessThan(1e-9);
      for (const u of vs) expect(dist(s.fn(u, 0), s.fn(u, vMax)), `${s.id} v-seam`).toBeLessThan(1e-9);
    } else {
      const p0 = s.fn(0, 0), pP = s.fn(uMax, 0);
      for (const v of vs) {
        expect(dist(s.fn(0, v), p0), `${s.id} north pole`).toBeLessThan(1e-9);
        expect(dist(s.fn(uMax, v), pP), `${s.id} south pole`).toBeLessThan(1e-9);
      }
      for (const u of [0.5, 1.2, 2.0]) expect(dist(s.fn(u, 0), s.fn(u, vMax)), `${s.id} v-seam`).toBeLessThan(1e-9);
    }
  };
  for (const s of SURFACES) it(s.id, () => check(s));
});

const near = (a: number, b: number, p = 5) => expect(a).toBeCloseTo(b, p);

describe("topological invariants", () => {
  it("genus 0 → χ = 2, genus 1 → χ = 0", () => {
    expect(eulerChar(0)).toBe(2);
    expect(eulerChar(1)).toBe(0);
  });
  it("homeomorphic iff same genus", () => {
    expect(homeomorphic(SURFACE_BY_ID.sphere, SURFACE_BY_ID.cube)).toBe(true);
    expect(homeomorphic(SURFACE_BY_ID.torus, SURFACE_BY_ID.mug)).toBe(true);
    expect(homeomorphic(SURFACE_BY_ID.plate, SURFACE_BY_ID.bowl)).toBe(true);   // everyday genus-0
    expect(homeomorphic(SURFACE_BY_ID.cd, SURFACE_BY_ID.torus)).toBe(true);     // everyday genus-1
    expect(homeomorphic(SURFACE_BY_ID.plate, SURFACE_BY_ID.cd)).toBe(false);    // plate vs CD: hole!
  });
  it("domain is consistent with genus (sphere→0, torus→1)", () => {
    for (const s of SURFACES) expect(s.domain === "sphere" ? 0 : 1, s.id).toBe(s.genus);
  });
});

describe("mesh + morph", () => {
  it("sphere mesh: every vertex on the unit sphere, normals point outward", () => {
    const m = buildTopoMesh(SURFACE_BY_ID.sphere, null, 0, [], 24);
    const w = m.n + 1;
    for (let k = 0; k < w * w; k++) {
      const x = m.gridPos[k * 3], y = m.gridPos[k * 3 + 1], z = m.gridPos[k * 3 + 2];
      near(Math.hypot(x, y, z), 1, 4);
      const nx = m.interleaved[k * 6 + 3], ny = m.interleaved[k * 6 + 4], nz = m.interleaved[k * 6 + 5];
      // skip the poles where the parametric grid degenerates
      if (Math.abs(z) < 0.98) expect(x * nx + y * ny + z * nz).toBeGreaterThan(0);
    }
  });

  it("morph endpoints match the source (t=0) and target (t=1)", () => {
    const a = buildTopoMesh(SURFACE_BY_ID.sphere, SURFACE_BY_ID.cube, 0, [], 12);
    const src = buildTopoMesh(SURFACE_BY_ID.sphere, null, 0, [], 12);
    for (let i = 0; i < a.gridPos.length; i++) near(a.gridPos[i], src.gridPos[i], 4);

    const b = buildTopoMesh(SURFACE_BY_ID.sphere, SURFACE_BY_ID.cube, 1, [], 12);
    const dst = buildTopoMesh(SURFACE_BY_ID.cube, null, 0, [], 12);
    for (let i = 0; i < b.gridPos.length; i++) near(b.gridPos[i], dst.gridPos[i], 4);
  });

  it("a grab bump displaces the surface locally", () => {
    const plain = buildTopoMesh(SURFACE_BY_ID.torus, null, 0, [], 24);
    const bumped = buildTopoMesh(SURFACE_BY_ID.torus, null, 0, [{ u: 0, v: 0, amp: 0.5, sigma: 0.5 }], 24);
    let moved = 0;
    for (let i = 0; i < plain.gridPos.length; i++) if (Math.abs(plain.gridPos[i] - bumped.gridPos[i]) > 1e-4) moved++;
    expect(moved).toBeGreaterThan(0); // some vertices moved
  });

  it("normals are unit everywhere, and seams/poles share a normal (no artifacts)", () => {
    const nrm = (m: ReturnType<typeof buildTopoMesh>, k: number) =>
      [m.interleaved[k * 6 + 3], m.interleaved[k * 6 + 4], m.interleaved[k * 6 + 5]];
    // torus: seam vertices (i=0) and (i=n) must carry identical normals
    const tor = buildTopoMesh(SURFACE_BY_ID.torus, null, 0, [], 20);
    const w = tor.n + 1;
    for (let k = 0; k < w * w; k++) near(Math.hypot(...nrm(tor, k)), 1, 4);
    for (let j = 0; j < w; j++) {
      const a = nrm(tor, j * w + 0), b = nrm(tor, j * w + tor.n);
      for (let c = 0; c < 3; c++) near(a[c], b[c], 6);
    }
    // sphere: the north pole (u=0 → grid column i=0, all j) shares one normal
    const sph = buildTopoMesh(SURFACE_BY_ID.sphere, null, 0, [], 20);
    const sw = sph.n + 1;
    const p0 = nrm(sph, 0);
    for (let j = 0; j < sw; j++) for (let c = 0; c < 3; c++) near(nrm(sph, j * sw + 0)[c], p0[c], 6);
  });

  it("inflate grows the surface and twist rotates it (topology-preserving)", () => {
    const base = buildTopoMesh(SURFACE_BY_ID.sphere, null, 0, [], 24);
    const inflated = buildTopoMesh(SURFACE_BY_ID.sphere, null, 0, [], 24, { inflate: 0.3 });
    const mid = (12 * 25 + 12) * 3; // an equatorial vertex (not a pole)
    const rBase = Math.hypot(base.gridPos[mid], base.gridPos[mid + 1], base.gridPos[mid + 2]);
    const rInfl = Math.hypot(inflated.gridPos[mid], inflated.gridPos[mid + 1], inflated.gridPos[mid + 2]);
    expect(rInfl).toBeGreaterThan(rBase);

    const twisted = buildTopoMesh(SURFACE_BY_ID.torus, null, 0, [], 24, { twist: 1.5 });
    const plain = buildTopoMesh(SURFACE_BY_ID.torus, null, 0, [], 24);
    let moved = 0;
    for (let i = 0; i < plain.gridPos.length; i++) if (Math.abs(plain.gridPos[i] - twisted.gridPos[i]) > 1e-3) moved++;
    expect(moved).toBeGreaterThan(0);
  });
});
