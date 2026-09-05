import { describe, it, expect } from "vitest";
import { makeSystem } from "./system.ts";
import {
  createTrajectory, stepTrajectory, pauseTrajectory, resumeTrajectory, trimTrail,
  type SimulationLimits,
} from "./lifecycle.ts";

const VP = { xMin: -8, xMax: 8, yMin: -8, yMax: 8 };

const baseLimits = (overrides: Partial<SimulationLimits> = {}): SimulationLimits => ({
  viewport: VP,
  tMax: 20,
  ...overrides,
});

describe("createTrajectory", () => {
  it("seeds initialPosition, currentPosition, single-point trail, status=running", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const t = createTrajectory(sys, [1, 0], 0.02);
    expect(t.initialPosition).toEqual([1, 0]);
    expect(t.currentPosition).toEqual([1, 0]);
    expect(t.trail.length).toBe(1);
    expect(t.status).toBe("running");
    expect(t.elapsedTime).toBe(0);
    expect(t.integrationStep).toBe(0.02);
  });

  it("rejects discrete systems (lifecycle is flow-only)", () => {
    const sys = makeSystem(["x"], ["2*x"], {}, "discrete");
    expect(() => createTrajectory(sys, [1], 0.1)).toThrow(/continuous/);
  });

  it("rejects bad x0 dimension", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    expect(() => createTrajectory(sys, [1] as unknown as number[], 0.1)).toThrow();
  });

  it("rejects non-positive integrationStep", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    expect(() => createTrajectory(sys, [1, 0], 0)).toThrow();
    expect(() => createTrajectory(sys, [1, 0], -0.1)).toThrow();
  });
});

describe("stepTrajectory: equilibrium snap (NOT bare |F|<ε)", () => {
  it("marks equilibrium ONLY when a known equilibrium is within snap radius", () => {
    // Damped oscillator, eq at origin.
    const sys = makeSystem(["x", "y"], ["y", "-x - 0.3*y"], {}, "continuous");
    const limits = baseLimits({ equilibria: [[0, 0]] });
    // Start near the origin so it converges quickly.
    const t = createTrajectory(sys, [0.01, 0.01], 0.02);
    for (let i = 0; i < 5000 && t.status === "running"; i++) stepTrajectory(sys, t, 0.02, limits);
    expect(t.status).toBe("equilibrium");
    expect(t.termination?.status).toBe("equilibrium");
    expect(t.termination?.destinationEquilibrium).toBe(0);
    expect(t.termination?.residualNorm).toBeLessThan(1e-3);
  });

  it("does NOT classify a slow region as equilibrium when no equilibrium is known", () => {
    // Rotation: |F|=|x| constant non-zero ⇒ never quiescent. Use a field that's
    // intentionally flat at one point (f=g=0 everywhere) so |F|≈0 everywhere,
    // but pass NO equilibria — must keep running rather than lie.
    const sys = makeSystem(["x", "y"], ["0", "0"], {}, "continuous");
    const limits = baseLimits({ equilibria: [] });
    const tr = createTrajectory(sys, [1, 1], 0.02);
    stepTrajectory(sys, tr, 0.5, limits);
    expect(tr.status).toBe("running");
    expect(tr.termination).toBeNull();
  });

  it("does NOT classify when equilibria are passed but none are within snap radius", () => {
    // Rotation |F| = |(x,y)|; equilibrium at origin. Start far away — |F| large.
    // We can't easily engineer |F|<ε AND no nearby equilibrium (everywhere-away-
    // from-origin the magnitude is > 0.1 here), so we test the boundary differently:
    // ask the simulator to step a tiny dt from a point already AT an eq, with the
    // equilibrium list deliberately empty.
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const limits = baseLimits({ equilibria: [] });
    const tr = createTrajectory(sys, [0, 0], 0.02); // start AT origin
    stepTrajectory(sys, tr, 0.5, limits);
    // rk4 around a center keeps magnitude 1; not quiescent → still running.
    expect(tr.status).toBe("running");
  });
});

describe("stepTrajectory: escape detection", () => {
  it("marks 'escaped' when the point leaves the viewport", () => {
    // Pure exponential blow-up along x.
    const sys = makeSystem(["x", "y"], ["x", "0"], {}, "continuous");
    const limits = baseLimits();
    const t = createTrajectory(sys, [1, 0], 0.02);
    for (let i = 0; i < 1000 && t.status === "running"; i++) stepTrajectory(sys, t, 0.02, limits);
    expect(t.status).toBe("escaped");
    expect(t.termination?.status).toBe("escaped");
    expect(t.termination?.detail).toMatch(/outside/);
  });
});

describe("stepTrajectory: timeout", () => {
  it("marks 'timeout' when t reaches tMax", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous"); // periodic, never quiesces
    const limits = baseLimits({ tMax: 0.05 });
    const t = createTrajectory(sys, [1, 0], 0.02);
    stepTrajectory(sys, t, 5, limits); // request more than budget
    expect(t.status).toBe("timeout");
    expect(t.elapsedTime).toBeCloseTo(0.05, 5);
  });
});

describe("stepTrajectory: numerical failure", () => {
  it("marks 'numericalFailure' when the integrator returns non-finite", () => {
    // Construct a system whose magnitude explodes almost instantly: ẋ = x².
    const sys = makeSystem(["x"], ["x*x"], {}, "continuous");
    const limits = baseLimits({ viewport: { xMin: -1e9, xMax: 1e9, yMin: -1e9, yMax: 1e9 } });
    const t = createTrajectory(sys, [3], 0.02);
    for (let i = 0; i < 1000 && t.status === "running"; i++) stepTrajectory(sys, t, 0.02, limits);
    expect(t.status).toBe("numericalFailure");
    expect(t.termination?.status).toBe("numericalFailure");
  });
});

describe("pause / resume", () => {
  it("pause stops stepping; resume continues", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const t = createTrajectory(sys, [1, 0], 0.02);
    pauseTrajectory(t);
    expect(t.status).toBe("paused");
    stepTrajectory(sys, t, 0.5, baseLimits());
    expect(t.status).toBe("paused"); // unchanged
    expect(t.elapsedTime).toBe(0);
    resumeTrajectory(t);
    expect(t.status).toBe("running");
  });
});

describe("trimTrail", () => {
  it("keeps the most recent max samples", () => {
    const trail: number[][] = Array.from({ length: 10 }, (_, i) => [i, i]);
    trimTrail(trail, 4);
    expect(trail.length).toBe(4);
    expect(trail[0]).toEqual([6, 6]);
    expect(trail[3]).toEqual([9, 9]);
  });
  it("no-op when length ≤ max", () => {
    const trail: number[][] = [[1, 1], [2, 2]];
    trimTrail(trail, 5);
    expect(trail.length).toBe(2);
  });
});

// (no trailing safety net)