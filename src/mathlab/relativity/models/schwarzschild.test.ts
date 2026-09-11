import { describe, expect, it } from "vitest";
import { evalMetric } from "../metric.ts";
import { invertMetric } from "../inverseMetric.ts";
import { christoffelSymbols } from "../christoffel.ts";
import { curvatureAt } from "../curvature.ts";
import { integrateGeodesic } from "../geodesic.ts";
import { makeSchwarzschild } from "./schwarzschild.ts";

describe("Schwarzschild metric components", () => {
  it("matches -(1-2M/r), 1/(1-2M/r), r^2, r^2 sin^2(theta) at a sample point", () => {
    const M = 2, r = 5, theta = 1.3;
    const model = makeSchwarzschild(M);
    const g = evalMetric(model, [0, r, theta, 0]);
    expect(g[0][0]).toBeCloseTo(-(1 - (2 * M) / r), 12);
    expect(g[1][1]).toBeCloseTo(1 / (1 - (2 * M) / r), 12);
    expect(g[2][2]).toBeCloseTo(r * r, 12);
    expect(g[3][3]).toBeCloseTo(r * r * Math.sin(theta) * Math.sin(theta), 12);
    // Off-diagonal terms are zero (diagonal metric).
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (i !== j) expect(g[i][j]).toBe(0);
      }
    }
  });
});

describe("Schwarzschild inverse metric", () => {
  it("matches the known analytic inverse g^tt, g^rr, g^theta_theta, g^phi_phi", () => {
    const M = 2, r = 5, theta = 1.3;
    const model = makeSchwarzschild(M);
    const g = evalMetric(model, [0, r, theta, 0]);
    const res = invertMetric(g);
    expect(res.kind).toBe("exact");
    if (res.kind !== "exact") return;
    const expected = [
      [-1 / (1 - (2 * M) / r), 0, 0, 0],
      [0, 1 - (2 * M) / r, 0, 0],
      [0, 0, 1 / (r * r), 0],
      [0, 0, 0, 1 / (r * r * Math.sin(theta) * Math.sin(theta))],
    ];
    res.value.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(expected[i][j], 10)));
  });
});

describe("Schwarzschild M->0 reduces to flat space in spherical coordinates", () => {
  const r = 3, theta = 0.7;
  const model = makeSchwarzschild(0);

  it("has zero curvature (Riemann/Ricci/Einstein) at M=0", () => {
    const res = curvatureAt(model, [0, r, theta, 0.2]);
    expect(res.kind).toBe("exact");
    if (res.kind !== "exact") return;
    const { riemann, ricci, ricciScalar, einstein } = res.value;
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        for (let c = 0; c < 4; c++) {
          for (let d = 0; d < 4; d++) expect(riemann[a][b][c][d]).toBeCloseTo(0, 7);
        }
        expect(ricci[a][b]).toBeCloseTo(0, 7);
        expect(einstein[a][b]).toBeCloseTo(0, 7);
      }
    }
    expect(ricciScalar).toBeCloseTo(0, 7);
  });

  it("Christoffel symbols match the known flat-spherical formulas", () => {
    const res = christoffelSymbols(model, [0, r, theta, 0.2]);
    expect(res.kind).toBe("exact");
    if (res.kind !== "exact") return;
    const gamma = res.value; // gamma[mu][alpha][beta] = Γ^mu_(alpha beta)

    // Coordinate order is [t, r, theta, phi] = indices [0, 1, 2, 3].
    const expected = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => new Array<number>(4).fill(0)));
    expected[1][2][2] = -r;                                       // Γ^r_θθ = -r
    expected[2][1][2] = expected[2][2][1] = 1 / r;                // Γ^θ_rθ = Γ^θ_θr = 1/r
    expected[1][3][3] = -r * Math.sin(theta) * Math.sin(theta);   // Γ^r_φφ = -r sin²θ
    expected[2][3][3] = -Math.sin(theta) * Math.cos(theta);       // Γ^θ_φφ = -sinθ cosθ
    expected[3][1][3] = expected[3][3][1] = 1 / r;                // Γ^φ_rφ = Γ^φ_φr = 1/r
    expected[3][2][3] = expected[3][3][2] = Math.cos(theta) / Math.sin(theta); // Γ^φ_θφ = Γ^φ_φθ = cotθ

    for (let mu = 0; mu < 4; mu++) {
      for (let alpha = 0; alpha < 4; alpha++) {
        for (let beta = 0; beta < 4; beta++) {
          expect(gamma[mu][alpha][beta]).toBeCloseTo(expected[mu][alpha][beta], 9);
        }
      }
    }
  });
});

