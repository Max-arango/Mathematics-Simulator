// Coordinate transforms, adaptive gridding, and field-density helpers shared by
// the Dynamics view layer (no React, no DOM — pure mathlab).
//
// The view defines a world rectangle [x0,x1]×[y0,y1] mapped onto an (w,h)
// canvas. World height = span; world width = span * (w/h) keeps aspect.
import type { Vec } from "../linear/vector.ts";

export interface View { cx: number; cy: number; span: number }
export interface Rect { xMin: number; xMax: number; yMin: number; yMax: number; }

/** World bounds of `view` rendered onto a canvas of size (w, h). */
export function viewBounds(v: View, w: number, h: number): Rect {
  const aspect = w / h;
  const halfH = v.span / 2;
  const halfW = v.span * aspect / 2;
  return {
    xMin: v.cx - halfW, xMax: v.cx + halfW,
    yMin: v.cy - halfH, yMax: v.cy + halfH,
  };
}

/** World → screen px. */
export function worldToScreen(x: number, y: number, w: number, h: number, v: View): [number, number] {
  const aspect = w / h;
  return [
    ((x - v.cx) / (v.span * aspect) + 0.5) * w,
    (0.5 - (y - v.cy) / v.span) * h,
  ];
}

/** Screen px → world. */
export function screenToWorld(px: number, py: number, w: number, h: number, v: View): [number, number] {
  const aspect = w / h;
  return [
    v.cx + (px / w - 0.5) * v.span * aspect,
    v.cy + (0.5 - py / h) * v.span,
  ];
}

/** Adapt a "nice" tick step in world units: smallest nice number ≥ |u| in
 *  {1, 2, 5, 10}·10^k. Matches the D3 / mpl convention: 0.7 → 1, 3 → 5,
 *  7 → 10, 23 → 50, 70 → 100. (ponytail: avoids drift pitfalls of midpoint
 *  round-half-up; upgrade when a finer "best scale" matters.) */
export function niceStep(u: number): number {
  if (!Number.isFinite(u) || u <= 0) return 1;
  const mag = Math.abs(u);
  const p = Math.pow(10, Math.floor(Math.log10(mag)));
  const f = mag / p;
  const out = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  return u < 0 ? -out : out;
}

/** Visible-tick interval for axes/labels: snap to a "nice" sub-multiple of `step`. */
export function tickInterval(span: number, targetTicks = 10): number {
  const raw = span / targetTicks;
  const n = niceStep(raw);
  // Make sure we don't overshoot label density by much.
  const ticks = span / n;
  if (ticks > targetTicks * 1.5) return n * 2;
  if (ticks < targetTicks / 2) return n / 2;
  return n;
}

/**
 * Choose a grid density for the vector field that scales mildly with zoom:
 * coarse at far-out zooms, denser when zoomed in. Returns (rows, cols).
 * The field renderer caps both at MAX_FIELD_GRID to keep frame budget bounded.
 */
export const MAX_FIELD_GRID = 32;
export function fieldGrid(span: number): { rows: number; cols: number } {
  // Roughly 1 sample per 0.4 world units, then clamp.
  const target = Math.max(8, Math.min(48, Math.round(span * 2.5)));
  return { rows: target, cols: target };
}

/**
 * Bin the field's magnitude into a logarithmic bucket → an opacity factor in
 * [min, 1]. Used to communicate magnitude WITHOUT distorting arrow length
 * (arrows encode direction, color encodes magnitude).
 */
export function magnitudeIntensity(mag: number, refMag: number): number {
  if (!Number.isFinite(refMag) || refMag <= 0) return 0.25;
  if (!Number.isFinite(mag) || mag <= 0) return 0.25; // floor; never fully invisible
  // log-binned in [0.1 ref, 10 ref]: 0 → 1.
  const lo = Math.log10(0.1 * refMag);
  const hi = Math.log10(10 * refMag);
  const x = Math.log10(mag);
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return 0.25 + 0.75 * t;
}

/** Distance from p to segment ab, used for nullcline hover / culling. */
export function pointSegmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * dx, cy = a[1] + t * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
}