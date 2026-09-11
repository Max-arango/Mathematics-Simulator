import { describe, expect, it } from "vitest";
import { evalMetric } from "../metric.ts";
import { invertMetric } from "../inverseMetric.ts";
import { integrateGeodesic } from "../geodesic.ts";
import { makeKerr } from "./kerr.ts";
import { makeSchwarzschild } from "./schwarzschild.ts";

describe("Kerr metric components", () => {
  it("matches the Boyer-Lindquist formulas, including the off-diagonal g_tphi", () => {
    const M = 2, a = 1, r = 8, theta = 1.1;
    const model = makeKerr(M, a);
    const g = evalMetric(model, [0, r, theta, 0]);

    const Sigma = r * r + a * a * Math.cos(theta) * Math.cos(theta);
    const Delta = r * r - 2 * M * r + a * a;
    const gtt = -(1 - (2 * M * r) / Sigma);
    const gtphi = (-2 * M * a * r * Math.sin(theta) * Math.sin(theta)) / Sigma;
    const grr = Sigma / Delta;
    const gthth = Sigma;
    const gphiphi =
      (r * r + a * a + (2 * M * a * a * r * Math.sin(theta) * Math.sin(theta)) / Sigma) *
      Math.sin(theta) *
      Math.sin(theta);

    expect(g[0][0]).toBeCloseTo(gtt, 10);
    expect(g[1][1]).toBeCloseTo(grr, 10);
    expect(g[2][2]).toBeCloseTo(gthth, 10);
    expect(g[3][3]).toBeCloseTo(gphiphi, 10);

    // Off-diagonal g_tphi = g_phit is genuinely nonzero for a spinning hole.
    expect(gtphi).not.toBeCloseTo(0, 3);
    expect(g[0][3]).toBeCloseTo(gtphi, 10);
    expect(g[3][0]).toBeCloseTo(gtphi, 10);

    // Remaining off-diagonal entries are zero.
    expect(g[0][1]).toBe(0);
    expect(g[0][2]).toBe(0);
    expect(g[1][2]).toBe(0);
    expect(g[1][3]).toBe(0);
    expect(g[2][3]).toBe(0);
  });

  it("inverts a genuinely non-diagonal 4x4 metric correctly (g * g^-1 = I)", () => {
    const M = 2, a = 1, r = 8, theta = 1.1;
    const model = makeKerr(M, a);
    const g = evalMetric(model, [0, r, theta, 0]);
    const res = invertMetric(g);
    expect(res.kind).toBe("exact");
    if (res.kind !== "exact") return;
    const ginv = res.value;

    // Off-diagonal g^tphi must come out nonzero too (a diagonal-only inverter
    // would silently drop the t-phi coupling here).
    expect(ginv[0][3]).not.toBeCloseTo(0, 3);
    expect(ginv[0][3]).toBeCloseTo(ginv[3][0], 12);

    // g * g^-1 = identity, full 4x4 matrix product (not a diagonal shortcut).
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += g[i][k] * ginv[k][j];
        expect(s).toBeCloseTo(i === j ? 1 : 0, 8);
      }
    }
  });
});

describe("Kerr a->0 reduces to Schwarzschild", () => {
  it("matches makeSchwarzschild(M)'s metric components exactly at the same point", () => {
    const M = 3, r = 7, theta = 0.9;
    const kerr = makeKerr(M, 0);
    const schw = makeSchwarzschild(M);
    const gk = evalMetric(kerr, [0, r, theta, 0]);
    const gs = evalMetric(schw, [0, r, theta, 0]);

    expect(gk[0][0]).toBeCloseTo(gs[0][0], 12);
    expect(gk[1][1]).toBeCloseTo(gs[1][1], 12);
    expect(gk[2][2]).toBeCloseTo(gs[2][2], 12);
    expect(gk[3][3]).toBeCloseTo(gs[3][3], 12);
    expect(gk[0][3]).toBeCloseTo(0, 12);
    expect(gk[3][0]).toBeCloseTo(0, 12);
  });
});

describe("Kerr validRegion", () => {
  it("rejects at/inside the outer horizon r_+, accepts well outside", () => {
    const M = 2, a = 1;
    const rPlus = M + Math.sqrt(M * M - a * a); // = 2 + sqrt(3) ~= 3.732
    const model = makeKerr(M, a);

    expect(rPlus).toBeCloseTo(2 + Math.sqrt(3), 12);
    expect(model.validRegion?.([0, rPlus, 0.5, 0])).toBe(false);       // exactly on horizon (Delta=0)
    expect(model.validRegion?.([0, rPlus - 0.5, 0.5, 0])).toBe(false); // well inside horizon
    expect(model.validRegion?.([0, 0, 0.5, 0])).toBe(false);           // true singularity
    expect(model.validRegion?.([0, rPlus + 0.5, 0.5, 0])).toBe(true);  // just outside
    expect(model.validRegion?.([0, 100, 0.5, 0])).toBe(true);          // far outside
  });
});

describe("Kerr geodesic conserved quantities", () => {
  it("keeps E = -(g_tt u^t + g_tphi u^phi) and L = g_tphi u^t + g_phiphi u^phi constant", () => {
    const M = 1, a = 0.5;
    const model = makeKerr(M, a);
    const r0 = 20 * M; // well outside the horizon
    const theta0 = Math.PI / 2; // equatorial
    const uphi = 0.02;

    // Fix u^r = 0 and solve u^t from the timelike normalization
    // g_mu_nu u^mu u^nu = -1 (equatorial, so u^theta = 0 stays 0 by symmetry).
    const g = evalMetric(model, [0, r0, theta0, 0]);
    const gtt = g[0][0], gtphi = g[0][3], gphiphi = g[3][3];
    // gtt*(ut)^2 + 2*gtphi*ut*uphi + gphiphi*uphi^2 = -1
    const A = gtt, B = 2 * gtphi * uphi, C = gphiphi * uphi * uphi + 1;
    const disc = B * B - 4 * A * C;
    expect(disc).toBeGreaterThan(0);
    const ut = (-B - Math.sqrt(disc)) / (2 * A); // future-directed root

    const x0 = [0, r0, theta0, 0];
    const u0 = [ut, 0, 0, uphi];
    const result = integrateGeodesic(model, x0, u0, { tau0: 0, tau1: 50, h: 0.05 });

    expect(result.termination).toBe("completed");
    expect(result.states.length).toBeGreaterThan(100);

    const conserved = result.states.map((s) => {
      const gs = evalMetric(model, s.x);
      const E = -(gs[0][0] * s.u[0] + gs[0][3] * s.u[3]);
      const L = gs[0][3] * s.u[0] + gs[3][3] * s.u[3];
      return { E, L };
    });
    const E0 = conserved[0].E;
    const L0 = conserved[0].L;
    for (const { E, L } of conserved) {
      expect(E).toBeCloseTo(E0, 6);
      expect(L).toBeCloseTo(L0, 6);
    }
  });
});
