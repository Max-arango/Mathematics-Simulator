import { describe, it, expect } from "vitest";
import { emptyExperiment, LIMITS, type Experiment } from "./types.ts";
import { serialize, deserialize, validate, diff } from "./serialize.ts";
import { run, runAll, dependencies, dependents } from "./engine.ts";

function sample(): Experiment {
  const e = emptyExperiment("Calculus");
  e.cells = [
    { id: "p1", kind: "parameter", name: "a", value: 2, min: -5, max: 5, step: 0.1 },
    { id: "e1", kind: "expression", name: "f", source: "a*x^2 - 4" },
    { id: "a1", kind: "analysis", targetName: "f" },
    { id: "m1", kind: "markdown", source: "# Notes" },
  ];
  return e;
}

describe("serialization", () => {
  it("round-trips exactly (serialize → deserialize)", () => {
    const e = sample();
    const r = deserialize(serialize(e));
    expect(r.ok).toBe(true);
    expect(r.experiment).toEqual(e);
  });
  it("serialize(deserialize(serialize)) is stable", () => {
    const s1 = serialize(sample());
    const s2 = serialize(deserialize(s1).experiment!);
    expect(s2).toBe(s1);
  });
  it("stores no executable payload (pure JSON data)", () => {
    const s = serialize(sample());
    expect(s).not.toContain("function");
    expect(() => JSON.parse(s)).not.toThrow();
  });
});

describe("schema validation (untrusted input)", () => {
  const bad = (obj: unknown) => validate(obj).errors;
  it("rejects wrong format / version", () => {
    expect(bad({ ...sample(), format: "nope" }).some((e) => e.includes("format"))).toBe(true);
    expect(bad({ ...sample(), version: 99 }).some((e) => e.includes("newer"))).toBe(true);
  });
  it("rejects unknown cell kind", () => {
    const e = sample(); (e.cells as unknown[]).push({ id: "x", kind: "evilCode" });
    expect(bad(e).some((m) => m.includes("unknown kind"))).toBe(true);
  });
  it("rejects analysis referencing a missing expression", () => {
    const e = sample(); e.cells = [{ id: "a1", kind: "analysis", targetName: "ghost" }];
    expect(bad(e).some((m) => m.includes("unknown expression"))).toBe(true);
  });
  it("rejects oversized documents and params out of bounds", () => {
    const e = sample(); e.cells = Array.from({ length: LIMITS.maxCells + 1 }, (_, i) => ({ id: `m${i}`, kind: "markdown", source: "" }));
    expect(bad(e).some((m) => m.includes("too many cells"))).toBe(true);
    const e2 = sample(); (e2.cells[0] as { value: number }).value = 1e12;
    expect(bad(e2).some((m) => m.includes("out of bounds"))).toBe(true);
  });
  it("rejects malformed JSON without throwing", () => {
    const r = deserialize("{ not json");
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("invalid JSON");
  });
  it("accepts a valid experiment", () => {
    expect(validate(sample()).ok).toBe(true);
    expect(deserialize(serialize(emptyExperiment())).ok).toBe(true);
  });
});

describe("execution engine (deterministic derivation)", () => {
  it("substitutes parameters and analyzes the resolved expression", () => {
    const out = run(sample(), "a1");
    expect(out.kind).toBe("analysis");
    if (out.kind === "analysis") {
      // f = a*x^2 - 4 with a=2 → 2x^2 - 4, roots ±√2
      const roots = out.result.sections.find((s) => s.title.startsWith("Roots"))!.properties.find((p) => p.label === "Roots")!.value;
      expect(roots).toContain("1.41421");
    }
  });
  it("is reactive: changing a parameter changes the derived analysis", () => {
    const e = sample();
    const before = run(e, "a1");
    (e.cells[0] as { value: number }).value = 8; // f = 8x^2 - 4 → roots ±0.707
    const after = run(e, "a1");
    expect(JSON.stringify(before)).not.toBe(JSON.stringify(after));
  });
  it("reproduces identically after a save/load round-trip", () => {
    const e = sample();
    const loaded = deserialize(serialize(e)).experiment!;
    expect(runAll(loaded)).toEqual(runAll(e));
  });
  it("reports errors for bad expressions without throwing", () => {
    const e = sample(); (e.cells[1] as { source: string }).source = "a*x^";
    expect(run(e, "a1").kind).toBe("error");
    expect(run(e, "e1").kind).toBe("error");
  });
});

describe("dependency graph", () => {
  it("tracks parameter → expression → analysis dependencies", () => {
    const e = sample();
    const deps = dependencies(e);
    expect(deps["e1"]).toContain("p1");            // f depends on a
    expect(deps["a1"]).toEqual(expect.arrayContaining(["e1", "p1"])); // analysis on f + a
  });
  it("finds downstream dependents of a parameter", () => {
    const dep = dependents(sample(), "p1");
    expect(dep).toEqual(expect.arrayContaining(["e1", "a1"]));
  });
});

describe("diff", () => {
  it("reports a changed parameter", () => {
    const a = sample(), b = sample();
    (b.cells[0] as { value: number }).value = 5;
    expect(diff(a, b).some((d) => d.includes("changed parameter"))).toBe(true);
  });
});
