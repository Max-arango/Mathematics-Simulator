import { describe, it, expect } from "vitest";
import type { Vec } from "../linear/vector.ts";
import { makeSystem } from "./system.ts";
import { identifyAttractors, isAttracting, attractorForDestination, pointNearAttractor, attractorIsConsistent } from "./attractors.ts";
import { classifyEquilibrium } from "./stability.ts";

const stableNode = makeSystem(["x", "y"], ["-x", "-y"], {}, "continuous");
const saddle = makeSystem(["x", "y"], ["x", "-y"], {}, "continuous");
const center = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
const stableSpiral = makeSystem(["x", "y"], ["-x - 2*y", "2*x - y"], {}, "continuous");

describe("isAttracting", () => {
  it("classifies stable-node as attracting", () => {
    const stab = classifyEquilibrium(stableNode, [0, 0]);
    expect(isAttracting(stab)).toBe(true);
  });
  it("classifies stable-spiral as attracting", () => {
    const stab = classifyEquilibrium(stableSpiral, [0, 0]);
    expect(isAttracting(stab)).toBe(true);
  });
  it("does NOT classify a saddle as attracting", () => {
    const stab = classifyEquilibrium(saddle, [0, 0]);
    expect(isAttracting(stab)).toBe(false);
  });
  it("does NOT classify a center as attracting", () => {
    const stab = classifyEquilibrium(center, [0, 0]);
    expect(isAttracting(stab)).toBe(false);
  });
});

describe("identifyAttractors", () => {
  it("returns the stable-node from the equilibria list", () => {
    const a = identifyAttractors(stableNode, { equilibria: [[0, 0]] });
    expect(a.length).toBe(1);
    expect(a[0].kind).toBe("stable-equilibrium");
    expect(a[0].point).toEqual([0, 0]);
  });
  it("returns nothing for a pure saddle system", () => {
    const a = identifyAttractors(saddle, { equilibria: [[0, 0]] });
    expect(a.length).toBe(0);
  });
  it("returns nothing for a center (centers are not attractors)", () => {
    const a = identifyAttractors(center, { equilibria: [[0, 0]] });
    expect(a.length).toBe(0);
  });
  it("appends user-supplied limit cycles verbatim", () => {
    const a = identifyAttractors(stableNode, {
      equilibria: [[0, 0]],
      limitCycles: [
        { kind: "limit-cycle", center: [3, 0], radius: 1, orbit: [[3, 1], [2, 0], [3, -1]], confidence: "heuristic" },
      ],
    });
    expect(a.length).toBe(2);
    expect(a[1].kind).toBe("limit-cycle");
    expect(a[1].radius).toBe(1);
  });
  it("preserves input order (stable eq first, then limit cycles)", () => {
    const a = identifyAttractors(stableSpiral, {
      equilibria: [[0, 0], [1, 1]],
      limitCycles: [{ kind: "limit-cycle", center: [5, 5], radius: 0.5, orbit: [], confidence: "heuristic" }],
    });
    expect(a.map((x) => x.kind)).toEqual(["stable-equilibrium", "stable-equilibrium", "limit-cycle"]);
  });
  it("skips equilibria of the wrong dimension", () => {
    const a = identifyAttractors(stableNode, { equilibria: [[0, 0, 0]] });
    expect(a.length).toBe(0);
  });
});

describe("pointNearAttractor", () => {
  const eq = { kind: "stable-equilibrium" as const, point: [0, 0], index: 0, stability: classifyEquilibrium(stableNode, [0, 0]), confidence: "numerical" as const };
  it("matches a point near the equilibrium", () => {
    expect(pointNearAttractor([0.1, 0.05], eq, 0.2)).toBe(true);
  });
  it("does NOT match a faraway point", () => {
    expect(pointNearAttractor([1, 1], eq, 0.2)).toBe(false);
  });
  it("matches a point near a limit-cycle's shell", () => {
    const lc = { kind: "limit-cycle" as const, center: [3, 0] as Vec, radius: 1, orbit: [] as Vec[], confidence: "heuristic" as const };
    // (2.05, 0): distance to centre = 0.95; |0.95 - 1| = 0.05 < 0.2 ⇒ shell.
    expect(pointNearAttractor([2.05, 0], lc, 0.2)).toBe(true);
    // (5, 0): distance = 2; |2 - 1| = 1 ≫ 0.2 ⇒ far.
    expect(pointNearAttractor([5, 0], lc, 0.2)).toBe(false);
  });
});

describe("attractorForDestination", () => {
  it("matches an equilibrium termination to a stable-equilibrium attractor", () => {
    const a = identifyAttractors(stableNode, { equilibria: [[0, 0]] })[0];
    expect(attractorForDestination([0.02, 0.01], "equilibrium", [a], 0.4)).not.toBeNull();
  });
  it("returns null for an unrelated termination", () => {
    const a = identifyAttractors(stableNode, { equilibria: [[0, 0]] })[0];
    expect(attractorForDestination([5, 5], "equilibrium", [a], 0.4)).toBeNull();
  });
  it("returns null for a timeout / escaped status", () => {
    const a = identifyAttractors(stableNode, { equilibria: [[0, 0]] })[0];
    expect(attractorForDestination([0, 0], "timeout", [a])).toBeNull();
  });
});

describe("attractorIsConsistent", () => {
  it("passes when |F|≈0 at the eq", () => {
    const a = identifyAttractors(stableNode, { equilibria: [[0, 0]] })[0];
    expect(attractorIsConsistent(stableNode, a)).toBe(true);
  });
  it("fails when the eq is moved (no longer a root)", () => {
    const a = identifyAttractors(stableNode, { equilibria: [[0, 0]] })[0];
    const bad = { ...a, point: [0.5, 0.5] };
    expect(attractorIsConsistent(stableNode, bad)).toBe(false);
  });
});
