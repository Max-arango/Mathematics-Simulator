import { describe, it, expect } from "vitest";
import { integrate } from "./integrate.ts";
import { parse } from "../core/parser.ts";
import { derivative } from "../calculus/derivative.ts";
import { compile1 } from "../core/eval.ts";
import type { Node } from "../core/ast.ts";

const env = { vars: {}, funcs: {} };

// For every SUCCESS, d/dv(∫f) must numerically match f at sample points.
function crossValidate(src: string, v = "x", samples = [0.3, 0.7, 1.2, 2.1, -0.5]): void {
  const f = parse(src);
  const r = integrate(f, v);
  expect(r.kind).toBe("exact");
  if (r.kind !== "exact") return;
  const back = derivative(r.value as Node, v);
  const fFn = compile1(f, v, env);
  const bFn = compile1(back, v, env);
  for (const x of samples) {
    const fv = fFn(x), bv = bFn(x);
    if (Number.isFinite(fv) && Number.isFinite(bv)) expect(bv).toBeCloseTo(fv, 6);
  }
}

describe("symbolic integrate — supported subset", () => {
  it("∫x² = x³/3", () => crossValidate("x^2"));
  it("∫sin x = −cos x", () => crossValidate("sin(x)"));
  it("∫e^x = e^x", () => crossValidate("exp(x)"));
  it("∫1/x = ln|x|", () => crossValidate("1/x", "x", [0.3, 0.7, 1.2, 2.1]));
  it("∫(3x²+2x+1) = x³+x²+x", () => crossValidate("3*x^2 + 2*x + 1"));
  it("∫cos x = sin x", () => crossValidate("cos(x)"));
  it("∫x = x²/2", () => crossValidate("x"));
  it("∫5 = 5x (constant)", () => crossValidate("5"));
  it("∫x^5 = x^6/6", () => crossValidate("x^5"));
  it("∫x^(-2) = -x^(-1)", () => crossValidate("x^(-2)", "x", [0.3, 0.7, 1.2, 2.1]));
  it("∫(x^3 - 4x + 7)", () => crossValidate("x^3 - 4*x + 7"));
  it("∫7/x = 7ln|x|", () => crossValidate("7/x", "x", [0.3, 0.7, 1.2, 2.1]));
  it("∫x^2/2 (constant divisor)", () => crossValidate("x^2 / 2"));
  it("∫-sin(x)", () => crossValidate("-sin(x)"));
});

describe("symbolic integrate — unsupported", () => {
  it("∫sin(x²) → unsupported (substitution not in subset)", () => {
    expect(integrate(parse("sin(x^2)"), "x").kind).toBe("unsupported");
  });
  it("∫x·sin(x) → unsupported (product not in subset)", () => {
    expect(integrate(parse("x*sin(x)"), "x").kind).toBe("unsupported");
  });
  it("∫1/sin(x) → unsupported", () => {
    expect(integrate(parse("1/sin(x)"), "x").kind).toBe("unsupported");
  });
  it("∫tan(x) → unsupported", () => {
    expect(integrate(parse("tan(x)"), "x").kind).toBe("unsupported");
  });
});
