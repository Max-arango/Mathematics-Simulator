import { describe, it, expect } from "vitest";
import {
  MathError,
  DimensionError,
  ConvergenceError,
  SingularityError,
  NumericalInstabilityError,
  ResourceLimitError,
  InvalidInputError,
  UnsupportedOperationError,
  DomainError,
  type ErrorCode,
} from "./errors.ts";

const cases: [new (m?: string) => MathError, ErrorCode][] = [
  [DimensionError, "dimension"],
  [ConvergenceError, "convergence"],
  [SingularityError, "singularity"],
  [NumericalInstabilityError, "numerical-instability"],
  [ResourceLimitError, "resource-limit"],
  [InvalidInputError, "invalid-input"],
  [UnsupportedOperationError, "unsupported-operation"],
  [DomainError, "domain"],
];

describe("structured error model", () => {
  it.each(cases)("%s is a MathError and Error with the right code and name", (Ctor, code) => {
    const e = new Ctor();
    expect(e).toBeInstanceOf(MathError);
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(Ctor);
    expect(e.code).toBe(code);
    expect(e.name).toBe(Ctor.name);
  });

  it("passes a custom message through, defaults otherwise", () => {
    expect(new DimensionError("need 3x3").message).toBe("need 3x3");
    expect(new ConvergenceError().message).toBe("failed to converge");
  });

  it("is throwable and catchable as MathError", () => {
    try {
      throw new SingularityError("det=0");
    } catch (err) {
      expect(err).toBeInstanceOf(MathError);
      if (err instanceof MathError) expect(err.code).toBe("singularity");
    }
  });
});
