import { describe, it, expect } from "vitest";
import { makeSystem } from "./system.ts";
import { compareTrajectories, separationSeries } from "./compare.ts";
import type { TrajectorySample } from "./lifecycle.ts";

const contracting = makeSystem(["x", "y"], ["-x", "-y"], {}, "continuous");
const expanding = makeSystem(["x", "y"], ["x", "y"], {}, "continuous");

describe("compareTrajectories — aligned separation series", () => {
  it("returns Δ starting at the initial separation", () => {
    const { separation } = compareTrajectories(contracting, [1, 0], [1.1, 0], { t1: 5, h: 0.05 });
    expect(separation[0].delta).toBeCloseTo(0.1, 6);
  });
  it("contracting flow: Δ(t) shrinks", () => {
    const { separation } = compareTrajectories(contracting, [1, 0], [1.1, 0], { t1: 5, h: 0.05 });
    const last = separation[separation.length - 1];
    expect(last.delta).toBeLessThan(separation[0].delta);
  });
  it("expanding flow: Δ(t) grows", () => {
    const { separation } = compareTrajectories(expanding, [1, 0], [1.1, 0], { t1: 3, h: 0.05 });
    const last = separation[separation.length - 1];
    expect(last.delta).toBeGreaterThan(separation[0].delta);
  });
  it("both orbits share the same time grid length", () => {
    const { a, b, t, separation } = compareTrajectories(contracting, [1, 0], [-1, 1], { t1: 4, h: 0.05 });
    expect(a.length).toBe(b.length);
    expect(t.length).toBe(separation.length);
  });
});

describe("separationSeries — pure on two sample arrays", () => {
  it("matches by index up to the shorter series", () => {
    const a: TrajectorySample[] = [{ t: 0, x: [0, 0] }, { t: 1, x: [3, 4] }, { t: 2, x: [0, 0] }];
    const b: TrajectorySample[] = [{ t: 0, x: [0, 0] }, { t: 1, x: [0, 0] }];
    const s = separationSeries(a, b);
    expect(s.length).toBe(2);
    expect(s[1].delta).toBeCloseTo(5, 6); // ‖(3,4)‖ = 5
  });
});
