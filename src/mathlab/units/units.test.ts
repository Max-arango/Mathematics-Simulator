// Dimensional quantities: consistency enforcement, conversions, and the velocity = d/t example.
import { describe, it, expect } from "vitest";
import { dim, addDim, formatDim, equalDim, DIMENSIONLESS } from "./dimension.ts";
import { addQ, subQ, mulQ, divQ, powQ, scaleQ } from "./quantity.ts";
import { makeQuantity, toUnit, convert, convertTemperature, UNITS } from "./units.ts";
import { DimensionError, InvalidInputError } from "../core/errors.ts";

describe("dimension algebra", () => {
  it("adds exponents and formats signatures", () => {
    const velocity = dim({ length: 1, time: -1 });
    expect(formatDim(velocity)).toBe("L·T⁻¹");
    expect(formatDim(DIMENSIONLESS)).toBe("1");
    expect(equalDim(addDim(dim({ length: 1 }), dim({ length: 1 })), dim({ length: 2 }))).toBe(true);
  });
});

describe("dimensional consistency (spec §40)", () => {
  it("5 m + 2 s throws a dimension mismatch", () => {
    const a = makeQuantity(5, "m");
    const b = makeQuantity(2, "s");
    expect(() => addQ(a, b)).toThrow(DimensionError);
    expect(() => subQ(a, b)).toThrow(DimensionError);
  });
  it("adds compatible quantities (with unit conversion baked into SI base)", () => {
    const sum = addQ(makeQuantity(1, "km"), makeQuantity(500, "m")); // 1000 + 500 m
    expect(toUnit(sum, "m")).toBeCloseTo(1500, 9);
    expect(toUnit(sum, "km")).toBeCloseTo(1.5, 9);
  });
});

describe("velocity = distance / time (spec §40 example)", () => {
  it("5 m / 2 s = 2.5 m/s", () => {
    const v = divQ(makeQuantity(5, "m"), makeQuantity(2, "s"));
    expect(toUnit(v, "m/s")).toBeCloseTo(2.5, 9);
    expect(equalDim(v.dim, UNITS["m/s"].dim)).toBe(true);
  });
  it("mul/pow combine dimensions; area then side", () => {
    const area = mulQ(makeQuantity(3, "m"), makeQuantity(4, "m")); // 12 m²
    expect(area.dim).toEqual(dim({ length: 2 }));
    expect(area.value).toBeCloseTo(12, 9);
    const side = powQ(area, 0.5); // √area → length
    expect(side.dim).toEqual(dim({ length: 1 }));
    expect(side.value).toBeCloseTo(Math.sqrt(12), 9);
    expect(scaleQ(area, 2).value).toBeCloseTo(24, 9);
  });
});

describe("conversion", () => {
  it("km/h ↔ m/s and unknown / mismatched units", () => {
    expect(convert(36, "km/h", "m/s")).toBeCloseTo(10, 9);
    expect(convert(1, "h", "s")).toBeCloseTo(3600, 9);
    expect(() => convert(1, "m", "s")).toThrow(DimensionError);
    expect(() => makeQuantity(1, "furlong")).toThrow(InvalidInputError);
    expect(() => toUnit(makeQuantity(5, "m"), "s")).toThrow(DimensionError);
  });
});

describe("affine temperature", () => {
  it("K ↔ °C ↔ °F", () => {
    expect(convertTemperature(0, "degC", "K")).toBeCloseTo(273.15, 9);
    expect(convertTemperature(100, "degC", "degF")).toBeCloseTo(212, 9);
    expect(convertTemperature(32, "degF", "degC")).toBeCloseTo(0, 9);
    expect(convertTemperature(300, "K", "degC")).toBeCloseTo(26.85, 9);
  });
});
