import { describe, it, expect } from "vitest";
import { classifySurface, homeomorphicSurfaces } from "./topology.ts";
import { SURFACES } from "./surfaces.ts";

describe("classifySurface", () => {
  it("sphere genus 0, torus genus 1", () => {
    expect(classifySurface("sphere").genus).toBe(0);
    expect(classifySurface("torus").genus).toBe(1);
  });
});

describe("homeomorphicSurfaces (classification theorem, computed χ)", () => {
  it("sphere ↔ cube: homeomorphic (both χ=2)", () => {
    expect(homeomorphicSurfaces("sphere", "cube").homeomorphic).toBe(true);
  });
  it("torus ↔ mug: homeomorphic (both χ=0)", () => {
    expect(homeomorphicSurfaces("torus", "mug").homeomorphic).toBe(true);
  });
  it("sphere ↔ torus: not homeomorphic (χ 2 vs 0)", () => {
    expect(homeomorphicSurfaces("sphere", "torus").homeomorphic).toBe(false);
  });
});

describe("FINDING-001/003 regression: computed genus backs the declared label", () => {
  for (const s of SURFACES) {
    it(`${s.id}: computed genus === declared ${s.genus}`, () => {
      expect(classifySurface(s.id).genus).toBe(s.genus);
    });
  }
});
