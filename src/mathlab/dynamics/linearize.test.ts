import { describe, it, expect } from "vitest";
import { makeSystem } from "./system.ts";
import { linearize, isStableMode, isUnstableMode } from "./linearize.ts";
import { C } from "../complex/complex.ts";

const saddle = makeSystem(["x", "y"], ["x", "-y"], {}, "continuous");
const stableNode = makeSystem(["x", "y"], ["-x", "-y"], {}, "continuous");
const spiral = makeSystem(["x", "y"], ["-x - 2*y", "2*x - y"], {}, "continuous");
const discreteSink = makeSystem(["x", "y"], ["0.5*x", "0.5*y"], {}, "discrete");

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;
const alongAxis = (v: number[], axis: 0 | 1) => near(Math.abs(v[axis]), 1, 1e-6) && near(v[axis ^ 1], 0, 1e-6);

describe("linearize — saddle", () => {
  const lin = linearize(saddle, [0, 0]);
  it("classifies as saddle", () => expect(lin.classification).toBe("saddle"));
  it("has one stable and one unstable real direction", () => {
    expect(lin.stableDirections.length).toBe(1);
    expect(lin.unstableDirections.length).toBe(1);
  });
  it("unstable direction is the x-axis (λ=+1), stable is the y-axis (λ=−1)", () => {
    expect(alongAxis(lin.unstableDirections[0], 0)).toBe(true);
    expect(alongAxis(lin.stableDirections[0], 1)).toBe(true);
  });
});

describe("linearize — stable node", () => {
  const lin = linearize(stableNode, [0, 0]);
  it("both directions stable, none unstable", () => {
    expect(lin.stableDirections.length).toBe(2);
    expect(lin.unstableDirections.length).toBe(0);
  });
});

describe("linearize — spiral (complex eigenvalues)", () => {
  const lin = linearize(spiral, [0, 0]);
  it("has no real invariant directions (complex pair)", () => {
    expect(lin.stableDirections.length).toBe(0);
    expect(lin.unstableDirections.length).toBe(0);
    expect(lin.eigenpairs.every((p) => p.vector === null)).toBe(true);
  });
  it("is classified as a stable spiral", () => expect(lin.classification).toBe("stable-spiral"));
});

describe("linearize — discrete map uses |λ|", () => {
  const lin = linearize(discreteSink, [0, 0]);
  it("|λ|=0.5<1 ⇒ both directions stable", () => {
    expect(lin.stableDirections.length).toBe(2);
    expect(lin.unstableDirections.length).toBe(0);
  });
});

describe("mode predicates respect system kind", () => {
  it("continuous: sign of Re λ", () => {
    expect(isUnstableMode(C(0.3, 0), "continuous")).toBe(true);
    expect(isStableMode(C(-0.3, 0), "continuous")).toBe(true);
  });
  it("discrete: |λ| vs 1 (Re<0 but |λ|>1 ⇒ unstable)", () => {
    expect(isUnstableMode(C(-2, 0), "discrete")).toBe(true);
    expect(isStableMode(C(-2, 0), "discrete")).toBe(false);
  });
});
