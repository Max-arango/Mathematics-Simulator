import { describe, it, expect } from "vitest";
import { resolveSlider, snap, evalExpr } from "./sliderConfig.ts";
import type { Slider } from "../mathlab/graph/scene.ts";
import type { Env } from "../mathlab/core/eval.ts";

const s: Slider = { name: "d", value: 3, min: -10, max: 10, step: 0.1 };
const env: Env = { vars: { n: 8 }, funcs: {} };

describe("resolveSlider", () => {
  it("falls back to the slider's own range when unconfigured", () => {
    expect(resolveSlider(s, undefined, env)).toEqual({ min: -10, max: 10, step: 0.1 });
  });
  it("evaluates config expressions against the env: {0, 2, …, n-1}", () => {
    const r = resolveSlider(s, { min: "0", max: "n - 1", step: "2" }, env);
    expect(r).toEqual({ min: 0, max: 7, step: 2 }); // n=8 -> max 7
  });
  it("uses the fallback when a config expression is invalid", () => {
    expect(resolveSlider(s, { min: "0", max: "bogus(", step: "2" }, env).max).toBe(s.max);
  });
});

describe("snap", () => {
  it("snaps to the nearest step from min", () => {
    expect(snap(3.2, 0, 2)).toBe(4);
    expect(snap(0.9, 0, 2)).toBe(0);
  });
  it("kills float dust", () => {
    expect(snap(0.3, 0, 0.1)).toBe(0.3);
  });
  it("passes through when step is 0", () => expect(snap(3.14159, 0, 0)).toBe(3.14159));
});

describe("evalExpr", () => {
  it("returns fallback for empty string", () => expect(evalExpr("", env, 42)).toBe(42));
  it("evaluates against env vars", () => expect(evalExpr("n*2", env, 0)).toBe(16));
});
