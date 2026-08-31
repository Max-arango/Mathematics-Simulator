import { describe, it, expect } from "vitest";
import { measurement, relative, addU, subU, mulU, divU, scaleU, powU } from "./uncertainty.ts";
import { InvalidInputError } from "../core/errors.ts";

const a = measurement(10, 0.1); // rel 0.01
const b = measurement(5, 0.2);  // rel 0.04

describe("uncertainty propagation (quadrature, independent)", () => {
  it("relative uncertainty", () => {
    expect(relative(a)).toBeCloseTo(0.01, 12);
    expect(relative(b)).toBeCloseTo(0.04, 12);
  });
  it("add/sub: absolute in quadrature", () => {
    const s = addU(a, b);
    expect(s.value).toBe(15);
    expect(s.abs).toBeCloseTo(Math.hypot(0.1, 0.2), 12); // √0.05 ≈ 0.223607
    const d = subU(a, b);
    expect(d.value).toBe(5);
    expect(d.abs).toBeCloseTo(Math.hypot(0.1, 0.2), 12);
  });
  it("mul/div: relative in quadrature", () => {
    const m = mulU(a, b);
    expect(m.value).toBe(50);
    const relCombined = Math.hypot(0.01, 0.04); // ≈ 0.0412311
    expect(m.abs).toBeCloseTo(50 * relCombined, 10);
    const q = divU(a, b);
    expect(q.value).toBe(2);
    expect(q.abs).toBeCloseTo(2 * relCombined, 10);
  });
  it("scale is exact; pow scales relative by |n|", () => {
    const sc = scaleU(a, 3);
    expect(sc.value).toBeCloseTo(30, 12);
    expect(sc.abs).toBeCloseTo(0.3, 12);
    const p = powU(a, 2);
    expect(p.value).toBe(100);
    expect(p.abs).toBeCloseTo(100 * 2 * 0.01, 10); // 2
  });
  it("rejects negative uncertainty", () => {
    expect(() => measurement(1, -0.5)).toThrow(InvalidInputError);
  });
});
