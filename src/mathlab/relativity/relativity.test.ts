import { describe, it, expect } from "vitest";
import { minkowski } from "./models/minkowski.ts";
import {
  makeSchwarzschild, schwarzschild, equatorialState, schwarzschildRadius, photonSphereRadius,
} from "./models/schwarzschild.ts";
import {
  inverseMetric, christoffelAt, riemann, ricci, ricciScalar, einstein, maxAbs,
} from "./metric.ts";
import { geodesic, fourVelocityNorm } from "./geodesic.ts";
import type { Coord, MetricModel } from "./types.ts";

// ── Minkowski: the flat baseline ──────────────────────────────────────────────
describe("relativity / Minkowski (flat baseline)", () => {
  const x: Coord = [0, 1, 2, 3];

  it("metric is diag(−1,1,1,1) and self-inverse", () => {
    expect(minkowski.g(x)).toEqual([[-1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]);
    const gi = inverseMetric(minkowski.g(x)); // (LU inverse may carry −0; compare numerically)
    const expected = [[-1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) expect(gi[a][b]).toBeCloseTo(expected[a][b], 12);
  });

  it("all Christoffel symbols vanish", () => {
    expect(maxAbs(christoffelAt(minkowski, x))).toBeCloseTo(0, 12);
  });

  it("Riemann, Ricci and Ricci scalar all vanish", () => {
    expect(maxAbs(riemann(minkowski, x))).toBeCloseTo(0, 8);
    expect(maxAbs(ricci(minkowski, x))).toBeCloseTo(0, 8);
    expect(ricciScalar(minkowski, x)).toBeCloseTo(0, 8);
    expect(maxAbs(einstein(minkowski, x))).toBeCloseTo(0, 8);
  });

  it("geodesics are straight lines x(τ) = x0 + uτ", () => {
    const x0: Coord = [0, 0, 0, 0], u0: Coord = [1, 0.3, -0.2, 0.1];
    const gd = geodesic(minkowski, x0, u0, 10, 500);
    expect(gd.termination).toBe("reached-tau");
    const last = gd.x[gd.x.length - 1], tau = gd.tau[gd.tau.length - 1];
    for (let m = 0; m < 4; m++) expect(last[m]).toBeCloseTo(x0[m] + u0[m] * tau, 6);
  });
});

// ── Schwarzschild ─────────────────────────────────────────────────────────────
describe("relativity / Schwarzschild", () => {
  const M = 0.5, rs = 1; // makeSchwarzschild(0.5) ⇒ rs = 1
  const sc = schwarzschild;

  it("radii helpers: rs = 2M, photon sphere = 3M", () => {
    expect(schwarzschildRadius(M)).toBe(1);
    expect(photonSphereRadius(M)).toBe(1.5);
  });

  it("metric matches diag(−f,1/f,r²,r²sin²θ) and g·g⁻¹ = I", () => {
    const r = 4, th = Math.PI / 2, x: Coord = [0, r, th, 0];
    const f = 1 - rs / r;
    const g = sc.g(x);
    expect(g[0][0]).toBeCloseTo(-f, 12);
    expect(g[1][1]).toBeCloseTo(1 / f, 12);
    expect(g[2][2]).toBeCloseTo(r * r, 12);
    expect(g[3][3]).toBeCloseTo(r * r, 12); // sin²(π/2)=1
    const gi = inverseMetric(g);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      let s = 0; for (let k = 0; k < 4; k++) s += g[a][k] * gi[k][b];
      expect(s).toBeCloseTo(a === b ? 1 : 0, 10);
    }
  });

  it("Christoffel symbols match the analytic Schwarzschild values", () => {
    const r = 4, x: Coord = [0, r, Math.PI / 2, 0];
    const G = christoffelAt(sc, x);
    expect(G[1][2][2]).toBeCloseTo(-(r - rs), 9);           // Γ^r_θθ = −(r−rs)
    expect(G[2][1][2]).toBeCloseTo(1 / r, 9);               // Γ^θ_rθ = 1/r
    expect(G[3][1][3]).toBeCloseTo(1 / r, 9);               // Γ^φ_rφ = 1/r
    expect(G[0][0][1]).toBeCloseTo(M / (r * (r - 2 * M)), 9); // Γ^t_tr = M/(r(r−2M))
    expect(G[1][0][0]).toBeCloseTo((M * (r - 2 * M)) / r ** 3, 9); // Γ^r_tt
    // Γ^θ_φφ = −sinθ cosθ, tested off the equator.
    const xt: Coord = [0, r, Math.PI / 3, 0];
    expect(christoffelAt(sc, xt)[2][3][3]).toBeCloseTo(-Math.sin(Math.PI / 3) * Math.cos(Math.PI / 3), 6);
    expect(G[0][0][1]).toBeCloseTo(G[0][1][0], 12); // symmetric in lower indices
  });

  it("is a VACUUM solution: Ricci ≈ 0, yet Riemann is genuinely non-zero", () => {
    const x: Coord = [0, 4, Math.PI / 2, 0];
    const ricciMag = maxAbs(ricci(sc, x));
    const riemannMag = maxAbs(riemann(sc, x));
    expect(ricciMag).toBeLessThan(1e-4);      // vacuum (numerical residual only)
    expect(riemannMag).toBeGreaterThan(1e-2); // real tidal curvature
    expect(riemannMag).toBeGreaterThan(ricciMag * 100); // curvature ≫ Ricci residual
  });

  it("M → 0 reduces to flat space (curvature ∝ M vanishes)", () => {
    const x: Coord = [0, 4, Math.PI / 2, 0];
    const small = makeSchwarzschild(0.01);
    const rBig = maxAbs(riemann(sc, x));       // ~1e-2 at M=0.5
    const rSmall = maxAbs(riemann(small, x));  // 50× smaller M ⇒ ~50× less curvature
    expect(rSmall).toBeLessThan(rBig * 0.05);  // curvature scales with M → 0
    expect(Math.abs(ricciScalar(small, x))).toBeLessThan(1e-4);
  });

  it("domain guard rejects the horizon interior and coordinate poles", () => {
    expect(sc.domain([0, 0.5, Math.PI / 2, 0]).ok).toBe(false); // r < rs
    expect(sc.domain([0, 4, 1e-6, 0]).ok).toBe(false);          // pole
    expect(sc.domain([0, 4, Math.PI / 2, 0]).ok).toBe(true);
  });
});

// ── Schwarzschild geodesics: conserved quantities ─────────────────────────────
describe("relativity / Schwarzschild geodesics", () => {
  const sc = schwarzschild; // rs = 1
  const energy = (m: MetricModel, x: Coord, u: Coord) => -m.g(x)[0][0] * u[0]; // E = f·u^t = −g_tt u^t
  const angMom = (m: MetricModel, x: Coord, u: Coord) => m.g(x)[3][3] * u[3];  // L = r²sin²θ·u^φ

  it("a bound equatorial orbit conserves E, L and the 4-velocity norm", () => {
    // Aphelion start of an eccentric orbit with turning points ≈ (6, 15) at rs=1.
    const ra = 15, L = 2.294;
    const E = Math.sqrt((1 - 1 / ra) * (1 + (L * L) / (ra * ra))); // E² = V_eff(ra), u^r = 0
    const { x0, u0 } = equatorialState(sc, ra, E, L, "timelike", -1);
    expect(fourVelocityNorm(sc, x0, u0)).toBeCloseTo(-1, 6); // properly timelike

    const gd = geodesic(sc, x0, u0, 400, 8000);
    expect(gd.termination).toBe("reached-tau");
    const E0 = energy(sc, gd.x[0], gd.u[0]), L0 = angMom(sc, gd.x[0], gd.u[0]);
    for (let i = 0; i < gd.x.length; i += 200) {
      expect(Math.abs(energy(sc, gd.x[i], gd.u[i]) - E0)).toBeLessThan(1e-3);
      expect(Math.abs(angMom(sc, gd.x[i], gd.u[i]) - L0)).toBeLessThan(1e-3);
      expect(Math.abs(fourVelocityNorm(sc, gd.x[i], gd.u[i]) + 1)).toBeLessThan(1e-3);
    }
    // it swings inward to a perihelion well inside the aphelion (a real, eccentric orbit).
    const rMin = Math.min(...gd.x.map((p) => p[1]));
    expect(rMin).toBeLessThan(10);
    expect(rMin).toBeGreaterThan(2); // stays outside the horizon (it's bound, not plunging)
  });

  it("a low-angular-momentum orbit plunges through the horizon (halts in-domain)", () => {
    const { x0, u0 } = equatorialState(sc, 8, 0.97, 1.0, "timelike", -1);
    const gd = geodesic(sc, x0, u0, 100, 4000);
    expect(gd.termination).toBe("left-domain");
    expect(gd.x[gd.x.length - 1][1]).toBeLessThan(2); // ended near/at the horizon rs=1
  });
});
