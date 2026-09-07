import { describe, it, expect } from "vitest";
import { makeSystem } from "../dynamics/system.ts";
import { InvalidInputError } from "../core/errors.ts";
import type { Vec3 } from "./types.ts";
import {
  evalMathField3D,
  stepMathTrajectory3D,
  traceMathTrajectory3D,
  sampleMathFieldGrid3D,
} from "./mathField.ts";

describe("evalMathField3D", () => {
  const circular = makeSystem(["x", "y", "z"], ["y", "-x", "0"]);

  it("matches the known circular field (xy-rotation, z constant)", () => {
    expect(evalMathField3D(circular, [1, 0, 0])).toEqual([0, -1, 0]);
    const v = evalMathField3D(circular, [0, 1, 0]);
    expect(v[0]).toBe(1);
    expect(v[1]).toBeCloseTo(0, 10);
    expect(evalMathField3D(circular, [2, 3, 5])[2]).toBe(0);
  });

  it("throws on a non-3-variable system", () => {
    const sys2d = makeSystem(["x", "y"], ["y", "-x"]);
    expect(() => evalMathField3D(sys2d, [1, 0, 0] as unknown as Vec3)).toThrow(InvalidInputError);
  });
});

describe("stepMathTrajectory3D", () => {
  it("integrates a linear field to the analytically expected point (dx/dt=x, dy/dt=2y)", () => {
    const sys = makeSystem(["x", "y", "z"], ["x", "2*y", "0"]);
    const dt = 0.01;
    const { x1, t1 } = stepMathTrajectory3D(sys, [1, 1, 0], dt);
    expect(t1).toBeCloseTo(dt, 10);
    expect(x1[0]).toBeCloseTo(Math.exp(dt), 6);
    expect(x1[1]).toBeCloseTo(Math.exp(2 * dt), 6);
    expect(x1[2]).toBe(0);
  });

  it("dt<=0 is a no-op", () => {
    const sys = makeSystem(["x", "y", "z"], ["1", "1", "1"]);
    const { x1, t1 } = stepMathTrajectory3D(sys, [3, 4, 5], 0);
    expect(x1).toEqual([3, 4, 5]);
    expect(t1).toBe(0);
  });
});

describe("traceMathTrajectory3D", () => {
  it("conserves radius on the circular field (xy-plane rotation)", () => {
    const sys = makeSystem(["x", "y", "z"], ["y", "-x", "0"]);
    const { points, termination } = traceMathTrajectory3D(sys, [1, 0, 0], { dt: 0.01, maxSteps: 200 });
    expect(termination).toBe("max-steps");
    for (const p of points) {
      expect(Math.hypot(p[0], p[1])).toBeCloseTo(1, 2);
    }
  });

  it("terminates non-finite on division blow-up (dx/dt = 1/x)", () => {
    const sys = makeSystem(["x", "y", "z"], ["1/x", "0", "0"]);
    const { termination } = traceMathTrajectory3D(sys, [0, 0, 0], { dt: 0.1, maxSteps: 10 });
    expect(termination).toBe("non-finite");
  });

  it("terminates escaped once outside bounds", () => {
    const sys = makeSystem(["x", "y", "z"], ["10", "0", "0"]);
    const { termination, points } = traceMathTrajectory3D(sys, [0, 0, 0], {
      dt: 1, maxSteps: 50, bounds: { min: [-5, -5, -5], max: [5, 5, 5] },
    });
    expect(termination).toBe("escaped");
    expect(points.length).toBeLessThan(50);
  });
});

describe("sampleMathFieldGrid3D", () => {
  it("returns resolution^3 points and matching vectors", () => {
    const sys = makeSystem(["x", "y", "z"], ["y", "-x", "0"]);
    const { points, vectors } = sampleMathFieldGrid3D(
      sys, { min: [-1, -1, -1], max: [1, 1, 1] }, 3,
    );
    expect(points.length).toBe(27);
    expect(vectors.length).toBe(27);
    // sanity: vector at each point matches a direct eval
    expect(vectors[0]).toEqual(evalMathField3D(sys, points[0]));
  });

  it("rejects a non-positive-integer resolution", () => {
    const sys = makeSystem(["x", "y", "z"], ["y", "-x", "0"]);
    expect(() => sampleMathFieldGrid3D(sys, { min: [-1, -1, -1], max: [1, 1, 1] }, 0)).toThrow(InvalidInputError);
  });
});