describe("Schwarzschild vacuum solution (M>0)", () => {
  it("has genuinely nonzero Riemann curvature but Ricci-flat (Ricci/Einstein ≈ 0)", () => {
    const M = 2, r = 10, theta = 1.1;
    const model = makeSchwarzschild(M);
    const res = curvatureAt(model, [0, r, theta, 0.3]);
    expect(res.kind).toBe("exact");
    if (res.kind !== "exact") return;
    const { riemann, ricci, ricciScalar, einstein } = res.value;

    // Tidal curvature is real: some Riemann component is far above the
    // finite-difference noise floor (~1e-9, see DEFAULT_CURVATURE_STEP in
    // curvature.ts) for a Schwarzschild mass at a few times the horizon.
    let maxRiemann = 0;
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        for (let c = 0; c < 4; c++) {
          for (let d = 0; d < 4; d++) maxRiemann = Math.max(maxRiemann, Math.abs(riemann[a][b][c][d]));
        }
      }
    }
    expect(maxRiemann).toBeGreaterThan(1e-3);

    // Vacuum: despite nonzero Riemann, G_mu_nu = 0 (and hence Ricci = 0).
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        expect(ricci[a][b]).toBeCloseTo(0, 7);
        expect(einstein[a][b]).toBeCloseTo(0, 7);
      }
    }
    expect(ricciScalar).toBeCloseTo(0, 7);
  });
});

describe("Schwarzschild validRegion", () => {
  it("rejects r <= 2M and r <= 0, accepts r > 2M", () => {
    const model = makeSchwarzschild(1);
    expect(model.validRegion?.([0, 1.999, 0.5, 0])).toBe(false); // just inside horizon
    expect(model.validRegion?.([0, 2, 0.5, 0])).toBe(false);     // exactly on horizon
    expect(model.validRegion?.([0, 0, 0.5, 0])).toBe(false);     // true singularity
    expect(model.validRegion?.([0, -1, 0.5, 0])).toBe(false);    // unphysical negative r
    expect(model.validRegion?.([0, 2.001, 0.5, 0])).toBe(true);
    expect(model.validRegion?.([0, 100, 0.5, 0])).toBe(true);
  });
});

describe("Schwarzschild geodesic conserved quantities", () => {
  it("keeps E = -g_tt (dt/dτ) and L = g_φφ (dφ/dτ) constant along an equatorial geodesic", () => {
    const M = 1;
    const model = makeSchwarzschild(M);
    const r0 = 10 * M;
    const theta0 = Math.PI / 2;
    const uphi = 0.03;

    // Fix u^r = 0 and solve u^t from the timelike normalization
    // g_mu_nu u^mu u^nu = -1 (equatorial, so u^theta = 0 stays 0 by symmetry).
    const gtt = -(1 - (2 * M) / r0);
    const gphiphi = r0 * r0 * Math.sin(theta0) * Math.sin(theta0);
    const ut = Math.sqrt((-1 - gphiphi * uphi * uphi) / gtt);

    const x0 = [0, r0, theta0, 0];
    const u0 = [ut, 0, 0, uphi];
    const result = integrateGeodesic(model, x0, u0, { tau0: 0, tau1: 50, h: 0.05 });

    expect(result.termination).toBe("completed");
    expect(result.states.length).toBeGreaterThan(100);

    const conserved = result.states.map((s) => {
      const g = evalMetric(model, s.x);
      return { E: -g[0][0] * s.u[0], L: g[3][3] * s.u[3] };
    });
    const E0 = conserved[0].E;
    const L0 = conserved[0].L;
    for (const { E, L } of conserved) {
      expect(E).toBeCloseTo(E0, 8);
      expect(L).toBeCloseTo(L0, 8);
    }
  });
});
