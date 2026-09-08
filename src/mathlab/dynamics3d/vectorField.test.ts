import { describe, it, expect } from "vitest";
import {
  buildFieldSystem, integrateStreamlines, streamlineBounds, sampleFieldArrows,
  FIELD_PRESETS, type Vec3,
} from "./vectorField.ts";
import { InvalidInputError } from "../core/errors.ts";

describe("vectorField / buildFieldSystem", () => {
  it("builds a continuous 3-var system from a spec", () => {
    const sys = buildFieldSystem({ field: ["y", "-x", "-z"], params: {} });
    expect(sys.vars).toEqual(["x", "y", "z"]);
    expect(sys.kind).toBe("continuous");
    expect(sys.field.length).toBe(3);
  });

  it("throws on an unknown symbol (surfaced to UI, never crashes)", () => {
    expect(() => buildFieldSystem({ field: ["w", "x", "y"], params: {} })).toThrow(InvalidInputError);
  });

  it("binds named params (Lorenz uses sigma/rho/beta)", () => {
    const sys = buildFieldSystem({ field: ["sigma*(y-x)", "x*(rho-z)-y", "x*y-beta*z"], params: { sigma: 10, rho: 28, beta: 2.5 } });
    expect(sys.params.rho).toBe(28);
  });
});

describe("vectorField / integrateStreamlines", () => {
  it("pure rotation F=(-y,x,0) conserves the xy-radius (analytic circle)", () => {
    const sys = buildFieldSystem({ field: ["-y", "x", "0"], params: {} });
    const seed: Vec3 = [3, 0, 1];
    const [line] = integrateStreamlines(sys, [seed], 2 * Math.PI, 4000);
    expect(line.diverged).toBe(false);
    const r0 = Math.hypot(seed[0], seed[1]);
    for (const p of line.points) {
      expect(Math.hypot(p[0], p[1])).toBeCloseTo(r0, 2); // radius preserved
      expect(p[2]).toBeCloseTo(1, 6);                     // z' = 0 ⇒ z fixed
    }
    // after one full period returns near the seed.
    const last = line.points[line.points.length - 1];
    expect(last[0]).toBeCloseTo(seed[0], 2);
    expect(last[1]).toBeCloseTo(seed[1], 2);
  });

  it("stable spiral sink pulls trajectories toward the origin", () => {
    const sys = buildFieldSystem({ field: ["-0.3*x - y", "x - 0.3*y", "-0.5*z"], params: {} });
    const [line] = integrateStreamlines(sys, [[10, 0, 8]], 30, 3000);
    const last = line.points[line.points.length - 1];
    expect(Math.hypot(last[0], last[1], last[2])).toBeLessThan(1);
  });

  it("linear saddle diverges along the unstable x-direction (stays finite over short T)", () => {
    const sys = buildFieldSystem({ field: ["x", "-y", "-z"], params: {} });
    const [line] = integrateStreamlines(sys, [[0.1, 5, 5]], 4, 1500);
    const last = line.points[line.points.length - 1];
    expect(Math.abs(last[0])).toBeGreaterThan(Math.abs(0.1) * 10); // grew ~e^4 ≈ 54×
    expect(Math.abs(last[1])).toBeLessThan(5);                     // decayed
  });

  it("Lorenz stays bounded on its attractor (no blow-up)", () => {
    const p = FIELD_PRESETS.find((x) => x.id === "lorenz")!;
    const sys = buildFieldSystem(p);
    const lines = integrateStreamlines(sys, [p.seeds[0]], p.tEnd, p.steps);
    const line = lines[0];
    expect(line.diverged).toBe(false);
    for (const q of line.points) {
      expect(Math.abs(q[0])).toBeLessThan(60);
      expect(Math.abs(q[1])).toBeLessThan(90);
      expect(q[2]).toBeGreaterThan(-5);
      expect(q[2]).toBeLessThan(90);
    }
  });
});

describe("vectorField / helpers", () => {
  it("sampleFieldArrows returns unit directions on a finite grid", () => {
    const sys = buildFieldSystem({ field: ["-y", "x", "-0.1*z"], params: {} });
    const arrows = sampleFieldArrows(sys, [0, 0, 0], 5, 3);
    expect(arrows.length).toBeGreaterThan(0);
    expect(arrows.length).toBeLessThanOrEqual(27);
    for (const a of arrows) expect(Math.hypot(a.dir[0], a.dir[1], a.dir[2])).toBeCloseTo(1, 9);
  });

  it("streamlineBounds returns a sane center/radius, with a fallback for empty input", () => {
    const sys = buildFieldSystem({ field: ["-y", "x", "0"], params: {} });
    const lines = integrateStreamlines(sys, [[4, 0, 0]], 2 * Math.PI, 2000);
    const b = streamlineBounds(lines);
    expect(b.center[0]).toBeCloseTo(0, 1);
    expect(b.center[1]).toBeCloseTo(0, 1);
    expect(b.radius).toBeGreaterThan(3);
    expect(streamlineBounds([])).toEqual({ center: [0, 0, 0], radius: 10 });
  });

  it("every preset builds and integrates its first seed without throwing", () => {
    for (const p of FIELD_PRESETS) {
      const sys = buildFieldSystem(p);
      const lines = integrateStreamlines(sys, [p.seeds[0]], Math.min(p.tEnd, 8), Math.min(p.steps, 800));
      expect(lines[0].points.length).toBeGreaterThan(1);
    }
  });
});
