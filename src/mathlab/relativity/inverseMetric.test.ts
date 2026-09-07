import { describe, expect, it } from "vitest";
import { invertMetric } from "./inverseMetric.ts";
import { evalMetric } from "./metric.ts";
import { minkowski } from "./models/minkowski.ts";

describe("invertMetric", () => {
  it("returns g^mu_nu = diag(-1,1,1,1) for Minkowski (self-inverse)", () => {
    const g = evalMetric(minkowski, [0, 1, 1, 1]);
    const res = invertMetric(g);
    expect(res.kind).toBe("exact");
    if (res.kind === "exact") {
      const expected = [
        [-1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ];
      // Compare numerically (LU inversion can produce -0 for a true zero, which
      // is mathematically equal to 0 but not Object.is-equal to it).
      res.value.forEach((row, r) => row.forEach((v, c) => expect(v).toBeCloseTo(expected[r][c], 12)));
    }
  });

  it("reports a singular metric as a MathResult failure, not a crash", () => {
    const singular = [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const res = invertMetric(singular);
    expect(["domainError", "numericalError"]).toContain(res.kind);
  });

  it("reports a non-square input as a domainError", () => {
    const res = invertMetric([[1, 0], [0, 1, 0]]);
    expect(res.kind).toBe("domainError");
  });
});
