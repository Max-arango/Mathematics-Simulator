import { describe, it, expect } from "vitest";
import { laplace2d } from "./laplace2d.ts";
import { InvalidInputError } from "../core/errors.ts";

// Cross-validation against KNOWN harmonic fields (spec §71): a harmonic boundary must
// reproduce its harmonic interior. u[i][j] holds the value at (x_i, y_j) with
// x_i = i/(nx-1), y_j = j/(ny-1) on the unit square.
const N = 21;
const x = (i: number) => i / (N - 1);
const y = (j: number) => j / (N - 1);
// max |u - exact(x_i,y_j)| over interior nodes.
const interiorErr = (u: number[][], exact: (x: number, y: number) => number): number => {
  let e = 0;
  for (let i = 1; i < u.length - 1; i++) for (let j = 1; j < u[i].length - 1; j++) e = Math.max(e, Math.abs(u[i][j] - exact(x(i), y(j))));
  return e;
};

describe("laplace2d — harmonic boundary reproduces harmonic interior", () => {
  it("linear u=x on the boundary ⇒ interior u(x,y)=x (linear fns are harmonic)", () => {
    const r = laplace2d({ nx: N, ny: N, boundary: { left: 0, right: 1, bottom: (xx) => xx, top: (xx) => xx } });
    expect(r.converged).toBe(true);
    expect(interiorErr(r.u, (xx) => xx)).toBeLessThan(1e-3);
  });

  it("linear u=y on the boundary ⇒ interior u(x,y)=y", () => {
    const r = laplace2d({ nx: N, ny: N, boundary: { bottom: 0, top: 1, left: (yy) => yy, right: (yy) => yy } });
    expect(r.converged).toBe(true);
    expect(interiorErr(r.u, (_xx, yy) => yy)).toBeLessThan(1e-3);
  });

  it("harmonic u=x²−y² on the boundary ⇒ interior matches x²−y²", () => {
    const h = (xx: number, yy: number) => xx * xx - yy * yy;
    const r = laplace2d({
      nx: N, ny: N,
      boundary: { left: (yy) => h(0, yy), right: (yy) => h(1, yy), bottom: (xx) => h(xx, 0), top: (xx) => h(xx, 1) },
    });
    expect(r.converged).toBe(true);
    expect(interiorErr(r.u, h)).toBeLessThan(2e-3);
  });

  it("constant boundary ⇒ constant interior (warm start converges immediately)", () => {
    const r = laplace2d({ nx: N, ny: N, boundary: { left: 5, right: 5, top: 5, bottom: 5 } });
    expect(r.converged).toBe(true);
    expect(interiorErr(r.u, () => 5)).toBeLessThan(1e-9);
  });
});

describe("laplace2d — Poisson source term ∇²u=f", () => {
  it("f=2 with u=x² boundary ⇒ interior u(x,y)=x² (since ∇²x²=2)", () => {
    const r = laplace2d({
      nx: N, ny: N, source: () => 2,
      boundary: { left: 0, right: 1, bottom: (xx) => xx * xx, top: (xx) => xx * xx },
    });
    expect(r.converged).toBe(true);
    expect(interiorErr(r.u, (xx) => xx * xx)).toBeLessThan(2e-3);
  });
});

describe("laplace2d — convergence honesty (spec §27) and maximum principle", () => {
  it("a mixed-BC case converges with residual < tol", () => {
    const r = laplace2d({ nx: N, ny: N, boundary: { left: 1, right: 2, top: 3, bottom: 4 }, tol: 1e-6 });
    expect(r.converged).toBe(true);
    expect(r.residual).toBeLessThan(1e-6);
    expect(r.warnings).toEqual([]);
  });

  it("reports converged:false HONESTLY when capped at maxIter=1", () => {
    const r = laplace2d({ nx: N, ny: N, boundary: { left: 1, right: 2, top: 3, bottom: 4 }, maxIter: 1 });
    expect(r.iterations).toBe(1);
    expect(r.converged).toBe(false);
    expect(r.residual).toBeGreaterThan(1e-6);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatch(/not converged/i);
  });

  it("obeys the discrete maximum principle: interior max ≤ boundary max", () => {
    // ramp boundary: bottom edge = x (max 1), other edges 0 ⇒ boundary max = 1, min = 0.
    const r = laplace2d({ nx: N, ny: N, boundary: { bottom: (xx) => xx, top: 0, left: 0, right: 0 } });
    expect(r.converged).toBe(true);
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 1; i < N - 1; i++) for (let j = 1; j < N - 1; j++) { mn = Math.min(mn, r.u[i][j]); mx = Math.max(mx, r.u[i][j]); }
    expect(mx).toBeLessThanOrEqual(1 + 1e-9);
    expect(mn).toBeGreaterThanOrEqual(0 - 1e-9);
  });

  it("carries the right result shape (nx×ny)", () => {
    const r = laplace2d({ nx: 7, ny: 5, boundary: { left: 0, right: 0, top: 0, bottom: 0 } });
    expect(r.u.length).toBe(7);
    expect(r.u.every((col) => col.length === 5)).toBe(true);
  });
});

describe("laplace2d — input validation", () => {
  it("rejects a grid coarser than 3 points per axis", () => {
    expect(() => laplace2d({ nx: 2, ny: 5, boundary: { left: 0, right: 0, top: 0, bottom: 0 } })).toThrow(InvalidInputError);
  });
});
