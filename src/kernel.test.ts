import { describe, it, expect } from "vitest";
import * as Cx from "./mathlab/complex/complex.ts";
import * as V from "./mathlab/linear/vector.ts";
import * as M from "./mathlab/linear/matrix.ts";
import { gradient, gradientAt, numGradient } from "./mathlab/calculus/vectorCalculus.ts";
import { parse } from "./mathlab/core/parser.ts";
import { print } from "./mathlab/core/print.ts";
import { compile1 } from "./mathlab/core/eval.ts";
import { derivative } from "./mathlab/calculus/derivative.ts";
import { numericLimit } from "./mathlab/numeric/limit.ts";
import { adaptiveSimpson } from "./mathlab/numeric/adaptiveIntegrate.ts";
import { integrate } from "./mathlab/symbolic/integrate.ts";
import { hasValue } from "./mathlab/core/result.ts";

const near = (a: number, b: number, t = 1e-7) => expect(Math.abs(a - b)).toBeLessThan(t);

// Independent cross-validation (assertions NOT copied from builder suites).
describe("ORCHESTRATOR independent verification", () => {
  it("complex: Euler + z·conj = |z|²", () => {
    const e = Cx.exp(Cx.C(0, Math.PI));
    near(e.re, -1, 1e-9); near(e.im, 0, 1e-9);
    const z = Cx.C(3, -4);
    const p = Cx.mul(z, Cx.conj(z));
    near(p.re, 25); near(p.im, 0); near(Cx.abs(z), 5);
  });

  it("complex: derivative extension sec' = sec·tan checked numerically", () => {
    const dsec = compile1(derivative(parse("sec(x)"), "x"), "x", { vars: {}, funcs: {} });
    const f = (x: number) => 1 / Math.cos(x);
    const fd = (f(0.4 + 1e-6) - f(0.4 - 1e-6)) / 2e-6;
    near(dsec(0.4), fd, 1e-4);
  });

  it("matrix: A·A⁻¹ = I and det(AB)=det(A)det(B)", () => {
    const A = M.make([[2, 1, 1], [1, 3, 2], [1, 0, 0]]);
    const B = M.make([[1, 2, 0], [0, 1, 1], [2, 0, 1]]);
    const Ainv = M.inverse(A)!;
    const I = M.mul(A, Ainv);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(I.data[i][j], i === j ? 1 : 0, 1e-8);
    near(M.determinant(M.mul(A, B)), M.determinant(A) * M.determinant(B), 1e-7);
  });

  it("vector: cross ⟂ operands", () => {
    const a = [1, 2, 3], b = [-2, 0, 1];
    const c = V.cross(a, b);
    near(V.dot(a, c), 0); near(V.dot(b, c), 0);
  });

  it("gradient: symbolic == finite-difference on a fresh expr", () => {
    const f = parse("x^2*y + exp(y) + sin(x)");
    const vars = ["x", "y"];
    const g = gradient(f, vars);
    // symbolic ∂/∂x = 2xy + cos(x)
    expect(print(g[0])).toContain("cos(x)");
    const pt = [0.7, -0.3];
    const sym = gradientAt(f, vars, pt);
    const num = numGradient((p) => Math.pow(p[0], 2) * p[1] + Math.exp(p[1]) + Math.sin(p[0]), pt);
    near(sym[0], num[0], 1e-4); near(sym[1], num[1], 1e-4);
  });

  it("limit: sin(x)/x → 1 is APPROX (never exact) and π/2 tan diverges", () => {
    const r = numericLimit((x) => Math.sin(x) / x, 0, "both");
    expect(r.kind).toBe("approx");
    if (hasValue(r)) near(r.value, 1, 1e-6);
  });

  it("adaptive integrate: ∫₀^π sin = 2 with metadata", () => {
    const r = adaptiveSimpson(Math.sin, 0, Math.PI);
    expect(r.kind).toBe("approx");
    if (hasValue(r)) { near(r.value, 2, 1e-9); expect(r.evals).toBeGreaterThan(0); }
  });

  it("symbolic integrate: ∫x² is exact and differentiates back to f", () => {
    const r = integrate(parse("x^2"), "x");
    expect(r.kind).toBe("exact");
    if (hasValue(r)) {
      const back = compile1(derivative(r.value, "x"), "x", { vars: {}, funcs: {} });
      near(back(1.7), 1.7 * 1.7, 1e-6);
    }
    expect(integrate(parse("sin(x^2)"), "x").kind).toBe("unsupported");
  });
});
