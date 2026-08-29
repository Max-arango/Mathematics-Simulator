import { describe, it, expect } from "vitest";
import { makeObjective, evalObjective, gradientOf, hessianOf } from "./objective.ts";
import { numGradient } from "../calculus/vectorCalculus.ts";
import { InvalidInputError } from "../core/errors.ts";

describe("makeObjective — parses and validates the variable set", () => {
  it("keeps the source string and ordered vars (serialization-safe)", () => {
    const obj = makeObjective(["x", "y"], "x^2 + y^2");
    expect(obj.source).toBe("x^2 + y^2");
    expect(obj.vars).toEqual(["x", "y"]);
  });

  it("allows named constants (pi, e) as non-variables", () => {
    const obj = makeObjective(["x"], "x^2 + pi + e");
    expect(evalObjective(obj, [0])).toBeCloseTo(Math.PI + Math.E, 12);
  });

  it("throws InvalidInputError when the source uses an undeclared variable", () => {
    expect(() => makeObjective(["x"], "x^2 + z")).toThrow(InvalidInputError);
  });
});

describe("evalObjective / gradientOf / hessianOf", () => {
  it("evaluates f at a point", () => {
    const obj = makeObjective(["x", "y"], "x^2 + y^2");
    expect(evalObjective(obj, [3, 4])).toBeCloseTo(25, 12);
  });

  it("symbolic gradient of a bowl matches ∇=[2x,2y]", () => {
    const obj = makeObjective(["x", "y"], "x^2 + y^2");
    expect(gradientOf(obj, [3, 4])).toEqual([6, 8]);
  });

  it("symbolic gradient agrees with a finite-difference gradient (cross-check §70)", () => {
    const obj = makeObjective(["x", "y"], "x^2 + 100*(y - x^2)^2");
    const sym = gradientOf(obj, [-1.2, 1]);
    const num = numGradient((p) => evalObjective(obj, p), [-1.2, 1]);
    expect(sym[0]).toBeCloseTo(num[0], 4);
    expect(sym[1]).toBeCloseTo(num[1], 4);
  });

  it("Hessian of a bowl is [[2,0],[0,2]]", () => {
    const obj = makeObjective(["x", "y"], "x^2 + y^2");
    expect(hessianOf(obj, [1, 1])).toEqual([[2, 0], [0, 2]]);
  });
});
