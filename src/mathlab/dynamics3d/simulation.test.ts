import { describe, it, expect } from "vitest";
import { norm } from "../linear/vector.ts";
import type { Body3D, Vec3 } from "./types.ts";
import { createSimulation, stepSimulation, resetSimulation, report } from "./simulation.ts";
import { momentum } from "./metrics.ts";

let _n = 0;
function body(p: Partial<Body3D> & { position: Vec3 }): Body3D {
  return {
    id: `b${_n++}`, name: p.name ?? "body",
    position: p.position, velocity: p.velocity ?? [0, 0, 0], acceleration: [0, 0, 0],
    mass: p.mass ?? 1, radius: p.radius ?? 0.1,
    gravitationalStrength: p.gravitationalStrength ?? 1,
    type: p.type ?? "planet", active: p.active ?? true,
    softening: p.softening, absorptionRadius: p.absorptionRadius,
  };
}

describe("simulation lifecycle", () => {
  it("starts paused and does not advance until run", () => {
    const sim = createSimulation([body({ position: [0, 0, 0], mass: 1 })]);
    expect(sim.status).toBe("paused");
    stepSimulation(sim, 5); // paused, no force → no-op
    expect(sim.steps).toBe(0);
  });
  it("advances time and steps when forced", () => {
    const sim = createSimulation([body({ position: [0, 0, 0], mass: 1 }), body({ position: [3, 0, 0], mass: 1 })], { dt: 0.01 });
    stepSimulation(sim, 10, true);
    expect(sim.steps).toBe(10);
    expect(sim.time).toBeCloseTo(0.1, 9);
    expect(sim.status).toBe("running");
  });
  it("reset restores initial state", () => {
    const sim = createSimulation([body({ position: [0, 0, 0], mass: 1 }), body({ position: [3, 0, 0], velocity: [0, 1, 0], mass: 1 })], { dt: 0.01 });
    stepSimulation(sim, 50, true);
    resetSimulation(sim);
    expect(sim.time).toBe(0);
    expect(sim.steps).toBe(0);
    expect(sim.status).toBe("paused");
    expect(sim.bodies[1].position).toEqual([3, 0, 0]);
  });
});

describe("trails (§15)", () => {
  it("grow with steps and cap at trailLength", () => {
    const sim = createSimulation([body({ position: [0, 0, 0], mass: 1 }), body({ position: [5, 0, 0], velocity: [0, 1, 0], mass: 1 })], { dt: 0.01, trailLength: 20 });
    stepSimulation(sim, 100, true);
    expect(sim.trails.get(sim.bodies[1].id)!.length).toBeLessThanOrEqual(20);
    expect(sim.trails.get(sim.bodies[1].id)!.length).toBeGreaterThan(1);
  });
});

describe("collisions (§14)", () => {
  it("merge conserves momentum and deactivates one body", () => {
    const a = body({ position: [-0.1, 0, 0], velocity: [1, 0, 0], mass: 2, radius: 1 });
    const b = body({ position: [0.1, 0, 0], velocity: [-0.5, 0, 0], mass: 1, radius: 1 });
    const sim = createSimulation([a, b], { collisionMode: "merge", dt: 0.001 });
    const p0 = momentum(sim.bodies);
    stepSimulation(sim, 1, true);
    const active = sim.bodies.filter((x) => x.active);
    expect(active.length).toBe(1);
    expect(active[0].mass).toBeCloseTo(3, 9);
    const p1 = momentum(sim.bodies);
    for (let c = 0; c < 3; c++) expect(p1[c]).toBeCloseTo(p0[c], 6);
  });

  it("elastic head-on swaps velocities of equal masses", () => {
    const a = body({ position: [-1, 0, 0], velocity: [1, 0, 0], mass: 1, radius: 1.5 });
    const b = body({ position: [1, 0, 0], velocity: [-1, 0, 0], mass: 1, radius: 1.5 });
    const sim = createSimulation([a, b], { collisionMode: "elastic", dt: 0.0005, params: { G: 0.001, softening: 1 } });
    stepSimulation(sim, 1, true);
    expect(sim.bodies[0].velocity[0]).toBeLessThan(0);   // reversed
    expect(sim.bodies[1].velocity[0]).toBeGreaterThan(0);
  });

  it("singularity captures a body within its absorptionRadius (§9)", () => {
    const sing = body({ position: [0, 0, 0], mass: 1000, type: "singularity", softening: 0.1, absorptionRadius: 0.5, gravitationalStrength: 5 });
    const victim = body({ position: [0.3, 0, 0], mass: 1, type: "particle" });
    const sim = createSimulation([sing, victim], { dt: 0.001 });
    stepSimulation(sim, 1, true);
    expect(sim.bodies[1].active).toBe(false);
    expect(sim.bodies[0].mass).toBeCloseTo(1001, 6);
    expect(sim.events.length).toBeGreaterThan(0);
  });
});

describe("numerical safety (§33)", () => {
  it("flags numericalFailure on non-finite state", () => {
    const sim = createSimulation([body({ position: [0, 0, 0], mass: 1 }), body({ position: [1, 0, 0], mass: 1 })], { dt: 0.01 });
    sim.bodies[0].velocity = [NaN, 0, 0];
    stepSimulation(sim, 1, true);
    expect(sim.status).toBe("numericalFailure");
    expect(sim.termination).toBe("numericalFailure");
  });
  it("stops advancing once failed", () => {
    const sim = createSimulation([body({ position: [0, 0, 0], mass: 1 })], { dt: 0.01 });
    sim.bodies[0].position = [Infinity, 0, 0];
    stepSimulation(sim, 1, true);
    const t = sim.time;
    stepSimulation(sim, 5, true);
    expect(sim.time).toBe(t); // no further advance
  });
});

describe("report / drift (§17)", () => {
  it("reports active bodies, energy & momentum drift", () => {
    const sim = createSimulation([
      body({ position: [0, 0, 0], mass: 100, type: "star" }),
      body({ position: [5, 0, 0], velocity: [0, Math.sqrt(100 / 5), 0], mass: 1e-2 }),
    ], { dt: 0.002, integrator: "verlet" });
    for (let k = 0; k < 500; k++) stepSimulation(sim, 1, true);
    const r = report(sim);
    expect(r.activeBodies).toBe(2);
    expect(r.energyDrift).toBeLessThan(0.05);
    expect(Number.isFinite(r.momentumDrift)).toBe(true);
    expect(norm(r.momentum)).toBeGreaterThanOrEqual(0);
  });
});
