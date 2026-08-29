import { describe, it, expect } from "vitest";
import { taylor, taylorCoeffs } from "./taylor.ts";
import { parse } from "../core/parser.ts";
import { compile1 } from "../core/eval.ts";

const env = { vars: {}, funcs: {} };
const near = (a: number[], b: number[]): void => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 8));
};

describe("taylorCoeffs", () => {
  it("sin(x) at 0 order 5 → [0,1,0,-1/6,0,1/120]", () => {
    near(taylorCoeffs(parse("sin(x)"), "x", 0, 5), [0, 1, 0, -1 / 6, 0, 1 / 120]);
  });
  it("exp(x) at 0 → [1,1,1/2,1/6,1/24]", () => {
    near(taylorCoeffs(parse("exp(x)"), "x", 0, 4), [1, 1, 1 / 2, 1 / 6, 1 / 24]);
  });
  it("cos(x) at 0 → [1,0,-1/2,0,1/24]", () => {
    near(taylorCoeffs(parse("cos(x)"), "x", 0, 4), [1, 0, -1 / 2, 0, 1 / 24]);
  });
  it("ln(1+x) at 0 → [0,1,-1/2,1/3]", () => {
    near(taylorCoeffs(parse("ln(1+x)"), "x", 0, 3), [0, 1, -1 / 2, 1 / 3]);
  });
  it("x³ at 0 → [0,0,0,1] (polynomial exact)", () => {
    near(taylorCoeffs(parse("x^3"), "x", 0, 4), [0, 0, 0, 1, 0]);
  });
  it("order 0 coeff = f(center)", () => {
    near(taylorCoeffs(parse("cos(x)"), "x", 1, 0), [Math.cos(1)]);
  });
});

describe("taylor polynomial", () => {
  it("order 0 = f(center) constant", () => {
    const p = taylor(parse("sin(x)"), "x", 0.5, 0);
    const f = compile1(p, "x", env);
    expect(f(10)).toBeCloseTo(Math.sin(0.5), 10); // constant everywhere
  });

  it("sin(x) order 7 approximates near 0", () => {
    const p = compile1(taylor(parse("sin(x)"), "x", 0, 7), "x", env);
    for (const x of [-0.5, -0.2, 0.1, 0.3, 0.6]) expect(p(x)).toBeCloseTo(Math.sin(x), 5);
  });

  it("exp(x) order 8 approximates near 0", () => {
    const p = compile1(taylor(parse("exp(x)"), "x", 0, 8), "x", env);
    for (const x of [-0.4, 0.2, 0.5, 0.9]) expect(p(x)).toBeCloseTo(Math.exp(x), 5);
  });

  it("cos(x) order 6 about center=1 approximates near 1", () => {
    const p = compile1(taylor(parse("cos(x)"), "x", 1, 6), "x", env);
    for (const x of [0.7, 0.9, 1.0, 1.1, 1.3]) expect(p(x)).toBeCloseTo(Math.cos(x), 5);
  });

  it("polynomial reproduced exactly", () => {
    const p = compile1(taylor(parse("2*x^2 - 3*x + 1"), "x", 0, 3), "x", env);
    for (const x of [-2, 0, 1.5, 4]) expect(p(x)).toBeCloseTo(2 * x * x - 3 * x + 1, 8);
  });
});
