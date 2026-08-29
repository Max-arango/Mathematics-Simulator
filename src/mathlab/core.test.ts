import { describe, it, expect } from "vitest";
import { parse, parseStatement } from "./core/parser.ts";
import { evaluate, compile1, type Env } from "./core/eval.ts";
import { derivative } from "./calculus/derivative.ts";
import { print } from "./core/print.ts";
import { findRoots, newtonSteps } from "./analysis/roots.ts";
import { compileComplexGlsl } from "./core/complexGlsl.ts";
import { buildCustomShader } from "../webgl/customShader.ts";

const env: Env = { vars: {}, funcs: {} };
const at = (src: string, x: number) => evaluate(parse(src), { vars: { x }, funcs: {} });

describe("parser + evaluator", () => {
  it("respects precedence and implicit multiplication", () => {
    expect(at("2x + 3", 2)).toBe(7);
    expect(at("x^2", 3)).toBe(9);
    expect(at("x(x+1)", 3)).toBe(12); // implicit mult
    expect(at("2 x^2", 3)).toBe(18); // 2*(x^2)
    expect(at("-x^2", 3)).toBe(-9); // -(x^2)
  });

  it("is right-associative for power", () => {
    expect(at("2^3^2", 0)).toBe(512); // 2^(3^2)
  });

  it("lexes unicode constants and space-separated identifiers", () => {
    expect(evaluate(parse("2π"), env)).toBeCloseTo(2 * Math.PI, 12);
    // spaces must not merge identifiers into one token
    const e2: Env = { vars: { a: 3, b: 4 }, funcs: {} };
    expect(evaluate(parse("a b"), e2)).toBe(12); // implicit mult
  });

  it("handles constants and functions", () => {
    expect(evaluate(parse("sin(pi/2)"), env)).toBeCloseTo(1, 12);
    expect(evaluate(parse("e^0"), env)).toBe(1);
    expect(evaluate(parse("ln(e)"), env)).toBeCloseTo(1, 12);
  });

  it("rejects unknown functions (no eval / no arbitrary code)", () => {
    expect(() => evaluate(parse("frobnicate(x)"), { vars: { x: 1 }, funcs: {} })).toThrow();
    expect(() => evaluate(parse("y"), env)).toThrow();
  });

  it("parses definitions and user functions", () => {
    const stmt = parseStatement("f(x) = x^2 + 1");
    expect(stmt.kind).toBe("func");
    if (stmt.kind === "func") {
      const e2: Env = { vars: {}, funcs: { f: { params: stmt.params, body: stmt.body } } };
      expect(evaluate(parse("f(3)"), e2)).toBe(10);
    }
  });
});

// Central-difference check: symbolic derivative must match numeric slope.
function derivMatches(src: string, xs: number[]) {
  const f = compile1(parse(src), "x", env);
  const df = compile1(derivative(parse(src), "x"), "x", env);
  const h = 1e-6;
  for (const x of xs) {
    const numeric = (f(x + h) - f(x - h)) / (2 * h);
    expect(df(x)).toBeCloseTo(numeric, 4);
  }
}

describe("symbolic derivative", () => {
  it("power rule", () => expect(print(derivative(parse("x^3"), "x"))).toBe("3·x^2"));
  it("chain rule on sin(x^2)", () => derivMatches("sin(x^2)", [0.3, 1, 2]));
  it("product rule", () => derivMatches("x*sin(x)", [0.5, 1.5, 2.5]));
  it("quotient rule", () => derivMatches("(x^2+1)/(x-3)", [0, 1, 5]));
  it("exp/ln/sqrt", () => { derivMatches("exp(x)", [0, 1]); derivMatches("ln(x)", [0.5, 2]); derivMatches("sqrt(x)", [0.5, 4]); });
  it("treats other variables as constants: d/dz (z^2 + c) = 2z", () => {
    expect(print(derivative(parse("z^2 + c"), "z"))).toBe("2·z");
  });
});

describe("root finding", () => {
  it("brackets roots via sign change", () => {
    const roots = findRoots((x) => x * x - 2, 0, 2);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(Math.SQRT2, 8);
  });
  it("Newton converges to sqrt(2)", () => {
    const steps = newtonSteps((x) => x * x - 2, (x) => 2 * x, 2);
    expect(steps.at(-1)).toBeCloseTo(Math.SQRT2, 10);
  });
});

describe("AST -> GLSL compiler", () => {
  it("emits complex ops for z^2 + c", () => {
    const g = compileComplexGlsl(parse("z^2 + c"));
    expect(g).toContain("cpowi(z, 2)");
    expect(g).toContain("cadd(");
  });
  it("supports conjugate and transcendental functions", () => {
    expect(compileComplexGlsl(parse("sin(z) + conjugate(c)"))).toContain("cconj(c)");
    expect(compileComplexGlsl(parse("exp(z)"))).toContain("cexp(z)");
  });
  it("rejects unsupported variables and functions", () => {
    expect(() => compileComplexGlsl(parse("z + w"))).toThrow();
    expect(() => compileComplexGlsl(parse("gamma(z)"))).toThrow();
  });
  it("buildCustomShader returns a fragment for valid input and an error otherwise", () => {
    expect(buildCustomShader("z^2 + c").fragment).toContain("vec2 F(vec2 z, vec2 c)");
    expect(buildCustomShader("z^2 + c").error).toBeNull();
    expect(buildCustomShader("z + w").fragment).toBeNull();
    expect(buildCustomShader("z ^^ 2").error).not.toBeNull();
  });
});
