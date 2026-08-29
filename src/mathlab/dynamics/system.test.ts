import { describe, it, expect } from "vitest";
import { InvalidInputError } from "../core/errors.ts";
import { makeSystem, evalField, jacobianField } from "./system.ts";

describe("makeSystem / evalField", () => {
  it("evaluates a hand-checked field: [y, -x] at (1,2) = [2,-1]", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    expect(evalField(sys, [1, 2])).toEqual([2, -1]);
  });

  it("binds params into the field: r*x*(1-x) with r=2 at x=0.1", () => {
    const sys = makeSystem(["x"], ["r*x*(1-x)"], { r: 2 }, "discrete");
    expect(evalField(sys, [0.1])).toBeCloseTo(2 * 0.1 * 0.9, 12);
  });

  it("resolves a built-in constant (pi) without declaring it", () => {
    const sys = makeSystem(["x"], ["x + pi"], {}, "continuous");
    expect(evalField(sys, [1])).toBeCloseTo(1 + Math.PI, 12);
  });

  it("rejects a field/var count mismatch", () => {
    expect(() => makeSystem(["x", "y"], ["y"], {}, "continuous")).toThrow(InvalidInputError);
  });

  it("rejects a field referencing an unknown free variable", () => {
    expect(() => makeSystem(["x"], ["x + z"], {}, "continuous")).toThrow(InvalidInputError);
  });

  it("rejects a param that collides with a state variable name", () => {
    expect(() => makeSystem(["x"], ["a*x"], { x: 1 }, "continuous")).toThrow(InvalidInputError);
  });

  it("rejects an unknown kind", () => {
    // @ts-expect-error runtime guard for JS callers passing a bad kind
    expect(() => makeSystem(["x"], ["x"], {}, "chaotic")).toThrow(InvalidInputError);
  });

  it("evalField guards the point dimension", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    expect(() => evalField(sys, [1])).toThrow(InvalidInputError);
  });
});

describe("jacobianField", () => {
  it("[y, -x] has the rotation Jacobian [[0,1],[-1,0]]", () => {
    const sys = makeSystem(["x", "y"], ["y", "-x"], {}, "continuous");
    const j = jacobianField(sys, [3, 7]);
    const expected = [
      [0, 1],
      [-1, 0],
    ];
    // toBeCloseTo, not toEqual: the symbolic d/dy(-x) yields -0, which ≠ 0 structurally.
    expected.forEach((row, i) => row.forEach((v, k) => expect(j[i][k]).toBeCloseTo(v, 12)));
  });

  it("binds params in the symbolic Jacobian: d/dx (r*x) = r", () => {
    const sys = makeSystem(["x"], ["r*x"], { r: 3 }, "continuous");
    expect(jacobianField(sys, [5])).toEqual([[3]]);
  });
});
