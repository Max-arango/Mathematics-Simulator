import { describe, it, expect } from "vitest";
import { registerInspector, getInspector, registeredKinds } from "./registry.ts";
import { inspect } from "./engine.ts"; // importing the engine registers the four built-ins
import type { MathObject, InspectionResult } from "./types.ts";

const propVal = (r: InspectionResult, section: string, label: string) =>
  r.sections.find((s) => s.title.startsWith(section))?.properties.find((p) => p.label === label)?.value;

describe("inspector registry primitives", () => {
  it("round-trips a registered inspector (register → get → call)", () => {
    const fake: InspectionResult = { kind: "unitTestKind", identity: "fake", sections: [], relations: [], capabilities: [], warnings: [] };
    const fn = () => fake;
    registerInspector("unitTestKind", fn);
    expect(getInspector("unitTestKind")).toBe(fn);
    expect(getInspector("unitTestKind")!({ kind: "vector", data: [] })).toBe(fake);
  });

  it("returns undefined for a kind no one registered", () => {
    expect(getInspector("no-such-kind")).toBeUndefined();
  });

  it("last registration wins for the same kind", () => {
    const a = () => ({ kind: "dup", identity: "a", sections: [], relations: [], capabilities: [], warnings: [] });
    const b = () => ({ kind: "dup", identity: "b", sections: [], relations: [], capabilities: [], warnings: [] });
    registerInspector("dup", a);
    registerInspector("dup", b);
    expect(getInspector("dup")).toBe(b);
  });

  it("registeredKinds lists the four built-ins (registered when the engine loads)", () => {
    const kinds = registeredKinds();
    for (const k of ["expression", "matrix", "vector", "topology"]) expect(kinds).toContain(k);
  });
});

describe("registry-driven dispatch (unchanged output vs the pre-registry engine)", () => {
  it("dispatches expression through the registry", () => {
    const r = inspect({ kind: "expression", source: "x^2 + 3x + 2" });
    expect(r.kind).toBe("expression");
    expect(propVal(r, "Classification", "Class")).toBe("Polynomial, degree 2");
  });

  it("dispatches matrix through the registry", () => {
    const r = inspect({ kind: "matrix", data: [[2, 0], [0, 3]] });
    expect(propVal(r, "Invariants", "Determinant")).toBe("6");
    expect(r.capabilities).toContain("inverse");
  });

  it("dispatches vector through the registry", () => {
    expect(propVal(inspect({ kind: "vector", data: [3, 4] }), "Geometry", "Norm ‖v‖")).toBe("5");
  });

  it("dispatches topology through the registry", () => {
    expect(propVal(inspect({ kind: "topology", surfaceId: "torus" }), "Invariants", "Euler χ = V − E + F")).toBe("0");
  });

  it("degrades gracefully on an unregistered kind — warning, no throw", () => {
    // Simulates a deserialized document carrying a kind the engine does not know.
    const weird = { kind: "quaternion", parts: [1, 0, 0, 0] } as unknown as MathObject;
    const r = inspect(weird);
    expect(r.kind).toBe("quaternion");
    expect(r.identity).toContain("Unsupported");
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.sections).toEqual([]);
  });
});
