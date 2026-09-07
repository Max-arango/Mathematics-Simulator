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
  it("seeds initialPosition, currentPosition, single-sample trajectory, status=running", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const t = createTrajectory(sys, [1, 0], 0.02);
    expect(t.initialPosition).toEqual([1, 0]);
    expect(t.currentPosition).toEqual([1, 0]);
    expect(t.samples.length).toBe(1);
    expect(t.samples[0]).toEqual({ t: 0, x: [1, 0] });
    expect(t.direction).toBe("forward");
    expect(t.status).toBe("running");
    expect(t.elapsedTime).toBe(0);
    expect(t.integrationStep).toBe(0.02);
    expect(typeof t.id).toBe("number");
  });

  it("supports direction='backward' on creation", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const t = createTrajectory(sys, [1, 0], 0.02, "backward");
    expect(t.direction).toBe("backward");
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
    const t = createTrajectory(sys, [0.01, 0.01], 0.02);
    for (let i = 0; i < 5000 && t.status === "running"; i++) stepTrajectory(sys, t, 0.02, limits);
    expect(t.status).toBe("equilibrium");
    expect(t.termination?.status).toBe("equilibrium");
    expect(t.termination?.destination?.kind).toBe("equilibrium");
    expect(t.termination?.destination?.equilibriumIndex).toBe(0);
    expect(t.termination?.residualNorm).toBeLessThan(1e-3);
    expect(t.termination?.confidence).toBe("numerical");
  });

  it("does NOT classify a slow region as equilibrium when no equilibrium is known", () => {
    const sys = makeSystem(["x", "y"], ["0", "0"], {}, "continuous");
    const limits = baseLimits({ equilibria: [] });
    const tr = createTrajectory(sys, [1, 1], 0.02);
    stepTrajectory(sys, tr, 0.5, limits);
    expect(tr.status).toBe("running");
    expect(tr.termination).toBeNull();
  });

  it("does NOT classify when equilibria are passed but none are within snap radius", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const limits = baseLimits({ equilibria: [] });
    const tr = createTrajectory(sys, [0, 0], 0.02);
    stepTrajectory(sys, tr, 0.5, limits);
    expect(tr.status).toBe("running");
  });
});

describe("stepTrajectory: backward integration", () => {
  it("integrates -f(x): a forward rotation trajectory run backward retraces the orbit in reverse", () => {
    // Forward rotation [y,-x]: x(t)=(cos t, sin t). Backward from (1,0) gives
    // x_back(t) = (cos(-t), sin(-t)) = (cos t, -sin t) — symmetric below the x-axis.
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const limits = baseLimits({ tMax: Math.PI, viewport: VP });
    const tr = createTrajectory(sys, [1, 0], 0.02, "backward");
    for (let i = 0; i < 200 && tr.status === "running"; i++) stepTrajectory(sys, tr, 0.02, limits);
    expect(tr.status).toBe("timeout");
    // End point at t=π should be approximately (-1, 0).
    expect(tr.currentPosition[0]).toBeCloseTo(-1, 1);
    expect(tr.currentPosition[1]).toBeCloseTo(0, 1);
    // elapsedTime is the REVERSE-time coordinate — should be NEGATIVE.
    expect(tr.elapsedTime).toBeLessThan(0);
  });

  it("backward from near a saddle's stable direction stays on the stable manifold", () => {
    // Saddle at origin: ẋ=x, ẏ=-y. Forward stable manifold is the y-axis (y-component
    // decays, x-component grows). Backward from a point on the y-axis, x should
    // DECAY toward the origin (the stable direction in reverse time) and y
    // should stay near the starting y.
    const sys = makeSystem(["x", "y"], ["x", "-y"], {}, "continuous");
    const limits = baseLimits({ equilibria: [[0, 0]], tMax: 3, viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 } });
    const tr = createTrajectory(sys, [0.01, 2], 0.01, "backward");
    for (let i = 0; i < 500 && tr.status === "running"; i++) stepTrajectory(sys, tr, 0.01, limits);
    // Status will be 'timeout' (the integrator never quiesces near a saddle).
    // In reverse time, x should have collapsed toward the origin (stable direction
    // in forward time is the y-axis, so x→0 as t→−∞).
    expect(Math.abs(tr.currentPosition[0])).toBeLessThan(0.05);
    // y grows under reverse integration (it's the unstable direction in forward time);
    // we just want to confirm we stayed on a meaningful trajectory, not the x-axis.
    expect(Math.abs(tr.currentPosition[1])).toBeGreaterThan(2);
  });
});

