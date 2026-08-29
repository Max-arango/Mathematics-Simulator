import { describe, it, expect } from "vitest";
import { abs } from "../complex/complex.ts";
import { makeSystem } from "./system.ts";
import { classifyEquilibrium, jacobianAtPoint } from "./stability.ts";

describe("classifyEquilibrium (continuous — sign of Re λ)", () => {
  it("[-x, -2y] at origin → stable-node (λ = -1, -2)", () => {
    const sys = makeSystem(["x", "y"], ["-x", "-2*y"], {}, "continuous");
    const r = classifyEquilibrium(sys, [0, 0]);
    expect(r.type).toBe("stable-node");
    expect(r.confidence).toBe("numerical");
    expect(r.eigenvalues.every((z) => z.re < 0 && Math.abs(z.im) < 1e-9)).toBe(true);
  });

  it("[y, -x] → center (λ = ±i, Re ≈ 0) with a linear-only caveat", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const r = classifyEquilibrium(sys, [0, 0]);
    expect(r.type).toBe("center");
    expect(r.reason).toMatch(/linear/i);
    expect(r.eigenvalues.every((z) => Math.abs(z.re) < 1e-9 && Math.abs(z.im) > 0)).toBe(true);
  });

  it("[x, -y] → saddle (λ = +1, -1)", () => {
    const sys = makeSystem(["x", "y"], ["x", "-y"], {}, "continuous");
    expect(classifyEquilibrium(sys, [0, 0]).type).toBe("saddle");
  });

  it("[-x - y, x - y] → stable-spiral (λ = -1 ± i)", () => {
    const sys = makeSystem(["x", "y"], ["-x - y", "x - y"], {}, "continuous");
    const r = classifyEquilibrium(sys, [0, 0]);
    expect(r.type).toBe("stable-spiral");
    expect(r.eigenvalues.every((z) => z.re < 0 && Math.abs(z.im) > 1e-9)).toBe(true);
  });

  it("[x, 2y] → unstable-node (λ = 1, 2)", () => {
    const sys = makeSystem(["x", "y"], ["x", "2*y"], {}, "continuous");
    expect(classifyEquilibrium(sys, [0, 0]).type).toBe("unstable-node");
  });

  it("[x - y, x + y] → unstable-spiral (λ = 1 ± i)", () => {
    const sys = makeSystem(["x", "y"], ["x - y", "x + y"], {}, "continuous");
    const r = classifyEquilibrium(sys, [0, 0]);
    expect(r.type).toBe("unstable-spiral");
    expect(r.eigenvalues.every((z) => z.re > 0 && Math.abs(z.im) > 1e-9)).toBe(true);
  });

  it("a zero eigenvalue is non-hyperbolic → inconclusive", () => {
    const sys = makeSystem(["x", "y"], ["0", "-y"], {}, "continuous");
    const r = classifyEquilibrium(sys, [0, 0]);
    expect(r.type).toBe("inconclusive");
    expect(r.reason).toMatch(/non-hyperbolic/i);
  });
});

describe("classifyEquilibrium (discrete — modulus |λ|)", () => {
  it("map 0.5*x → stable (|λ| = 0.5 < 1)", () => {
    const sys = makeSystem(["x"], ["0.5*x"], {}, "discrete");
    expect(classifyEquilibrium(sys, [0]).type).toBe("stable-node");
  });

  it("map 2*x → unstable (|λ| = 2 > 1)", () => {
    const sys = makeSystem(["x"], ["2*x"], {}, "discrete");
    expect(classifyEquilibrium(sys, [0]).type).toBe("unstable-node");
  });

  it("map -2*x → unstable via |λ|, NOT the continuous Re(λ) rule", () => {
    // λ = -2: |λ| = 2 > 1 ⇒ UNSTABLE as a map. Re(λ) = -2 < 0 would wrongly read
    // "stable" under the continuous criterion — this is the discriminating case (§17).
    const sys = makeSystem(["x"], ["-2*x"], {}, "discrete");
    const r = classifyEquilibrium(sys, [0]);
    expect(r.type).toBe("unstable-node");
    expect(r.eigenvalues[0].re).toBeLessThan(0); // Re < 0, yet classified unstable
    expect(abs(r.eigenvalues[0])).toBeCloseTo(2, 12);
  });

  it("map -x → inconclusive (|λ| = 1, on the unit circle)", () => {
    const sys = makeSystem(["x"], ["-x"], {}, "discrete");
    const r = classifyEquilibrium(sys, [0]);
    expect(r.type).toBe("inconclusive");
    expect(r.reason).toMatch(/unit circle/i);
  });

  it("rotation-contraction map → stable-spiral (|λ| = √0.5 < 1, complex)", () => {
    const sys = makeSystem(["x", "y"], ["0.5*x - 0.5*y", "0.5*x + 0.5*y"], {}, "discrete");
    const r = classifyEquilibrium(sys, [0, 0]);
    expect(r.type).toBe("stable-spiral");
    expect(r.eigenvalues.every((z) => abs(z) < 1 && Math.abs(z.im) > 1e-9)).toBe(true);
  });

  it("map [2*x, 0.5*y] → saddle (|λ| straddles the unit circle)", () => {
    const sys = makeSystem(["x", "y"], ["2*x", "0.5*y"], {}, "discrete");
    expect(classifyEquilibrium(sys, [0, 0]).type).toBe("saddle");
  });
});

describe("jacobianAtPoint", () => {
  it("returns the field Jacobian as a Matrix", () => {
    const sys = makeSystem(["x", "y"], ["x", "2*y"], {}, "continuous");
    const J = jacobianAtPoint(sys, [0, 0]);
    expect(J.rows).toBe(2);
    expect(J.cols).toBe(2);
    expect(J.data).toEqual([
      [1, 0],
      [0, 2],
    ]);
  });
});
