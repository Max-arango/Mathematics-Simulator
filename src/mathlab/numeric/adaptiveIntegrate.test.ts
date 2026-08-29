import { describe, it, expect } from "vitest";
import { adaptiveSimpson } from "./adaptiveIntegrate.ts";

const val = (r: ReturnType<typeof adaptiveSimpson>): number => {
  if (r.kind !== "approx") throw new Error(`expected approx, got ${r.kind}`);
  return r.value;
};

describe("adaptiveSimpson", () => {
  it("∫₀^π sin = 2", () => expect(val(adaptiveSimpson(Math.sin, 0, Math.PI))).toBeCloseTo(2, 9));
  it("∫₀^1 x² = 1/3", () => expect(val(adaptiveSimpson((x) => x * x, 0, 1))).toBeCloseTo(1 / 3, 10));
  it("∫₀^1 e^x = e−1", () => expect(val(adaptiveSimpson(Math.exp, 0, 1))).toBeCloseTo(Math.E - 1, 9));
  it("∫₋₁^1 x³ = 0", () => expect(val(adaptiveSimpson((x) => x ** 3, -1, 1))).toBeCloseTo(0, 10));

  // Cross-validation against known analytical values (≥8 integrands total).
  it("∫₀^1 1 = 1", () => expect(val(adaptiveSimpson(() => 1, 0, 1))).toBeCloseTo(1, 10));
  it("∫₀^{π/2} cos = 1", () => expect(val(adaptiveSimpson(Math.cos, 0, Math.PI / 2))).toBeCloseTo(1, 9));
  it("∫₁^e 1/x = 1", () => expect(val(adaptiveSimpson((x) => 1 / x, 1, Math.E))).toBeCloseTo(1, 9));
  it("∫₀^1 4/(1+x²) = π", () => expect(val(adaptiveSimpson((x) => 4 / (1 + x * x), 0, 1))).toBeCloseTo(Math.PI, 9));
  it("∫₀^2 (x³+2x) = 8", () => expect(val(adaptiveSimpson((x) => x ** 3 + 2 * x, 0, 2))).toBeCloseTo(8, 9));

  it("reversed bounds negate", () => {
    expect(val(adaptiveSimpson((x) => x * x, 1, 0))).toBeCloseTo(-1 / 3, 10);
  });

  it("zero-width interval is exact 0", () => {
    const r = adaptiveSimpson(Math.exp, 2, 2);
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.value).toBe(0);
  });

  it("reports evals and converged in meta", () => {
    const r = adaptiveSimpson(Math.sin, 0, Math.PI);
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") {
      expect(r.converged).toBe(true);
      expect(r.evals).toBeGreaterThan(0);
    }
  });

  it("pole inside interval → undefined", () => {
    const r = adaptiveSimpson((x) => 1 / x, -1, 1);
    expect(r.kind).toBe("undefined");
  });

  it("∫₀^1 1/√x (integrable singularity) → endpoint is non-finite, reported undefined", () => {
    // 1/√x diverges at x=0 endpoint; f(0)=Infinity is caught → undefined.
    // Documented behaviour: integrable singularities at endpoints are NOT handled;
    // caller must offset the bound. Shifted slightly it converges toward 2.
    const r0 = adaptiveSimpson((x) => 1 / Math.sqrt(x), 0, 1);
    expect(r0.kind).toBe("undefined");
    const r = adaptiveSimpson((x) => 1 / Math.sqrt(x), 1e-12, 1, 1e-6);
    expect(["approx", "notConverged"]).toContain(r.kind);
  });
});
