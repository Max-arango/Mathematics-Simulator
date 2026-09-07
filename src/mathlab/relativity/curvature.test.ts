import { describe, expect, it } from "vitest";
import { curvatureAt } from "./curvature.ts";
import { minkowski } from "./models/minkowski.ts";

describe("curvatureAt (Minkowski, flat)", () => {
  it("has exactly zero Riemann/Ricci/Einstein tensors and confidence 'numerical'", () => {
    const res = curvatureAt(minkowski, [1, 2, -3, 4]);
    expect(res.kind).toBe("exact");
    if (res.kind !== "exact") return;
    const { riemann, ricci, ricciScalar, einstein, confidence } = res.value;

    // Minkowski's Christoffel symbols are the CONSTANT function zero everywhere,
    // so central-differencing them introduces no truncation/roundoff error at all
    // (both stencil points evaluate to exactly 0). This is a tight exact-zero
    // check, not a loose tolerance — see ADR-004.
    for (let rho = 0; rho < 4; rho++) {
      for (let sigma = 0; sigma < 4; sigma++) {
        for (let mu = 0; mu < 4; mu++) {
          for (let nu = 0; nu < 4; nu++) {
            expect(riemann[rho][sigma][mu][nu]).toBe(0);
          }
        }
      }
    }
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        expect(ricci[mu][nu]).toBe(0);
        expect(einstein[mu][nu]).toBe(0);
      }
    }
    expect(ricciScalar).toBe(0);
    expect(confidence).toBe("numerical");
  });
});
