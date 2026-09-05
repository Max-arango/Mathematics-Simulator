import { describe, it, expect } from "vitest";
import { makeSystem } from "./system.ts";
import { saddleManifolds } from "./manifolds.ts";

const saddle = makeSystem(["x", "y"], ["x", "-y"], {}, "continuous");
const stableNode = makeSystem(["x", "y"], ["-x", "-y"], {}, "continuous");
const discreteSaddle = makeSystem(["x", "y"], ["2*x", "0.5*y"], {}, "discrete");

describe("saddleManifolds — canonical saddle x'=x, y'=-y", () => {
  const m = saddleManifolds(saddle, [0, 0], { span: 10 })!;
  it("returns a result for a saddle", () => expect(m).not.toBeNull());
  it("labels itself a numerical approximation", () => expect(m.confidence).toBe("numerical"));
  it("has two stable and two unstable branches", () => {
    expect(m.stable.length).toBe(2);
    expect(m.unstable.length).toBe(2);
  });
  it("unstable manifold runs along the x-axis (grows in x, y≈0)", () => {
    for (const branch of m.unstable) {
      const end = branch[branch.length - 1];
      expect(Math.abs(end[0])).toBeGreaterThan(1);   // moved out in x
      expect(Math.abs(end[1])).toBeLessThan(0.05);    // stayed on y≈0
    }
  });
  it("stable manifold runs along the y-axis (grows in y, x≈0)", () => {
    for (const branch of m.stable) {
      const end = branch[branch.length - 1];
      expect(Math.abs(end[1])).toBeGreaterThan(1);
      expect(Math.abs(end[0])).toBeLessThan(0.05);
    }
  });
  it("eigenvalues have opposite sign", () => {
    expect(m.unstableEigenvalue).toBeGreaterThan(0);
    expect(m.stableEigenvalue).toBeLessThan(0);
  });
});

describe("saddleManifolds — rejects non-saddles", () => {
  it("returns null for a stable node", () => expect(saddleManifolds(stableNode, [0, 0])).toBeNull());
  it("returns null for a discrete system", () => expect(saddleManifolds(discreteSaddle, [0, 0])).toBeNull());
});
