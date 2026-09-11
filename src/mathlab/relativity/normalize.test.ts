import { describe, expect, it } from "vitest";
import { evalMetric } from "./metric.ts";
import { normalizeTimelikeVelocity } from "./normalize.ts";
import { minkowski } from "./models/minkowski.ts";
import { makeSchwarzschild } from "./models/schwarzschild.ts";
import { makeKerr } from "./models/kerr.ts";

describe("normalizeTimelikeVelocity", () => {
  it("Minkowski: a particle at rest gets u^t=1 (proper time = coordinate time)", () => {
    const x0 = [0, 0, 0, 0];
    const res = normalizeTimelikeVelocity(minkowski, x0, [0, 0, 0]);
    expect(res.kind).toBe("exact");
    if (res.kind !== "exact") return;
    expect(res.value).toEqual([1, 0, 0, 0]);
  });

  it("Schwarzschild equatorial: matches hand-solved quadratic and satisfies g_mu_nu u^mu u^nu = -1", () => {
    const M = 1;
    const model = makeSchwarzschild(M);
    const r0 = 10 * M, theta0 = Math.PI / 2, uphi = 0.03;
    const x0 = [0, r0, theta0, 0];

    const res = normalizeTimelikeVelocity(model, x0, [0, 0, uphi]);
    expect(res.kind).toBe("exact");
    if (res.kind !== "exact") return;
    const [ut, ur, uth, uph] = res.value;
    expect(ur).toBe(0);
    expect(uth).toBe(0);
    expect(uph).toBe(uphi);

    // Hand-solve: gtt*ut^2 + gphiphi*uphi^2 = -1  =>  ut = sqrt((-1-gphiphi*uphi^2)/gtt).
    const gtt = -(1 - (2 * M) / r0);
    const gphiphi = r0 * r0;
    const utExpected = Math.sqrt((-1 - gphiphi * uphi * uphi) / gtt);
    expect(ut).toBeCloseTo(utExpected, 10);
    expect(ut).toBeGreaterThan(0);

    // Confirm the full 4-velocity satisfies the timelike unit-norm condition.
    const g = evalMetric(model, x0);
    let norm = 0;
    for (let mu = 0; mu < 4; mu++) for (let nu = 0; nu < 4; nu++) norm += g[mu][nu] * res.value[mu] * res.value[nu];
    expect(norm).toBeCloseTo(-1, 9);
  });

  it("Kerr equatorial (off-diagonal g_tphi): matches hand-solved quadratic and satisfies the norm condition", () => {
    const M = 1, a = 0.5;
    const model = makeKerr(M, a);
    const r0 = 20 * M, theta0 = Math.PI / 2, uphi = 0.02;
    const x0 = [0, r0, theta0, 0];

    const g = evalMetric(model, x0);
    const gtt = g[0][0], gtphi = g[0][3], gphiphi = g[3][3];
    const A = gtt, B = 2 * gtphi * uphi, C = gphiphi * uphi * uphi + 1;
    const disc = B * B - 4 * A * C;
    expect(disc).toBeGreaterThan(0);
    const utExpected = (-B - Math.sqrt(disc)) / (2 * A); // future-directed root (matches kerr.test.ts pattern)

    const res = normalizeTimelikeVelocity(model, x0, [0, 0, uphi]);
    expect(res.kind).toBe("exact");
    if (res.kind !== "exact") return;
    const [ut] = res.value;
    expect(ut).toBeCloseTo(utExpected, 10);
    expect(ut).toBeGreaterThan(0);

    let norm = 0;
    for (let mu = 0; mu < 4; mu++) for (let nu = 0; nu < 4; nu++) norm += g[mu][nu] * res.value[mu] * res.value[nu];
    expect(norm).toBeCloseTo(-1, 9);
  });

  it("returns domainError for a static observer inside the Kerr ergosphere (physically forbidden)", () => {
    // Frame dragging inside the ergosphere (r_+ < r < 2M at the equator) makes
    // g_tt > 0, so a "static" (u^phi=0) worldline can never be timelike there —
    // no real u^t solves the norm condition.
    const M = 1, a = 0.9;
    const model = makeKerr(M, a);
    const rPlus = M + Math.sqrt(M * M - a * a);
    const r0 = 1.6; // inside the ergosphere: rPlus < r0 < 2M
    expect(r0).toBeGreaterThan(rPlus);
    expect(r0).toBeLessThan(2 * M);
    const res = normalizeTimelikeVelocity(model, [0, r0, Math.PI / 2, 0], [0, 0, 0]);
    expect(res.kind).toBe("domainError");
  });

  it("throws on a spatial-velocity vector of the wrong length", () => {
    expect(() => normalizeTimelikeVelocity(minkowski, [0, 0, 0, 0], [0, 0])).toThrow();
  });
});
