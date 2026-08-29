import { describe, it, expect } from "vitest";
import { parse } from "../core/parser.ts";
import {
  gradient,
  hessian,
  jacobian,
  laplacian,
  evalAt,
  gradientAt,
  hessianAt,
  jacobianAt,
  laplacianAt,
  numGradient,
} from "./vectorCalculus.ts";
import type { Node } from "../core/ast.ts";

// Build a black-box f(point) from a symbolic expr for finite differences.
const asFn = (expr: Node, vars: string[]) => (p: number[]) => evalAt(expr, vars, p);

describe("gradient", () => {
  it("f = x^2 + x*y + sin(y): ∂/∂x = 2x + y at (1,2)", () => {
    const f = parse("x^2 + x*y + sin(y)");
    const g = gradientAt(f, ["x", "y"], [1, 2]);
    expect(g[0]).toBeCloseTo(2 * 1 + 2, 9);
  });

  it("f = x^2 + x*y + sin(y): ∂/∂y = x + cos(y) at (1,2)", () => {
    const f = parse("x^2 + x*y + sin(y)");
    const g = gradientAt(f, ["x", "y"], [1, 2]);
    expect(g[1]).toBeCloseTo(1 + Math.cos(2), 9);
  });

  it("f = x^2 + x*y + sin(y): symbolic grad matches finite differences", () => {
    const f = parse("x^2 + x*y + sin(y)");
    const vars = ["x", "y"];
    const p = [1.3, -0.7];
    const sym = gradientAt(f, vars, p);
    const fd = numGradient(asFn(f, vars), p);
    sym.forEach((s, i) => expect(s).toBeCloseTo(fd[i], 4));
  });

  it("f = x^2 + y^2 + z^2: grad = [2x, 2y, 2z]", () => {
    const f = parse("x^2 + y^2 + z^2");
    const g = gradientAt(f, ["x", "y", "z"], [1, 2, 3]);
    expect(g).toEqual([2, 4, 6]);
  });

  it("f = x^2 + y^2 + z^2: matches finite differences", () => {
    const f = parse("x^2 + y^2 + z^2");
    const vars = ["x", "y", "z"];
    const p = [0.5, -1.1, 2.2];
    const sym = gradientAt(f, vars, p);
    const fd = numGradient(asFn(f, vars), p);
    sym.forEach((s, i) => expect(s).toBeCloseTo(fd[i], 4));
  });

  it("f = exp(x+y): grad = [exp(x+y), exp(x+y)]", () => {
    const f = parse("exp(x + y)");
    const g = gradientAt(f, ["x", "y"], [0.4, 0.1]);
    const e = Math.exp(0.5);
    expect(g[0]).toBeCloseTo(e, 9);
    expect(g[1]).toBeCloseTo(e, 9);
  });

  it("f = exp(x+y): matches finite differences", () => {
    const f = parse("exp(x + y)");
    const vars = ["x", "y"];
    const p = [0.4, 0.1];
    const sym = gradientAt(f, vars, p);
    const fd = numGradient(asFn(f, vars), p);
    sym.forEach((s, i) => expect(s).toBeCloseTo(fd[i], 4));
  });

  it("f = sin(x*y): ∂/∂x = y*cos(x*y), ∂/∂y = x*cos(x*y)", () => {
    const f = parse("sin(x*y)");
    const p = [1.2, 0.8];
    const g = gradientAt(f, ["x", "y"], p);
    expect(g[0]).toBeCloseTo(0.8 * Math.cos(1.2 * 0.8), 9);
    expect(g[1]).toBeCloseTo(1.2 * Math.cos(1.2 * 0.8), 9);
  });

  it("f = sin(x*y): matches finite differences", () => {
    const f = parse("sin(x*y)");
    const vars = ["x", "y"];
    const p = [1.2, 0.8];
    const sym = gradientAt(f, vars, p);
    const fd = numGradient(asFn(f, vars), p);
    sym.forEach((s, i) => expect(s).toBeCloseTo(fd[i], 4));
  });

  it("gradient returns one node per variable", () => {
    const f = parse("x + y + z");
    expect(gradient(f, ["x", "y", "z"]).length).toBe(3);
  });

  it("numGradient of a plain closure (no AST)", () => {
    const f = (p: number[]) => p[0] * p[0] + 3 * p[1];
    const g = numGradient(f, [2, 5]);
    expect(g[0]).toBeCloseTo(4, 4);
    expect(g[1]).toBeCloseTo(3, 4);
  });
});

