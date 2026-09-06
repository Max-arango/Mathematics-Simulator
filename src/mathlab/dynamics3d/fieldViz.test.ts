import { describe, it, expect } from "vitest";
import { distance } from "../linear/vector.ts";
import type { Body3D, FieldParams, Vec3 } from "./types.ts";
import { sampleFieldGridZ, potentialSurfaceZ, traceFieldLine } from "./fieldViz.ts";

const P: FieldParams = { G: 1, softening: 0.05 };
const star: Body3D = {
  id: "s", name: "Star", position: [0, 0, 0], velocity: [0, 0, 0], acceleration: [0, 0, 0],
  mass: 100, radius: 0.5, gravitationalStrength: 1, type: "star", active: true,
};

describe("sampleFieldGridZ", () => {
  it("returns n×n samples", () => {
    expect(sampleFieldGridZ([star], P, 10, 7).length).toBe(49);
  });
  it("field points toward the central mass", () => {
    const samples = sampleFieldGridZ([star], P, 10, 5);
    for (const s of samples) {
      if (s.mag < 1e-6) continue;
      // g should point roughly from the sample toward the origin: g · (−pos) > 0
      const dot = s.g[0] * -s.pos[0] + s.g[1] * -s.pos[1];
      expect(dot).toBeGreaterThan(0);
    }
  });
});

describe("potentialSurfaceZ", () => {
  it("dips (z<0) and deepens toward the mass", () => {
    const surf = potentialSurfaceZ([star], P, 10, 11, 0.05);
    expect(surf.length).toBe(11);
    const center = surf[5][5].z;       // nearest the mass
    const corner = surf[0][0].z;       // far
    expect(center).toBeLessThan(0);
    expect(center).toBeLessThan(corner);
  });
});

describe("traceFieldLine", () => {
  it("flows toward the mass (distance decreases)", () => {
    const seed: Vec3 = [8, 0, 0];
    const line = traceFieldLine(seed, [star], P, { steps: 40, ds: 0.5 });
    expect(line.length).toBeGreaterThan(2);
    expect(distance(line[line.length - 1], star.position)).toBeLessThan(distance(seed, star.position));
  });
});
