import { describe, it, expect } from "vitest";
import { numericLimit } from "./limit.ts";

describe("numericLimit", () => {
  it("sin(x)/x → 1 at 0 (both)", () => {
    const r = numericLimit((x) => Math.sin(x) / x, 0, "both");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(1, 6);
  });

  it("(1-cos x)/x² → 1/2 at 0 (both)", () => {
    const r = numericLimit((x) => (1 - Math.cos(x)) / (x * x), 0, "both");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(0.5, 5);
  });

  it("1/x → 0 at +∞", () => {
    const r = numericLimit((x) => 1 / x, 0, "+inf");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(0, 6);
  });

  it("1/x → 0 at -∞", () => {
    const r = numericLimit((x) => 1 / x, 0, "-inf");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(0, 6);
  });

  it("(1+1/x)^x → e at +∞ (loose tol)", () => {
    const r = numericLimit((x) => Math.pow(1 + 1 / x, x), 0, "+inf");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(Math.E, 1);
  });

  it("x² → 4 at 2 (both, continuous)", () => {
    const r = numericLimit((x) => x * x, 2, "both");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(4, 6);
  });

  it("constant → itself", () => {
    const r = numericLimit(() => 7, 3, "both");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(7, 10);
  });

  it("tan(x) near π/2 from left → divergent", () => {
    const r = numericLimit(Math.tan, Math.PI / 2, "left");
    expect(r.kind).toBe("divergent");
  });

  it("1/x at 0 two-sided → undefined (−∞ vs +∞)", () => {
    const r = numericLimit((x) => 1 / x, 0, "both");
    expect(r.kind).toBe("undefined");
  });

  it("1/x at 0+ one-sided → divergent", () => {
    const r = numericLimit((x) => 1 / x, 0, "right");
    expect(r.kind).toBe("divergent");
  });

  it("1/x at 0- one-sided → divergent", () => {
    const r = numericLimit((x) => 1 / x, 0, "left");
    expect(r.kind).toBe("divergent");
  });

  it("|x|/x at 0 → undefined (−1 vs 1)", () => {
    const r = numericLimit((x) => Math.abs(x) / x, 0, "both");
    expect(r.kind).toBe("undefined");
  });

  it("|x|/x at 0+ → 1", () => {
    const r = numericLimit((x) => Math.abs(x) / x, 0, "right");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(1, 10);
  });

  it("|x|/x at 0- → -1", () => {
    const r = numericLimit((x) => Math.abs(x) / x, 0, "left");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(-1, 10);
  });

  it("1/x² at 0 two-sided → divergent (same sign)", () => {
    const r = numericLimit((x) => 1 / (x * x), 0, "both");
    expect(r.kind).toBe("divergent");
  });

  it("exp(x) → 0 at -∞", () => {
    const r = numericLimit(Math.exp, 0, "-inf");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(0, 3);
  });

  it("exp(x) → +∞ at +∞ divergent", () => {
    const r = numericLimit(Math.exp, 0, "+inf");
    expect(r.kind).toBe("divergent");
  });

  it("atan(x) → π/2 at +∞", () => {
    const r = numericLimit(Math.atan, 0, "+inf");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(Math.PI / 2, 5);
  });

  it("(x²-1)/(x-1) → 2 at 1 (removable, both)", () => {
    const r = numericLimit((x) => (x * x - 1) / (x - 1), 1, "both");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") expect(r.value).toBeCloseTo(2, 6);
  });

  it("success always carries error meta and 'numerical estimate' warning", () => {
    const r = numericLimit((x) => Math.sin(x) / x, 0, "both");
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") {
      expect(typeof r.error).toBe("number");
      expect(r.warnings).toContain("numerical estimate");
    }
  });

  it("never returns kind 'exact'", () => {
    const cases: Array<() => ReturnType<typeof numericLimit>> = [
      () => numericLimit((x) => Math.sin(x) / x, 0, "both"),
      () => numericLimit((x) => 1 / x, 0, "+inf"),
      () => numericLimit((x) => x * x, 2, "both"),
    ];
    for (const c of cases) expect(c().kind).not.toBe("exact");
  });

  it("sin(1/x) at 0+ → undefined (oscillates, no convergence)", () => {
    const r = numericLimit((x) => Math.sin(1 / x), 0, "right");
    expect(r.kind).toBe("undefined");
  });
});
