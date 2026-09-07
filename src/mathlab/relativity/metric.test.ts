import { describe, expect, it } from "vitest";
import { evalMetric } from "./metric.ts";
import { minkowski } from "./models/minkowski.ts";

describe("evalMetric (Minkowski)", () => {
  it("matches diag(-1,1,1,1) exactly at a sample point", () => {
    const g = evalMetric(minkowski, [1, 2, -3, 4]);
    expect(g).toEqual([
      [-1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ]);
  });

  it("is constant (flat) across coordinates", () => {
    const g = evalMetric(minkowski, [0, 0, 0, 0]);
    expect(g).toEqual([
      [-1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ]);
  });
});
