import { describe, expect, it } from "vitest";
import { integrateGeodesic } from "./geodesic.ts";
import { minkowski } from "./models/minkowski.ts";

describe("integrateGeodesic (Minkowski, flat)", () => {
  it("reduces to a straight line x(tau) = x0 + u0*tau", () => {
    const x0 = [0, 0, 0, 0];
    const u0 = [1, 0.5, -0.2, 0.3];
    const result = integrateGeodesic(minkowski, x0, u0, { tau0: 0, tau1: 5, h: 0.1 });

    expect(result.termination).toBe("completed");
    expect(result.states.length).toBeGreaterThan(1);

    for (const { tau, x, u } of result.states) {
      for (let mu = 0; mu < 4; mu++) {
        expect(x[mu]).toBeCloseTo(x0[mu] + u0[mu] * tau, 9);
        // Velocity is unchanged in flat space (no forces).
        expect(u[mu]).toBeCloseTo(u0[mu], 9);
      }
    }

    const final = result.states[result.states.length - 1];
    expect(final.tau).toBeCloseTo(5, 9);
  });
});
