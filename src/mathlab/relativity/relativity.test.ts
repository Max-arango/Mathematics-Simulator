import { describe, it, expect } from "vitest";
import { minkowski } from "./models/minkowski.ts";
import {
  makeSchwarzschild, schwarzschild, equatorialState, schwarzschildRadius, photonSphereRadius,
} from "./models/schwarzschild.ts";
import {
  inverseMetric, christoffelAt, riemann, ricci, ricciScalar, einstein, maxAbs,
} from "./metric.ts";
import { geodesic, fourVelocityNorm, equatorialStateFromEL } from "./geodesic.ts";
import { makeKerr, kerr, kerrOuterHorizon, ergosphereRadius } from "./models/kerr.ts";
import { DIM, type Coord, type MetricModel } from "./types.ts";

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

// ── Kerr (rotating, non-diagonal) ─────────────────────────────────────────────
describe("relativity / Kerr", () => {
  // Numerical central difference of a model's metric along coordinate α (for verifying ∂g).
  const numDg = (m: MetricModel, x: Coord, alpha: number, mu: number, nu: number, h = 1e-6) => {
    const xp = x.slice(); xp[alpha] += h; const xm = x.slice(); xm[alpha] -= h;
    return (m.g(xp)[mu][nu] - m.g(xm)[mu][nu]) / (2 * h);
  };

  it("horizon and ergosphere radii: r₊ = M+√(M²−a²), ergosphere = 2M at the equator", () => {
    expect(kerrOuterHorizon(1, 0)).toBeCloseTo(2, 12);            // a=0 ⇒ rs
    expect(kerrOuterHorizon(1, 0.6)).toBeCloseTo(1 + Math.sqrt(1 - 0.36), 12);
    expect(ergosphereRadius(1, 0.6, Math.PI / 2)).toBeCloseTo(2, 12); // equatorial ergosphere = 2M
  });

  it("is non-diagonal (g_tφ ≠ 0) — the frame-dragging term", () => {
    const g = kerr.g([0, 5, Math.PI / 2, 0]);
    expect(Math.abs(g[0][3])).toBeGreaterThan(1e-3);
    expect(g[0][3]).toBe(g[3][0]); // symmetric
  });

  it("analytic ∂g matches a numerical difference of g (hand-algebra guard)", () => {
    const km = makeKerr(0.5, 0.6);
    for (const x of [[0, 5, Math.PI / 2, 0], [0, 4, Math.PI / 3, 0], [0, 8, 1.1, 0]] as Coord[]) {
      const D = km.dg(x);
      for (let mu = 0; mu < DIM; mu++) for (let nu = 0; nu < DIM; nu++) {
        expect(D[1][mu][nu]).toBeCloseTo(numDg(km, x, 1, mu, nu), 5); // ∂_r
        expect(D[2][mu][nu]).toBeCloseTo(numDg(km, x, 2, mu, nu), 5); // ∂_θ
      }
    }
  });

  it("a → 0 reduces to Schwarzschild (metric and Christoffel)", () => {
    const km = makeKerr(0.5, 1e-6);
    for (const x of [[0, 4, Math.PI / 2, 0], [0, 6, Math.PI / 3, 0]] as Coord[]) {
      const gk = km.g(x), gs = schwarzschild.g(x);
      for (let a = 0; a < DIM; a++) for (let b = 0; b < DIM; b++) expect(gk[a][b]).toBeCloseTo(gs[a][b], 6);
      expect(maxAbs(christoffelAt(km, x).map((p, i) => p.map((row, j) => row.map((v, k) => v - christoffelAt(schwarzschild, x)[i][j][k]))))).toBeLessThan(1e-4);
    }
  });

  it("is a VACUUM solution: Ricci ≈ 0, Riemann ≠ 0 (even off the equator)", () => {
    const km = makeKerr(0.5, 0.5);
    const x: Coord = [0, 6, 1.2, 0];
    expect(maxAbs(ricci(km, x))).toBeLessThan(5e-3);
    expect(maxAbs(riemann(km, x))).toBeGreaterThan(1e-2);
  });

  it("frame dragging: a zero-angular-momentum infaller still rotates (dφ/dτ ≠ 0, prograde)", () => {
    const km = makeKerr(0.5, 0.6);
    const energy = (x: Coord, u: Coord) => { const g = km.g(x); return -(g[0][0] * u[0] + g[0][3] * u[3]); };
    const angMom = (x: Coord, u: Coord) => { const g = km.g(x); return g[3][0] * u[0] + g[3][3] * u[3]; };
    const { x0, u0 } = equatorialStateFromEL(km, 8, 0.97, 0, "timelike", -1); // L = 0 exactly
    expect(u0[3]).toBeGreaterThan(0); // u^φ > 0 despite zero angular momentum — dragging
    const gd = geodesic(km, x0, u0, 60, 4000);
    const E0 = energy(gd.x[0], gd.u[0]);
    for (let i = 0; i < gd.x.length; i += 300) {
      expect(Math.abs(angMom(gd.x[i], gd.u[i]))).toBeLessThan(1e-2); // L stays ≈ 0 (conserved)
      expect(Math.abs(energy(gd.x[i], gd.u[i]) - E0)).toBeLessThan(1e-2); // E conserved
    }
    const dPhi = gd.x[gd.x.length - 1][3] - gd.x[0][3];
    expect(dPhi).toBeGreaterThan(0.05); // dragged forward in φ
  });

  it("equatorialStateFromEL reduces to the Schwarzschild diagonal formula when a = 0", () => {
    const km = makeKerr(0.5, 0); // g_tφ = 0
    const r = 10, L = 4, f = 1 - 1 / r;
    const E = Math.sqrt(f * (1 + (L * L) / (r * r))); // turning point ⇒ u^r = 0, an allowed radius
    const { u0 } = equatorialStateFromEL(km, r, E, L, "timelike", -1);
    expect(u0[0]).toBeCloseTo(E / f, 9);       // u^t = E/f
    expect(u0[3]).toBeCloseTo(L / (r * r), 9); // u^φ = L/r²
    expect(fourVelocityNorm(km, [0, r, Math.PI / 2, 0], u0)).toBeCloseTo(-1, 6);
  });
});
