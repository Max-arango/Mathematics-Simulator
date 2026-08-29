import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store.ts";

const aspect = 1.6;

// Complex point currently under a screen fraction, given a viewport.
function pointAt(fx: number, fy: number) {
  const v = useStore.getState().view;
  return [v.centerRe + (fx - 0.5) * v.span * aspect, v.centerIm + (fy - 0.5) * v.span];
}

describe("zoomAt", () => {
  beforeEach(() => useStore.getState().setActive("mandelbrot"));

  it("keeps the point under the cursor fixed while zooming in", () => {
    const [fx, fy] = [0.3, 0.7];
    const [re0, im0] = pointAt(fx, fy);
    useStore.getState().zoomAt(fx, fy, aspect, 0.5);
    const [re1, im1] = pointAt(fx, fy);
    expect(re1).toBeCloseTo(re0, 10);
    expect(im1).toBeCloseTo(im0, 10);
  });

  it("shrinks the span by the factor", () => {
    const before = useStore.getState().view.span;
    useStore.getState().zoomAt(0.5, 0.5, aspect, 0.25);
    expect(useStore.getState().view.span).toBeCloseTo(before * 0.25, 12);
  });
});

describe("animTick", () => {
  beforeEach(() => {
    useStore.getState().setActive("mandelbrot");
    useStore.getState().animBind("exponent");
  });

  it("does nothing while paused (no param write)", () => {
    useStore.getState().setAnim({ from: 0, to: 10, playing: false, phase: 0.5 });
    const before = useStore.getState().params.exponent;
    useStore.getState().animTick(1);
    expect(useStore.getState().params.exponent).toBe(before);
  });

  it("maps phase to value across the range", () => {
    useStore.getState().setAnim({ from: 0, to: 100, speed: 1, steps: 0, mode: "loop", playing: true, phase: 0, dir: 1 });
    useStore.getState().animTick(0.25); // phase -> 0.25
    expect(useStore.getState().params.exponent).toBeCloseTo(25, 6);
  });

  it("snaps to discrete steps", () => {
    useStore.getState().setAnim({ from: 0, to: 100, speed: 1, steps: 4, mode: "loop", playing: true, phase: 0, dir: 1 });
    useStore.getState().animTick(0.3); // phase 0.3 -> nearest quarter 0.25 -> 25
    expect(useStore.getState().params.exponent).toBeCloseTo(25, 6);
  });

  it("bounces in ping-pong mode", () => {
    useStore.getState().setAnim({ from: 0, to: 1, speed: 1, steps: 0, mode: "pingpong", playing: true, phase: 0.9, dir: 1 });
    useStore.getState().animTick(0.2); // 0.9 + 0.2 = 1.1 -> reflect to 0.9, dir -1
    const a = useStore.getState().anim;
    expect(a.dir).toBe(-1);
    expect(a.phase).toBeCloseTo(0.9, 6);
  });

  it("stops at the end in once mode", () => {
    useStore.getState().setAnim({ from: 0, to: 1, speed: 1, steps: 0, mode: "once", playing: true, phase: 0.95, dir: 1 });
    useStore.getState().animTick(0.2);
    expect(useStore.getState().anim.playing).toBe(false);
    expect(useStore.getState().anim.phase).toBe(1);
  });
});

describe("juliaFromPoint", () => {
  it("switches to Julia and stores the clicked constant", () => {
    useStore.getState().juliaFromPoint(-0.75, 0.11);
    const s = useStore.getState();
    expect(s.activeId).toBe("julia");
    expect(s.params.cRe).toBeCloseTo(-0.75, 12);
    expect(s.params.cIm).toBeCloseTo(0.11, 12);
    expect(s.pickMode).toBe(false);
  });
});
