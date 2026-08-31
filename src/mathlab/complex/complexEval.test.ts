import { describe, it, expect } from "vitest";
import { parse } from "../core/parser.ts";
import { InvalidInputError, UnsupportedOperationError } from "../core/errors.ts";
import { C, type Complex } from "./complex.ts";
import { evalComplex, parseComplexFn } from "./complexEval.ts";

const near = (a: Complex, b: Complex, tol = 1e-9) => {
  const d = Math.round(-Math.log10(tol));
  expect(a.re).toBeCloseTo(b.re, d);
  expect(a.im).toBeCloseTo(b.im, d);
};

describe("evalComplex — algebra over ℂ", () => {
  it("z² at z=1+i → 2i", () => {
    near(parseComplexFn("z^2")(C(1, 1)), C(0, 2));
  });

  it("exp(z) at z=0 → 1", () => {
    near(parseComplexFn("exp(z)")(C(0, 0)), C(1, 0));
  });

  it("exp(z) at z=iπ → −1 (Euler)", () => {
    near(parseComplexFn("exp(z)")(C(0, Math.PI)), C(-1, 0));
  });

  it("1/z at z=2 → 0.5", () => {
    near(parseComplexFn("1/z")(C(2, 0)), C(0.5, 0));
  });

  it("compound (z^2-1)/(z+1) at z=i → −1+i (hand-checked)", () => {
    // (i²−1)/(i+1) = −2/(1+i) = −2(1−i)/2 = −1+i
    near(parseComplexFn("(z^2 - 1)/(z + 1)")(C(0, 1)), C(-1, 1));
  });

  it("sin(z) at z=π/2 → 1", () => {
    near(parseComplexFn("sin(z)")(C(Math.PI / 2, 0)), C(1, 0));
  });
});

describe("evalComplex — log/branch conventions", () => {
  it("log(z) at z=1 → 0 (natural log)", () => {
    near(parseComplexFn("log(z)")(C(1, 0)), C(0, 0));
  });

  it("log(z) at z=−1 → iπ (principal branch)", () => {
    near(parseComplexFn("log(z)")(C(-1, 0)), C(0, Math.PI));
  });

  it("ln and log are BOTH natural log over ℂ (ln(e)=log(e)=1)", () => {
    // Differs from the real evaluator where bare `log` is base-10.
    near(parseComplexFn("ln(z)")(C(Math.E, 0)), C(1, 0));
    near(parseComplexFn("log(z)")(C(Math.E, 0)), C(1, 0));
  });

  it("sqrt(z) at z=−1 → i (principal branch)", () => {
    near(parseComplexFn("sqrt(z)")(C(-1, 0)), C(0, 1));
  });
});

describe("evalComplex — real-valued fns embedded as Complex{re,0}", () => {
  it("abs(3+4i) → 5+0i", () => {
    near(evalComplex(parse("abs(z)"), { z: C(3, 4) }), C(5, 0));
  });

  it("arg(i) → (π/2)+0i", () => {
    near(evalComplex(parse("arg(z)"), { z: C(0, 1) }), C(Math.PI / 2, 0));
  });

  it("const pi → π+0i", () => {
    near(evalComplex(parse("pi"), {}), C(Math.PI, 0));
  });
});

describe("evalComplex — errors", () => {
  it("unknown variable → InvalidInputError", () => {
    expect(() => evalComplex(parse("w"), { z: C(1, 0) })).toThrow(InvalidInputError);
  });

  it("unsupported function name → UnsupportedOperationError", () => {
    expect(() => evalComplex(parse("foo(z)"), { z: C(1, 0) })).toThrow(UnsupportedOperationError);
  });

  it("non-unary call → UnsupportedOperationError", () => {
    expect(() => evalComplex(parse("log(z, z)"), { z: C(1, 0) })).toThrow(UnsupportedOperationError);
  });
});

describe("parseComplexFn — closure reuse", () => {
  it("parses once, samples many points", () => {
    const f = parseComplexFn("z^2");
    near(f(C(2, 0)), C(4, 0));
    near(f(C(0, 1)), C(-1, 0));
    near(f(C(1, 1)), C(0, 2));
  });

  it("respects a custom variable name", () => {
    const f = parseComplexFn("w^2", "w");
    near(f(C(0, 1)), C(-1, 0));
  });
});
