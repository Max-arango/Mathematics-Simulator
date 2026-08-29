import { describe, it, expect } from "vitest";
import { InvalidInputError } from "../core/errors.ts";
import { makeSystem } from "./system.ts";
import { simulate } from "./trajectory.ts";

describe("simulate (continuous)", () => {
  it("harmonic oscillator [y, -x] from (1,0) stays on the unit circle (rk4)", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const { t, states } = simulate(sys, [1, 0], { t1: 2 * Math.PI, steps: 400 });
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeCloseTo(2 * Math.PI, 9);
    for (const [x, y] of states) expect(x * x + y * y).toBeCloseTo(1, 5);
  });

  it("returns aligned t and states", () => {
    const sys = makeSystem(["x"], ["-x"], {}, "continuous");
    const { t, states } = simulate(sys, [1], { t1: 1, steps: 10 });
    expect(t.length).toBe(states.length);
    // decay solution x(t) = e^{-t}
    expect(states[states.length - 1][0]).toBeCloseTo(Math.exp(-1), 4);
  });

  it("continuous simulate requires t1", () => {
    const sys = makeSystem(["x"], ["-x"], {}, "continuous");
    expect(() => simulate(sys, [1], {})).toThrow(InvalidInputError);
  });

  it("guards the initial-state dimension", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    expect(() => simulate(sys, [1], { t1: 1 })).toThrow(InvalidInputError);
  });
});

describe("simulate (discrete)", () => {
  it("logistic map r*x*(1-x), r=2 from 0.1 converges to the fixed point 0.5", () => {
    const sys = makeSystem(["x"], ["r*x*(1-x)"], { r: 2 }, "discrete");
    const { t, states } = simulate(sys, [0.1], { steps: 60 });
    expect(t).toEqual(Array.from({ length: 61 }, (_, i) => i));
    expect(states[states.length - 1][0]).toBeCloseTo(0.5, 9);
  });

  it("orbit records the initial state then one point per step", () => {
    const sys = makeSystem(["x"], ["2*x"], {}, "discrete");
    const { states } = simulate(sys, [1], { steps: 3 });
    expect(states.map((s) => s[0])).toEqual([1, 2, 4, 8]);
  });

  it("rejects a non-positive step count", () => {
    const sys = makeSystem(["x"], ["2*x"], {}, "discrete");
    expect(() => simulate(sys, [1], { steps: 0 })).toThrow(InvalidInputError);
  });
});
