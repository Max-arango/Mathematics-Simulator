import { describe, it, expect } from "vitest";
import {
  viewBounds, worldToScreen, screenToWorld, niceStep, tickInterval,
  fieldGrid, magnitudeIntensity, pointSegmentDistance,
} from "./geometry.ts";

describe("viewBounds", () => {
  it("returns world rectangle for a square canvas", () => {
    const b = viewBounds({ cx: 0, cy: 0, span: 10 }, 100, 100);
    expect(b).toEqual({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 });
  });
  it("aspect-corrects for a non-square canvas (wider than tall)", () => {
    const b = viewBounds({ cx: 0, cy: 0, span: 10 }, 200, 100); // aspect=2
    expect(b).toEqual({ xMin: -10, xMax: 10, yMin: -5, yMax: 5 });
  });
});

describe("worldToScreen / screenToWorld are inverses", () => {
  it("round-trips a few points through a non-square canvas", () => {
    const v = { cx: 1.5, cy: -0.3, span: 12 };
    for (const [x, y] of [[0, 0], [3.7, -2.1], [-1.2, 4.5], [10, -5]]) {
      const [px, py] = worldToScreen(x, y, 800, 600, v);
      const [wx, wy] = screenToWorld(px, py, 800, 600, v);
      expect(wx).toBeCloseTo(x, 9);
      expect(wy).toBeCloseTo(y, 9);
    }
  });
});

describe("niceStep", () => {
  it("rounds up to the smallest nice number ≥ |u| (1, 2, 5, 10)", () => {
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(23)).toBe(50);
    expect(niceStep(70)).toBe(100);
    // Sub-unit scale: same shape, smaller power of 10.
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(0.15)).toBe(0.2);
  });
});

describe("tickInterval", () => {
  it("stays near targetTicks per span", () => {
    for (const span of [1, 2, 10, 100, 1000]) {
      const step = tickInterval(span, 10);
      const ticks = span / step;
      expect(ticks).toBeGreaterThanOrEqual(5);
      expect(ticks).toBeLessThanOrEqual(20);
    }
  });
});

describe("fieldGrid", () => {
  it("grows with span but stays bounded", () => {
    const a = fieldGrid(2); const b = fieldGrid(20); const c = fieldGrid(200);
    expect(a.cols).toBeLessThanOrEqual(b.cols);
    expect(b.cols).toBeLessThanOrEqual(c.cols);
    expect(c.cols).toBeLessThanOrEqual(64); // ≤ MAX_FIELD_GRID+overhead
  });
});

describe("magnitudeIntensity", () => {
  it("0 → 0.25 floor (always slightly visible), ref → 0.625, 10×ref → 1", () => {
    expect(magnitudeIntensity(0, 1)).toBe(0.25);
    expect(magnitudeIntensity(1, 1)).toBeCloseTo(0.625, 9);
    expect(magnitudeIntensity(10, 1)).toBeCloseTo(1, 9);
  });
  it("clamps outside the log-binned window", () => {
    expect(magnitudeIntensity(0.001, 1)).toBe(0.25);
    expect(magnitudeIntensity(1000, 1)).toBe(1);
  });
});

describe("pointSegmentDistance", () => {
  it("perpendicular foot at the midpoint", () => {
    const d = pointSegmentDistance([2, 1], [0, 0], [4, 0]);
    expect(d).toBeCloseTo(1, 9);
  });
  it("clamps before the start", () => {
    const d = pointSegmentDistance([-2, 1], [0, 0], [4, 0]);
    expect(d).toBeCloseTo(Math.sqrt(4 + 1), 9);
  });
  it("clamps after the end", () => {
    const d = pointSegmentDistance([6, 3], [0, 0], [4, 0]);
    expect(d).toBeCloseTo(Math.sqrt(4 + 9), 9);
  });
});