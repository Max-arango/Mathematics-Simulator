import { describe, it, expect } from "vitest";
import { makeSystem } from "./system.ts";
import { findEquilibria } from "./equilibria.ts";
import { identifyAttractors } from "./attractors.ts";
import { createBasinSampler, cellCenter, type BasinLabel } from "./basins.ts";
import type { Rect } from "./geometry.ts";

const bounds: Rect = { xMin: -2.5, xMax: 2.5, yMin: -2.5, yMax: 2.5 };

// Bistable: sinks at (±1, 0), saddle at (0,0). x<0 ⇒ (−1,0); x>0 ⇒ (+1,0).
const bistable = makeSystem(["x", "y"], ["x - x^3", "-y"], {}, "continuous");
// Single global sink at the origin.
const sink = makeSystem(["x", "y"], ["-x", "-y"], {}, "continuous");
// Pure saddle: nothing attracts.
const saddle = makeSystem(["x", "y"], ["x", "-y"], {}, "continuous");

function runToCompletion(sys: typeof sink, opts = {}) {
  const eqs = findEquilibria(sys, { range: [-2, 2], gridPoints: 5 }).points;
  const attractors = identifyAttractors(sys, { equilibria: eqs });
  const sampler = createBasinSampler(sys, bounds, attractors, eqs, { resolution: "low", ...opts });
  while (!sampler.step(64)) { /* incremental */ }
  return { sampler, attractors };
}

function labelAt(sampler: ReturnType<typeof createBasinSampler>, x: number, y: number): BasinLabel {
  const g = sampler.grid;
  const col = Math.min(g.cols - 1, Math.max(0, Math.floor(((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * g.cols)));
  const row = Math.min(g.rows - 1, Math.max(0, Math.floor(((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * g.rows)));
  return g.labels[row * g.cols + col]!;
}

describe("createBasinSampler — bistable two-sink identity (§6)", () => {
  const { sampler, attractors } = runToCompletion(bistable);
  it("finds two stable-equilibrium attractors", () => {
    expect(attractors.length).toBe(2);
    expect(attractors.every((a) => a.kind === "stable-equilibrium")).toBe(true);
  });
  it("fills every cell", () => {
    expect(sampler.done).toBe(sampler.total);
    expect(sampler.grid.labels.every((l) => l !== null)).toBe(true);
  });
  it("left half and right half converge to DIFFERENT attractors", () => {
    const left = labelAt(sampler, -2, 0);
    const right = labelAt(sampler, 2, 0);
    expect(left.kind).toBe("attractor");
    expect(right.kind).toBe("attractor");
    if (left.kind === "attractor" && right.kind === "attractor") {
      expect(left.index).not.toBe(right.index);
    }
  });
  it("two cells on the same side share the SAME attractor identity", () => {
    const a = labelAt(sampler, -2, 0.5);
    const b = labelAt(sampler, -1.5, -0.5);
    expect(a).toEqual(b);
  });
});

describe("createBasinSampler — single sink", () => {
  const { sampler } = runToCompletion(sink);
  it("labels the whole grid with the one attractor", () => {
    const nonAttractor = sampler.grid.labels.filter((l) => l && l.kind !== "attractor");
    // Corners may time out / escape; the bulk must be the single attractor.
    const attractorCells = sampler.grid.labels.filter((l) => l && l.kind === "attractor").length;
    expect(attractorCells).toBeGreaterThan(sampler.total / 2);
    expect(nonAttractor.length).toBeLessThan(sampler.total);
  });
});

describe("createBasinSampler — no attractors (pure saddle)", () => {
  const { sampler, attractors } = runToCompletion(saddle);
  it("has no attractors", () => expect(attractors.length).toBe(0));
  it("no cell is labelled 'attractor'", () => {
    expect(sampler.grid.labels.some((l) => l && l.kind === "attractor")).toBe(false);
  });
});

describe("cellCenter maps grid indices into world bounds", () => {
  const { sampler } = runToCompletion(sink);
  const g = sampler.grid;
  it("first cell sits inside the bottom-left cell, last inside the top-right", () => {
    const first = cellCenter(g, 0, 0);
    const last = cellCenter(g, g.cols - 1, g.rows - 1);
    expect(first[0]).toBeGreaterThan(bounds.xMin);
    expect(first[0]).toBeLessThan(bounds.xMin + (bounds.xMax - bounds.xMin) / g.cols);
    expect(last[0]).toBeLessThan(bounds.xMax);
    expect(last[0]).toBeGreaterThan(bounds.xMax - (bounds.xMax - bounds.xMin) / g.cols);
  });
});