describe("hessian", () => {
  it("f = x^2 + y^2: H = [[2,0],[0,2]]", () => {
    const f = parse("x^2 + y^2");
    const H = hessianAt(f, ["x", "y"], [1, 1]);
    expect(H).toEqual([
      [2, 0],
      [0, 2],
    ]);
  });

  it("f = x*y: H = [[0,1],[1,0]]", () => {
    const f = parse("x*y");
    const H = hessianAt(f, ["x", "y"], [3, 4]);
    expect(H).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("f = x^2 + x*y + sin(y): H = [[2,1],[1,-sin(y)]]", () => {
    const f = parse("x^2 + x*y + sin(y)");
    const H = hessianAt(f, ["x", "y"], [1, 0.6]);
    expect(H[0][0]).toBeCloseTo(2, 9);
    expect(H[0][1]).toBeCloseTo(1, 9);
    expect(H[1][0]).toBeCloseTo(1, 9);
    expect(H[1][1]).toBeCloseTo(-Math.sin(0.6), 9);
  });

  it("symmetry H_ij ≈ H_ji for exp(x+y)", () => {
    const f = parse("exp(x + y)");
    const H = hessianAt(f, ["x", "y"], [0.3, 0.2]);
    expect(H[0][1]).toBeCloseTo(H[1][0], 9);
  });

  it("symmetry for sin(x*y) at (1.1, 0.9)", () => {
    const f = parse("sin(x*y)");
    const H = hessianAt(f, ["x", "y"], [1.1, 0.9]);
    expect(H[0][1]).toBeCloseTo(H[1][0], 9);
  });

  it("symmetry for x^2*y^2 + x at (1.3, -0.7)", () => {
    const f = parse("x^2*y^2 + x");
    const H = hessianAt(f, ["x", "y"], [1.3, -0.7]);
    expect(H[0][1]).toBeCloseTo(H[1][0], 9);
  });

  it("f = exp(x+y): all entries equal exp(x+y)", () => {
    const f = parse("exp(x + y)");
    const e = Math.exp(0.5);
    const H = hessianAt(f, ["x", "y"], [0.3, 0.2]);
    for (const row of H) for (const v of row) expect(v).toBeCloseTo(e, 9);
  });

  it("3-variable Hessian is symmetric for x*y + y*z + x*z", () => {
    const f = parse("x*y + y*z + x*z");
    const vars = ["x", "y", "z"];
    const H = hessianAt(f, vars, [1, 2, 3]);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) expect(H[i][j]).toBeCloseTo(H[j][i], 9);
    expect(H[0][0]).toBeCloseTo(0, 9);
    expect(H[0][1]).toBeCloseTo(1, 9);
  });

  it("hessian is n×n", () => {
    const f = parse("x^2 + y^2 + z^2");
    const H = hessian(f, ["x", "y", "z"]);
    expect(H.length).toBe(3);
    expect(H[0].length).toBe(3);
  });

  it("Hessian second-mixed matches finite-diff of gradient (sin(x*y))", () => {
    const f = parse("sin(x*y)");
    const vars = ["x", "y"];
    const p = [1.1, 0.9];
    // d/dy of (∂f/∂x) via finite differences on the symbolic gradient
    const dfdx = gradient(f, vars)[0];
    const h = 1e-5;
    const up = evalAt(dfdx, vars, [p[0], p[1] + h]);
    const dn = evalAt(dfdx, vars, [p[0], p[1] - h]);
    const H = hessianAt(f, vars, p);
    expect(H[0][1]).toBeCloseTo((up - dn) / (2 * h), 4);
  });
});

describe("jacobian", () => {
  it("F = [x^2 + y, x*y]: J = [[2x,1],[y,x]]", () => {
    const F = [parse("x^2 + y"), parse("x*y")];
    const J = jacobianAt(F, ["x", "y"], [2, 3]);
    expect(J).toEqual([
      [4, 1],
      [3, 2],
    ]);
  });

  it("polar map [r*cos(t), r*sin(t)]: det J = r", () => {
    const F = [parse("r*cos(t)"), parse("r*sin(t)")];
    const vars = ["r", "t"];
    const r = 2.5;
    const p = [r, 0.7];
    const J = jacobianAt(F, vars, p);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    expect(det).toBeCloseTo(r, 9);
  });

  it("polar map det J = r at another point", () => {
    const F = [parse("r*cos(t)"), parse("r*sin(t)")];
    const vars = ["r", "t"];
    const r = 1.3;
    const J = jacobianAt(F, vars, [r, -1.2]);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    expect(det).toBeCloseTo(r, 9);
  });

  it("Jacobian rows = # components, cols = # vars", () => {
    const F = [parse("x + y"), parse("x - y"), parse("x*y")];
    const J = jacobian(F, ["x", "y"]);
    expect(J.length).toBe(3);
    expect(J[0].length).toBe(2);
  });

  it("F = [x^2+y, x*y] symbolic Jacobian matches finite differences", () => {
    const F = [parse("x^2 + y"), parse("x*y")];
    const vars = ["x", "y"];
    const p = [1.7, -0.4];
    const J = jacobianAt(F, vars, p);
    F.forEach((fi, i) => {
      const fd = numGradient(asFn(fi, vars), p);
      J[i].forEach((jij, j) => expect(jij).toBeCloseTo(fd[j], 4));
    });
  });

  it("polar map Jacobian matches finite differences", () => {
    const F = [parse("r*cos(t)"), parse("r*sin(t)")];
    const vars = ["r", "t"];
    const p = [2.0, 0.5];
    const J = jacobianAt(F, vars, p);
    F.forEach((fi, i) => {
      const fd = numGradient(asFn(fi, vars), p);
      J[i].forEach((jij, j) => expect(jij).toBeCloseTo(fd[j], 4));
    });
  });

  it("identity map [x, y, z] Jacobian is the identity", () => {
    const F = [parse("x"), parse("y"), parse("z")];
    const J = jacobianAt(F, ["x", "y", "z"], [5, 6, 7]);
    expect(J).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
  });

  it("linear map [2x+3y, x-y] has constant Jacobian", () => {
    const F = [parse("2*x + 3*y"), parse("x - y")];
    const J = jacobianAt(F, ["x", "y"], [9, -3]);
    expect(J).toEqual([
      [2, 3],
      [1, -1],
    ]);
  });

  it("3D spherical-ish component ∂/∂ of exp(x)*y", () => {
    const F = [parse("exp(x)*y")];
    const vars = ["x", "y"];
    const p = [0.3, 2.0];
    const J = jacobianAt(F, vars, p);
    expect(J[0][0]).toBeCloseTo(Math.exp(0.3) * 2.0, 9);
    expect(J[0][1]).toBeCloseTo(Math.exp(0.3), 9);
  });

  it("Jacobian of single-component field equals its gradient (as a row)", () => {
    const f = parse("x^2 + x*y + sin(y)");
    const vars = ["x", "y"];
    const p = [1, 2];
    const J = jacobianAt([f], vars, p);
    const g = gradientAt(f, vars, p);
    expect(J[0]).toEqual(g);
  });
});

describe("laplacian", () => {
  it("∇²(x^2 + y^2) = 4", () => {
    const f = parse("x^2 + y^2");
    expect(laplacianAt(f, ["x", "y"], [1, 1])).toBeCloseTo(4, 9);
  });

  it("∇²(x^2 + y^2 + z^2) = 6", () => {
    const f = parse("x^2 + y^2 + z^2");
    expect(laplacianAt(f, ["x", "y", "z"], [1, 2, 3])).toBeCloseTo(6, 9);
  });

  it("harmonic x^2 - y^2 → ∇² = 0", () => {
    const f = parse("x^2 - y^2");
    expect(laplacianAt(f, ["x", "y"], [3, 4])).toBeCloseTo(0, 9);
  });

  it("harmonic sin(x)*exp(y) → ∇² = 0", () => {
    const f = parse("sin(x)*exp(y)");
    expect(laplacianAt(f, ["x", "y"], [0.7, 0.3])).toBeCloseTo(0, 9);
  });

  it("harmonic exp(x)*cos(y) → ∇² = 0", () => {
    const f = parse("exp(x)*cos(y)");
    expect(laplacianAt(f, ["x", "y"], [0.5, 1.1])).toBeCloseTo(0, 9);
  });

  it("laplacianAt equals sum of second-derivative evals", () => {
    const f = parse("x^2*y + y^3 + sin(x)");
    const vars = ["x", "y"];
    const p = [1.2, 0.8];
    const H = hessianAt(f, vars, p);
    const traceH = H[0][0] + H[1][1];
    expect(laplacianAt(f, vars, p)).toBeCloseTo(traceH, 9);
  });

  it("laplacian = trace of Hessian (3D)", () => {
    const f = parse("x^2*y + y*z^2 + x*z");
    const vars = ["x", "y", "z"];
    const p = [1, 2, 3];
    const H = hessianAt(f, vars, p);
    const trace = H[0][0] + H[1][1] + H[2][2];
    expect(laplacianAt(f, vars, p)).toBeCloseTo(trace, 9);
  });

  it("∇²(x^3) = 6x", () => {
    const f = parse("x^3");
    expect(laplacianAt(f, ["x"], [2])).toBeCloseTo(12, 9);
  });

  it("laplacian returns a single node", () => {
    const f = parse("x^2 + y^2");
    const l = laplacian(f, ["x", "y"]);
    expect(evalAt(l, ["x", "y"], [1, 1])).toBeCloseTo(4, 9);
  });

  it("∇²(ln(x^2+y^2)) = 0 (2D fundamental sol, off origin)", () => {
    const f = parse("ln(x^2 + y^2)");
    expect(laplacianAt(f, ["x", "y"], [1.3, 2.1])).toBeCloseTo(0, 6);
  });
});

describe("evalAt", () => {
  it("evaluates a node at a point", () => {
    expect(evalAt(parse("x^2 + y"), ["x", "y"], [3, 4])).toBe(13);
  });

  it("throws on point/vars length mismatch", () => {
    expect(() => evalAt(parse("x + y"), ["x", "y"], [1])).toThrow();
  });
});

describe("cross-validation: symbolic gradientAt vs numGradient", () => {
  const battery: Array<{ src: string; vars: string[]; p: number[] }> = [
    { src: "x^2 + x*y + sin(y)", vars: ["x", "y"], p: [1.1, 0.6] },
    { src: "x^2 + y^2 + z^2", vars: ["x", "y", "z"], p: [0.5, 1.2, -0.9] },
    { src: "exp(x + y)", vars: ["x", "y"], p: [0.4, 0.2] },
    { src: "sin(x*y)", vars: ["x", "y"], p: [1.3, 0.7] },
    { src: "x^3 - 2*y^2 + x*y", vars: ["x", "y"], p: [1.5, -1.0] },
    { src: "cos(x)*exp(y)", vars: ["x", "y"], p: [0.8, 0.3] },
    { src: "sqrt(x^2 + y^2)", vars: ["x", "y"], p: [3.0, 4.0] },
    { src: "ln(x^2 + y^2 + 1)", vars: ["x", "y"], p: [1.0, 2.0] },
    { src: "tan(x) + y^2", vars: ["x", "y"], p: [0.5, 1.1] },
    { src: "x*y*z", vars: ["x", "y", "z"], p: [2.0, 3.0, 4.0] },
  ];

  for (const { src, vars, p } of battery) {
    it(`${src} @ [${p.join(", ")}]`, () => {
      const f = parse(src);
      const sym = gradientAt(f, vars, p);
      const fd = numGradient(asFn(f, vars), p);
      sym.forEach((s, i) => expect(s).toBeCloseTo(fd[i], 4));
    });
  }
});
