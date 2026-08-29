import { describe, it, expect } from "vitest";
import { rotate4, project4to3, ZERO_ANGLES, type Vec4 } from "./vec4.ts";
import { POLYTOPES } from "./shapes.ts";
import { buildParametric, PARAM_PRESETS } from "./parametric.ts";

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("rotate4", () => {
  it("xw rotation by 90° maps (1,0,0,0) → (0,0,0,1)", () => {
    const r = rotate4([1, 0, 0, 0], { ...ZERO_ANGLES, xw: Math.PI / 2 });
    near(r[0], 0); near(r[3], 1);
  });
  it("preserves length (rotations are isometries)", () => {
    const v: Vec4 = [1, 2, -1, 0.5];
    const r = rotate4(v, { xy: 0.3, xz: -0.7, xw: 1.1, yz: 0.2, yw: -0.4, zw: 0.9 });
    near(Math.hypot(...r), Math.hypot(...v));
  });
});

describe("project4to3", () => {
  it("points with larger w loom larger (scale d/(d−w))", () => {
    const near0 = project4to3([1, 0, 0, 0], 3);   // scale 1
    const nearW = project4to3([1, 0, 0, 1], 3);   // scale 3/2
    near(near0[0], 1);
    near(nearW[0], 1.5);
  });
  it("carries w through for coloring", () => {
    expect(project4to3([0, 0, 0, 0.7], 3)[3]).toBe(0.7);
  });
});

describe("polytopes", () => {
  it("tesseract has 16 vertices and 32 edges", () => {
    const s = POLYTOPES.tesseract();
    expect(s.vertices).toHaveLength(16);
    expect(s.edges).toHaveLength(32);
  });
  it("5-cell has 5 vertices, 10 edges, and is regular (equal edge lengths)", () => {
    const s = POLYTOPES.cell5();
    expect(s.vertices).toHaveLength(5);
    expect(s.edges).toHaveLength(10);
    const len = ([i, j]: [number, number]) => Math.hypot(...s.vertices[i].map((c, k) => c - s.vertices[j][k]));
    const l0 = len(s.edges[0]);
    for (const e of s.edges) near(len(e), l0);
  });
  it("16-cell has 8 vertices and 24 edges", () => {
    const s = POLYTOPES.cell16();
    expect(s.vertices).toHaveLength(8);
    expect(s.edges).toHaveLength(24);
  });
  it("24-cell has 24 vertices and 96 edges", () => {
    const s = POLYTOPES.cell24();
    expect(s.vertices).toHaveLength(24);
    expect(s.edges).toHaveLength(96);
  });
});

describe("parametric surface (shared parser)", () => {
  it("builds the Clifford torus on the unit 3-sphere (x²+y²+z²+w²=2)", () => {
    const { shape, error } = buildParametric(PARAM_PRESETS["Clifford torus"], 8);
    expect(error).toBeNull();
    for (const v of shape.vertices) near(v[0] ** 2 + v[1] ** 2 + v[2] ** 2 + v[3] ** 2, 2);
  });
  it("reports a parse error for a bad expression", () => {
    expect(buildParametric({ x: "cos(u", y: "0", z: "0", w: "0" }, 4).error).not.toBeNull();
  });
  it("every built-in preset parses and produces geometry", () => {
    for (const [name, e] of Object.entries(PARAM_PRESETS)) {
      const { shape, error } = buildParametric(e, 6);
      expect(error, name).toBeNull();
      expect(shape.vertices.length, name).toBeGreaterThan(0);
    }
  });
});
