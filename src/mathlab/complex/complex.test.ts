import { describe, it, expect } from "vitest";
import {
  C, add, sub, mul, div, neg, conj, scale, re, im, abs, arg, eq,
  toPolar, fromPolar, exp, log, pow, powReal, sqrt,
  sin, cos, tan, sinh, cosh, tanh, asin, acos, atan,
  type Complex,
} from "./complex.ts";

const near = (a: Complex, b: Complex, tol = 1e-9) => {
  expect(a.re).toBeCloseTo(b.re, Math.round(-Math.log10(tol)));
  expect(a.im).toBeCloseTo(b.im, Math.round(-Math.log10(tol)));
};

const TAU = 2 * Math.PI;
const samples: Complex[] = [C(3, 4), C(-2, 5), C(1, -1), C(0, 2), C(-3, 0), C(0.5, -0.25)];

describe("field ops (hand-computed)", () => {
  it("add / sub", () => {
    near(add(C(1, 2), C(3, 4)), C(4, 6));
    near(sub(C(1, 2), C(3, 4)), C(-2, -2));
  });
  it("mul", () => {
    near(mul(C(1, 2), C(3, 4)), C(-5, 10));
  });
  it("div", () => {
    near(div(C(-5, 10), C(3, 4)), C(1, 2));
  });
  it("neg / conj / scale", () => {
    near(neg(C(2, -3)), C(-2, 3));
    near(conj(C(2, -3)), C(2, 3));
    near(scale(C(2, -3), 4), C(8, -12));
  });
  it("re / im projections", () => {
    expect(re(C(7, -8))).toBe(7);
    expect(im(C(7, -8))).toBe(-8);
  });
});

describe("magnitude / argument", () => {
  it("abs of 3+4i is 5", () => expect(abs(C(3, 4))).toBeCloseTo(5, 12));
  it("arg of i is π/2", () => expect(arg(C(0, 1))).toBeCloseTo(Math.PI / 2, 12));
  it("eq with tolerance", () => {
    expect(eq(C(1, 1), C(1 + 1e-13, 1))).toBe(true);
    expect(eq(C(1, 1), C(1.1, 1))).toBe(false);
  });
});

describe("invariants", () => {
  it("z·conj(z) = |z|² (real, im≈0)", () => {
    for (const z of samples) {
      const p = mul(z, conj(z));
      expect(p.re).toBeCloseTo(abs(z) ** 2, 9);
      expect(p.im).toBeCloseTo(0, 9);
    }
  });
  it("|z·w| = |z|·|w|", () => {
    for (const z of samples)
      for (const w of samples)
        expect(abs(mul(z, w))).toBeCloseTo(abs(z) * abs(w), 9);
  });
  it("arg(z·w) = arg z + arg w (mod 2π)", () => {
    for (const z of samples)
      for (const w of samples) {
        if (abs(z) === 0 || abs(w) === 0) continue;
        const diff = ((arg(mul(z, w)) - arg(z) - arg(w)) % TAU + TAU + Math.PI) % TAU - Math.PI;
        expect(diff).toBeCloseTo(0, 9);
      }
  });
});

describe("exp / log", () => {
  it("exp(log z) ≈ z", () => {
    for (const z of samples) if (abs(z) > 0) near(exp(log(z)), z);
  });
  it("log(exp z) ≈ z on principal domain", () => {
    for (const z of [C(1, 1), C(-0.5, 2), C(2, -1)]) near(log(exp(z)), z);
  });
  it("Euler: exp(iπ) ≈ −1", () => near(exp(C(0, Math.PI)), C(-1, 0)));
  it("Euler: exp(iπ/2) ≈ i", () => near(exp(C(0, Math.PI / 2)), C(0, 1)));
  it("log(0) → re = −Infinity", () => {
    expect(log(C(0, 0)).re).toBe(-Infinity);
  });
});

