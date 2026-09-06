import { describe, it, expect } from "vitest";
import { makeScenario, SCENARIO_IDS } from "./scenarios.ts";
import { createSimulation, stepSimulation } from "./simulation.ts";

describe("scenario presets (§23)", () => {
  it("every scenario builds bodies with a positive dt and unique ids", () => {
    for (const id of SCENARIO_IDS) {
      const sc = makeScenario(id);
      expect(sc.bodies.length).toBeGreaterThan(0);
      expect(sc.dt).toBeGreaterThan(0);
      const ids = new Set(sc.bodies.map((b) => b.id));
      expect(ids.size).toBe(sc.bodies.length);
    }
  });

  it("binary system is mass-symmetric and momentum-neutral", () => {
    const sc = makeScenario("binary");
    expect(sc.bodies.length).toBe(2);
    expect(sc.bodies[0].mass).toBeCloseTo(sc.bodies[1].mass, 9);
    // opposite velocities ⇒ zero net momentum
    for (let c = 0; c < 3; c++) {
      expect(sc.bodies[0].velocity[c] + sc.bodies[1].velocity[c]).toBeCloseTo(0, 9);
    }
  });

  it("planetary system has one dominant star", () => {
    const sc = makeScenario("planetary");
    const masses = sc.bodies.map((b) => b.mass).sort((a, b) => b - a);
    expect(masses[0]).toBeGreaterThan(masses[1] * 100);
  });

  it("scenarios run for many steps without numerical failure", () => {
    for (const id of SCENARIO_IDS) {
      const sc = makeScenario(id);
      const sim = createSimulation(sc.bodies, { dt: sc.dt });
      stepSimulation(sim, 300, true);
      expect(sim.status).not.toBe("numericalFailure");
    }
  });
});