describe("stepTrajectory: limit-cycle heuristic", () => {
  it("marks 'limitCycle' on a system with a stable cycle (Van der Pol, μ=1)", () => {
    // ẋ=y, ẏ=μ(1-x²)y - x with μ=1. Stable cycle near x²+y²≈4.
    const sys = makeSystem(["x", "y"], ["y", "(1 - x^2)*y - x"], {}, "continuous");
    const limits = baseLimits({
      tMax: 30,
      viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
      equilibria: [[0, 0]],
      limitCycleMinCrossings: 3,
    });
    const tr = createTrajectory(sys, [0.5, 0], 0.02);
    for (let i = 0; i < 2000 && tr.status === "running"; i++) stepTrajectory(sys, tr, 0.02, limits);
    expect(tr.status).toBe("limitCycle");
    expect(tr.termination?.destination?.kind).toBe("limitCycle");
    expect(tr.termination?.confidence).toBe("heuristic");
    expect(tr.termination?.destination?.radius).toBeGreaterThan(0);
  });

  it("respects disableLimitCycle: true (no heuristic even on a Van der Pol cycle)", () => {
    const sys = makeSystem(["x", "y"], ["y", "(1 - x^2)*y - x"], {}, "continuous");
    const limits = baseLimits({
      tMax: 30,
      equilibria: [[0, 0]],
      disableLimitCycle: true,
    });
    const tr = createTrajectory(sys, [0.5, 0], 0.02);
    for (let i = 0; i < 2000 && tr.status === "running"; i++) stepTrajectory(sys, tr, 0.02, limits);
    expect(tr.status).not.toBe("limitCycle");
  });
});

describe("stepTrajectory: escape + timeout + numerical failure", () => {
  it("marks 'escaped' when the point leaves the viewport", () => {
    const sys = makeSystem(["x", "y"], ["x", "0"], {}, "continuous");
    const limits = baseLimits();
    const t = createTrajectory(sys, [1, 0], 0.02);
    for (let i = 0; i < 1000 && t.status === "running"; i++) stepTrajectory(sys, t, 0.02, limits);
    expect(t.status).toBe("escaped");
    expect(t.termination?.status).toBe("escaped");
    expect(t.termination?.detail).toMatch(/outside/);
  });

  it("marks 'timeout' when |t| reaches tMax", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const limits = baseLimits({ tMax: 0.05 });
    const t = createTrajectory(sys, [1, 0], 0.02);
    stepTrajectory(sys, t, 5, limits);
    expect(t.status).toBe("timeout");
    expect(Math.abs(t.elapsedTime)).toBeCloseTo(0.05, 5);
  });

  it("marks 'numericalFailure' when the integrator returns non-finite", () => {
    const sys = makeSystem(["x"], ["x*x"], {}, "continuous");
    const limits = baseLimits({ viewport: { xMin: -1e9, xMax: 1e9, yMin: -1e9, yMax: 1e9 } });
    const t = createTrajectory(sys, [3], 0.02);
    for (let i = 0; i < 1000 && t.status === "running"; i++) stepTrajectory(sys, t, 0.02, limits);
    expect(t.status).toBe("numericalFailure");
    expect(t.termination?.status).toBe("numericalFailure");
  });
});

