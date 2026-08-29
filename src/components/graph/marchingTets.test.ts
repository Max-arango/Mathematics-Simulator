import { describe, it, expect } from "vitest";
import { marchingTets } from "./marchingTets.ts";

const bounds = { xmin: -3, xmax: 3, ymin: -3, ymax: 3, zmin: -3, zmax: 3 };

describe("marchingTets", () => {
  it("extracts a sphere x²+y²+z²−4=0: every vertex lies near r=2", () => {
    const g = (x: number, y: number, z: number) => x * x + y * y + z * z - 4;
    const tris = marchingTets(g, bounds, 32);
    expect(tris.length).toBeGreaterThan(0);
    expect(tris.length % 18).toBe(0); // 3 verts * 6 floats per triangle
    let maxErr = 0;
    for (let i = 0; i < tris.length; i += 6) {
      const r = Math.hypot(tris[i], tris[i + 1], tris[i + 2]);
      maxErr = Math.max(maxErr, Math.abs(r - 2));
    }
    expect(maxErr).toBeLessThan(0.2);
  });

  it("normals point roughly radially outward on the sphere", () => {
    const g = (x: number, y: number, z: number) => x * x + y * y + z * z - 4;
    const tris = marchingTets(g, bounds, 24);
    let aligned = 0, total = 0;
    for (let i = 0; i < tris.length; i += 6) {
      const px = tris[i], py = tris[i + 1], pz = tris[i + 2];
      const nx = tris[i + 3], ny = tris[i + 4], nz = tris[i + 5];
      const rl = Math.hypot(px, py, pz) || 1;
      if ((px * nx + py * ny + pz * nz) / rl > 0.9) aligned++;
      total++;
    }
    expect(aligned / total).toBeGreaterThan(0.95);
  });

  it("returns nothing when g has no zero crossing in the box", () => {
    const tris = marchingTets((x, y, z) => x * x + y * y + z * z + 10, bounds, 16);
    expect(tris.length).toBe(0);
  });
});
