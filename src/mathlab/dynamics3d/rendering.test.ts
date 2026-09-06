import { describe, it, expect } from "vitest";
import type { BodyType } from "./types.ts";
import {
  getBodyVisualProfile, renderRadius, selectLOD, effectiveRenderMode, DEFAULT_VISUAL,
  planetPalette, defaultPlanetVariant, PLANET_VARIANTS,
} from "./rendering.ts";

describe("getBodyVisualProfile (§37)", () => {
  it("maps every body type to a profile", () => {
    const types: BodyType[] = ["particle", "planet", "star", "black-hole", "singularity"];
    for (const t of types) expect(getBodyVisualProfile(t).shader).toBe(t === "particle" ? "point" : t);
  });
  it("stars are emissive, planets are not", () => {
    expect(getBodyVisualProfile("star").emissive).toBe(true);
    expect(getBodyVisualProfile("planet").emissive).toBe(false);
  });
  it("black hole carries a disk geometry", () => {
    expect(getBodyVisualProfile("black-hole").geometry).toBe("sphere+disk");
  });
});

describe("renderRadius — display vs physical (§20/§35)", () => {
  it("floors tiny bodies so they stay visible", () => {
    expect(renderRadius(0.001, 1)).toBeGreaterThanOrEqual(0.15);
  });
  it("scales with the user scale, not the physics", () => {
    expect(renderRadius(2, 2)).toBeCloseTo(4, 9);
  });
  it("keeps a large physical radius (floor does not shrink it)", () => {
    expect(renderRadius(5, 1)).toBeCloseTo(5, 9);
  });
});

describe("selectLOD (§21/§22)", () => {
  it("more on-screen size ⇒ at least as much detail (monotonic, medium)", () => {
    const order = { point: 0, billboard: 1, simple: 2, full: 3 } as const;
    let prev = -1;
    for (const px of [1, 3, 8, 20, 60]) {
      const lvl = order[selectLOD(px, "auto", 4)];
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });
  it("a crowded scene lowers detail for the same pixel size", () => {
    const few = selectLOD(6, "auto", 4);
    const many = selectLOD(6, "auto", 800);
    const order = { point: 0, billboard: 1, simple: 2, full: 3 } as const;
    expect(order[many]).toBeLessThanOrEqual(order[few]);
  });
  it("low quality never returns full; high reaches full at small sizes", () => {
    expect(selectLOD(1000, "low", 1)).not.toBe("full");
    expect(selectLOD(10, "high", 1)).toBe("full");
  });
});

describe("planet variants", () => {
  it("every variant has a palette", () => {
    for (const v of PLANET_VARIANTS) expect(typeof planetPalette(v).ocean).toBe("string");
  });
  it("distinct variants differ visually", () => {
    expect(planetPalette("earth").continents).toBe(true);
    expect(planetPalette("gas-giant").bands).toBe(true);
    expect(planetPalette("lava").cracks).toBe(true);
    expect(planetPalette("ringed").rings).toBe(true);
    expect(planetPalette("rocky").craters).toBe(true);
  });
  it("defaultPlanetVariant cycles deterministically", () => {
    expect(defaultPlanetVariant(0)).toBe(defaultPlanetVariant(PLANET_VARIANTS.length));
    expect(defaultPlanetVariant(0)).not.toBe(defaultPlanetVariant(1));
  });
});

describe("effectiveRenderMode (§23)", () => {
  it("performance mode forces minimal", () => {
    expect(effectiveRenderMode({ ...DEFAULT_VISUAL, renderMode: "celestial", performanceMode: true })).toBe("minimal");
  });
  it("otherwise respects the chosen mode", () => {
    expect(effectiveRenderMode({ ...DEFAULT_VISUAL, renderMode: "celestial", performanceMode: false })).toBe("celestial");
  });
});