describe("core identities", () => {
  it("i² = −1", () => near(mul(C(0, 1), C(0, 1)), C(-1, 0)));
  it("(1+i)² = 2i", () => near(mul(C(1, 1), C(1, 1)), C(0, 2)));
  it("1/(1+i) = 0.5 − 0.5i", () => near(div(C(1, 0), C(1, 1)), C(0.5, -0.5)));
});

describe("powers", () => {
  it("(1+i)^2 via integer pow", () => near(pow(C(1, 1), C(2, 0)), C(0, 2)));
  it("integer pow negative exponent: (1+i)^-1 = 0.5−0.5i", () =>
    near(pow(C(1, 1), C(-1, 0)), C(0.5, -0.5)));
  it("z^0 = 1", () => near(pow(C(3, 4), C(0, 0)), C(1, 0)));
  it("sqrt(−1) = i", () => near(sqrt(C(-1, 0)), C(0, 1)));
  it("sqrt(2i) = 1+i", () => near(sqrt(C(0, 2)), C(1, 1)));
  it("powReal(z,0.5) = sqrt(z)", () => near(powReal(C(3, 4), 0.5), sqrt(C(3, 4))));
  it("powReal cube matches repeated mul", () =>
    near(powReal(C(1, 1), 3), mul(mul(C(1, 1), C(1, 1)), C(1, 1))));
  it("non-integer complex pow via exp(w log z): 1^i = 1", () =>
    near(pow(C(1, 0), C(0, 1)), C(1, 0)));
});

describe("trig", () => {
  it("sin/cos of real match Math", () => {
    for (const x of [0, 0.3, 1, -2]) {
      expect(sin(C(x, 0)).re).toBeCloseTo(Math.sin(x), 9);
      expect(cos(C(x, 0)).re).toBeCloseTo(Math.cos(x), 9);
    }
  });
  it("sin²+cos² ≈ 1 for complex z", () => {
    for (const z of samples) near(add(mul(sin(z), sin(z)), mul(cos(z), cos(z))), C(1, 0));
  });
  it("tan = sin/cos", () => {
    for (const z of [C(0.5, 0.5), C(1, -0.3)]) near(tan(z), div(sin(z), cos(z)));
  });
});

describe("hyperbolic", () => {
  it("cosh²−sinh² ≈ 1", () => {
    for (const z of [C(0.5, 0.5), C(1, -1), C(0, 1)])
      near(sub(mul(cosh(z), cosh(z)), mul(sinh(z), sinh(z))), C(1, 0));
  });
  it("sinh(0) = 0, cosh(0) = 1", () => {
    near(sinh(C(0, 0)), C(0, 0));
    near(cosh(C(0, 0)), C(1, 0));
  });
  it("tanh = sinh/cosh", () => near(tanh(C(0.7, 0.2)), div(sinh(C(0.7, 0.2)), cosh(C(0.7, 0.2)))));
});

describe("inverse trig (principal)", () => {
  it("sin(asin z) ≈ z", () => {
    for (const z of [C(0.5, 0.3), C(-0.2, 0.4)]) near(sin(asin(z)), z);
  });
  it("cos(acos z) ≈ z", () => {
    for (const z of [C(0.5, 0.3), C(-0.2, 0.4)]) near(cos(acos(z)), z);
  });
  it("tan(atan z) ≈ z", () => {
    for (const z of [C(0.5, 0.3), C(-0.2, 0.4)]) near(tan(atan(z)), z);
  });
  it("asin(0) = 0, acos(0) = π/2", () => {
    near(asin(C(0, 0)), C(0, 0));
    near(acos(C(0, 0)), C(Math.PI / 2, 0));
  });
});

describe("polar round-trip", () => {
  it("fromPolar(toPolar(z)) ≈ z", () => {
    for (const z of samples) {
      const { r, theta } = toPolar(z);
      near(fromPolar(r, theta), z);
    }
  });
});

describe("edge cases", () => {
  it("div by zero → NaN components", () => {
    const q = div(C(1, 1), C(0, 0));
    expect(Number.isNaN(q.re)).toBe(true);
    expect(Number.isNaN(q.im)).toBe(true);
  });
});
