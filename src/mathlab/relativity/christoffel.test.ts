import { describe, expect, it } from "vitest";
import { christoffelSymbols } from "./christoffel.ts";
import { minkowski } from "./models/minkowski.ts";

describe("christoffelSymbols (Minkowski, Cartesian, flat)", () => {
  const points: number[][] = [
    [0, 0, 0, 0],
    [1, 2, -3, 4],
    [-10, 5, 0.5, -0.25],
  ];

  it.each(points)("is exactly zero at x=%j", (...x) => {
    const res = christoffelSymbols(minkowski, x);
    expect(res.kind).toBe("exact");
    if (res.kind !== "exact") return;
    const gamma = res.value;
    for (let mu = 0; mu < 4; mu++) {
      for (let alpha = 0; alpha < 4; alpha++) {
        for (let beta = 0; beta < 4; beta++) {
          expect(gamma[mu][alpha][beta]).toBe(0);
        }
      }
    }
  });
});
