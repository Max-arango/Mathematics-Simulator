import { describe, it, expect } from "vitest";
import { CONSTANTS, constant, constantQuantity } from "./constants.ts";
import { dim, equalDim, isDimensionless } from "./dimension.ts";
import { InvalidInputError } from "../core/errors.ts";

describe("scientific constants registry", () => {
  it("exposes exact SI-2019 values with correct dimensions", () => {
    expect(constant("c").value).toBe(299792458);
    expect(equalDim(constant("c").dim, dim({ length: 1, time: -1 }))).toBe(true);
    expect(constant("kB").value).toBe(1.380649e-23);
    expect(constant("e_charge").value).toBe(1.602176634e-19);
    expect(equalDim(constant("e_charge").dim, dim({ current: 1, time: 1 }))).toBe(true);
  });
  it("mathematical constants are dimensionless", () => {
    for (const k of ["pi", "e", "phi", "tau"]) expect(isDimensionless(constant(k).dim)).toBe(true);
    expect(constant("pi").value).toBeCloseTo(Math.PI, 12);
    expect(constant("tau").value).toBeCloseTo(2 * Math.PI, 12);
  });
  it("R ≈ N_A · k_B (physical cross-check)", () => {
    expect(constant("R").value).toBeCloseTo(CONSTANTS.NA.value * CONSTANTS.kB.value, 4);
  });
  it("constantQuantity carries the dimension; unknown keys throw", () => {
    expect(constantQuantity("c").dim).toEqual(dim({ length: 1, time: -1 }));
    expect(constantQuantity("g0").value).toBeCloseTo(9.80665, 9);
    expect(() => constant("unobtainium")).toThrow(InvalidInputError);
  });
});