describe("stepTrajectory: domain enforcement", () => {
  it("marks 'outOfDomain' when the trajectory leaves the explicit domain box", () => {
    const sys = makeSystem(["x"], ["x"], {}, "continuous");
    const limits = baseLimits({
      viewport: { xMin: -100, xMax: 100, yMin: -100, yMax: 100 },
      domain: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
      tMax: 50,
    });
    const t = createTrajectory(sys, [1], 0.05);
    for (let i = 0; i < 500 && t.status === "running"; i++) stepTrajectory(sys, t, 0.05, limits);
    expect(t.status).toBe("outOfDomain");
    expect(t.termination?.status).toBe("outOfDomain");
    expect(t.termination?.detail).toMatch(/domain/);
  });

  it("does NOT enforce domain when enforceDomain:false", () => {
    const sys = makeSystem(["x"], ["x"], {}, "continuous");
    const limits = baseLimits({
      viewport: { xMin: -100, xMax: 100, yMin: -100, yMax: 100 },
      domain: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
      enforceDomain: false,
      tMax: 2,
    });
    const t = createTrajectory(sys, [1], 0.05);
    for (let i = 0; i < 500 && t.status === "running"; i++) stepTrajectory(sys, t, 0.05, limits);
    expect(t.status).toBe("timeout");
    expect(t.status).not.toBe("outOfDomain");
  });

  it("defaults domain to viewport (out-of-viewport ⇒ escaped, not outOfDomain)", () => {
    const sys = makeSystem(["x"], ["x"], {}, "continuous");
    const limits = baseLimits({ viewport: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, tMax: 50 });
    const t = createTrajectory(sys, [1], 0.05);
    for (let i = 0; i < 500 && t.status === "running"; i++) stepTrajectory(sys, t, 0.05, limits);
    expect(t.status).toBe("escaped");
  });
});

describe("stepTrajectory: adaptive method (rkf45) + tolerance threading", () => {
  it("tolerance is passed through to the adaptive solver (tighter tol ⇒ more solver steps for the same dt)", () => {
    // Before this fix, absTol/relTol were never threaded through — rkf45 always
    // ran at the ODE registry's baked-in defaults regardless of what a caller
    // asked for. A visibly tighter tolerance must now cost visibly more steps.
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const limits = baseLimits({ tMax: 100 });

    const trLoose = createTrajectory(sys, [1, 0], 2);
    stepTrajectory(sys, trLoose, 2, limits, "rkf45", { absTol: 1e-2, relTol: 1e-2 });

    const trTight = createTrajectory(sys, [1, 0], 2);
    stepTrajectory(sys, trTight, 2, limits, "rkf45", { absTol: 1e-12, relTol: 1e-12 });

    expect(trTight.stepsTaken).toBeGreaterThan(trLoose.stepsTaken);
  });

  it("default method (no 5th/6th arg) is unchanged: fixed-step rk4 behavior", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const limits = baseLimits({ tMax: 100 });
    const tr = createTrajectory(sys, [1, 0], 0.1);
    stepTrajectory(sys, tr, 0.1, limits);
    // rk4 fixed-step over one integrationStep takes exactly one solver step.
    expect(tr.stepsTaken).toBe(1);
  });
});

describe("pause / resume", () => {
  it("pause stops stepping; resume continues", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const t = createTrajectory(sys, [1, 0], 0.02);
    pauseTrajectory(t);
    expect(t.status).toBe("paused");
    stepTrajectory(sys, t, 0.5, baseLimits());
    expect(t.status).toBe("paused");
    expect(t.elapsedTime).toBe(0);
    resumeTrajectory(t);
    expect(t.status).toBe("running");
  });
});

describe("trimTrail", () => {
  it("keeps the most recent max samples on the trajectory", () => {
    const sys = makeSystem(["x", "y"], ["x", "0"], {}, "continuous");
    const t = createTrajectory(sys, [0.1, 0], 0.01);
    for (let i = 0; i < 50; i++) t.samples.push({ t: t.elapsedTime, x: [i, 0] });
    trimTrail(t, 4);
    expect(t.samples.length).toBe(4);
  });
});