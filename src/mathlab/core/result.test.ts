import { describe, it, expect } from "vitest";
import { approx, notConverged, numericalError, hasValue } from "./result.ts";
import { MAX_SAMPLES } from "./constants.ts";

describe("result builders", () => {
  it("approx carries provenance method + meta", () => {
    const r = approx(1.5, { method: "RK4", iterations: 3, error: 1e-9 });
    expect(r.kind).toBe("approx");
    if (r.kind === "approx") {
      expect(r.value).toBe(1.5);
      expect(r.method).toBe("RK4");
      expect(r.iterations).toBe(3);
      expect(r.error).toBeCloseTo(1e-9, 12);
    }
    expect(hasValue(r)).toBe(true);
  });

  it("notConverged has the right kind and carries value + reason", () => {
    const r = notConverged(0.42, "hit maxDepth");
    expect(r.kind).toBe("notConverged");
    if (r.kind === "notConverged") {
      expect(r.value).toBe(0.42);
      expect(r.reason).toBe("hit maxDepth");
    }
    expect(hasValue(r)).toBe(false);
  });

  it("numericalError has the right kind and carries reason", () => {
    const r = numericalError("overflow");
    expect(r.kind).toBe("numericalError");
    if (r.kind === "numericalError") expect(r.reason).toBe("overflow");
    expect(hasValue(r)).toBe(false);
  });
});

describe("resource caps", () => {
  it("MAX_SAMPLES is exported and finite", () => {
    expect(Number.isFinite(MAX_SAMPLES)).toBe(true);
    expect(MAX_SAMPLES).toBe(1e7);
  });
});
