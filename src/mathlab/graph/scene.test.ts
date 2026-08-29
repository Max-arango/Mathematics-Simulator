import { describe, it, expect } from "vitest";
import { buildScene, type SceneInput } from "./scene.ts";
import { compile1, compile2 } from "../core/eval.ts";

let n = 0;
const L = (source: string): SceneInput => ({ id: `l${n++}`, source, color: "#fff", visible: true });

describe("buildScene", () => {
  it("plots a bare expression and a function def", () => {
    const s = buildScene([L("sin(x)"), L("f(x) = x^2")], "2d", {});
    expect(s.plots).toHaveLength(2);
    expect(compile1(s.plots[1].body, "x", s.env)(3)).toBe(9);
  });

  it("makes numeric assignments into sliders and uses them", () => {
    const s = buildScene([L("a = 2"), L("a*x^2")], "2d", {});
    expect(s.sliders.map((x) => x.name)).toContain("a");
    // plot body is a*x^2 with a=2 in env -> 18 at x=3
    const plot = s.plots.find((p) => p.id !== undefined)!;
    expect(compile1(plot.body, "x", s.env)(3)).toBe(18);
  });

  it("auto-sliders undefined free variables (default 1)", () => {
    const s = buildScene([L("k*x")], "2d", {});
    expect(s.sliders.find((x) => x.name === "k")?.value).toBe(1);
    expect(compile1(s.plots[0].body, "x", s.env)(5)).toBe(5);
  });

  it("applies slider overrides", () => {
    const s = buildScene([L("a = 2"), L("a*x")], "2d", { a: 10 });
    expect(compile1(s.plots[0]?.id ? s.plots[0].body : s.plots[0].body, "x", s.env)(3)).toBe(30);
  });

  it("resolves derived scalars from sliders", () => {
    const s = buildScene([L("a = 3"), L("b = a + 1"), L("b*x")], "2d", {});
    expect(s.env.vars.b).toBe(4);
    expect(compile1(s.plots[0].body, "x", s.env)(2)).toBe(8);
  });

  it("treats y = expr(x) as a plot", () => {
    const s = buildScene([L("y = 2x + 1")], "2d", {});
    expect(s.plots).toHaveLength(1);
    expect(compile1(s.plots[0].body, "x", s.env)(4)).toBe(9);
  });

  it("records per-line parse errors without dropping other plots", () => {
    const s = buildScene([L("sin(x)"), L("x +")], "2d", {});
    expect(s.plots).toHaveLength(1);
    expect(Object.keys(s.errors)).toHaveLength(1);
  });

  it("plots two-variable functions in 3d mode", () => {
    const s = buildScene([L("x^2 - y^2")], "3d", {});
    expect(s.plots[0].mode).toBe("3d");
    expect(compile2(s.plots[0].body, "x", "y", s.env)(3, 1)).toBe(8);
  });

  it("auto-plots f(x,y) defs in 3d but not in 2d", () => {
    expect(buildScene([L("g(x,y) = x*y")], "3d", {}).plots).toHaveLength(1);
    expect(buildScene([L("g(x,y) = x*y")], "2d", {}).plots).toHaveLength(0);
  });

  it("never auto-sliders the output axis (z in 3d, y in 2d)", () => {
    expect(buildScene([L("x + y + z")], "3d", {}).sliders.map((s) => s.name)).not.toContain("z");
    expect(buildScene([L("x + y")], "2d", {}).sliders.map((s) => s.name)).not.toContain("y");
  });

  it("treats z as a coordinate in equations: sphere becomes an implicit surface", () => {
    const s = buildScene([L("x^2 + y^2 + z^2 = 9")], "3d", {});
    expect(s.implicits).toHaveLength(1);
    expect(s.plots).toHaveLength(0);
    expect(s.sliders.map((x) => x.name)).not.toContain("z"); // z is not a slider
  });

  it("explicit z = f(x,y) stays an ordinary surface, not implicit", () => {
    const s = buildScene([L("z = x^2 + y^2")], "3d", {});
    expect(s.plots).toHaveLength(1);
    expect(s.implicits).toHaveLength(0);
  });

  it("rejects an equation using variables outside the axes", () => {
    const s = buildScene([L("x + w = 1")], "3d", {});
    expect(s.implicits).toHaveLength(0);
    expect(Object.keys(s.errors)).toHaveLength(1);
  });

  it("sampling an unknown function returns NaN, never throws (grapher must not crash)", () => {
    const s = buildScene([L("foo(x)")], "2d", {});
    const f = compile1(s.plots[0].body, "x", s.env);
    expect(() => f(1)).not.toThrow();
    expect(Number.isNaN(f(1))).toBe(true);
  });
});
