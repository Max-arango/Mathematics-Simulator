import { describe, it, expect } from "vitest";
import { OPT_METHODS, optMethod } from "./registry.ts";
import { InvalidInputError } from "../core/errors.ts";

describe("OPT_METHODS — self-describing method registry (§49)", () => {
  it("lists the three methods with matching name keys", () => {
    expect(Object.keys(OPT_METHODS).sort()).toEqual(["golden-section", "gradient-descent", "newton"]);
    for (const [key, info] of Object.entries(OPT_METHODS)) expect(info.name).toBe(key);
  });

  it("classifies kind and gradient/Hessian requirements correctly", () => {
    expect(OPT_METHODS["golden-section"].kind).toBe("univariate");
    expect(OPT_METHODS["golden-section"].requiresGradient).toBe(false);
    expect(OPT_METHODS["gradient-descent"].kind).toBe("multivariate");
    expect(OPT_METHODS["gradient-descent"].requiresGradient).toBe(true);
    expect(OPT_METHODS["gradient-descent"].requiresHessian).toBe(false);
    expect(OPT_METHODS["newton"].requiresHessian).toBe(true);
  });

  it("optMethod looks up by name and throws InvalidInputError on unknown", () => {
    expect(optMethod("newton").name).toBe("newton");
    expect(() => optMethod("bfgs")).toThrow(InvalidInputError);
  });
});
