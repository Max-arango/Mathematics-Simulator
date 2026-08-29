// Vectors in Rⁿ — plain numeric arrays. These are FLOATING-POINT operations:
// results carry rounding error, so callers comparing outputs should use tolerances
// (see core/constants.ts). Length mismatches are PROGRAMMER errors (not math results)
// and throw RangeError; near-zero norms are a legitimate math case and are guarded.
import { EPSILON } from "../core/constants.ts";

export type Vec = number[];

function sameLen(a: Vec, b: Vec): void {
  if (a.length !== b.length) {
    throw new RangeError(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
}

export const add = (a: Vec, b: Vec): Vec => (sameLen(a, b), a.map((x, i) => x + b[i]));
export const sub = (a: Vec, b: Vec): Vec => (sameLen(a, b), a.map((x, i) => x - b[i]));
export const scale = (v: Vec, k: number): Vec => v.map((x) => x * k);
export const dot = (a: Vec, b: Vec): number => (sameLen(a, b), a.reduce((s, x, i) => s + x * b[i], 0));

/** Euclidean (L2) norm. */
export const norm = (v: Vec): number => Math.sqrt(dot(v, v));

/** Unit vector in the direction of v. Zero vector (norm ≈ 0) returns a zero vector. */
export function normalize(v: Vec): Vec {
  const n = norm(v);
  if (n <= EPSILON) return v.map(() => 0);
  return scale(v, 1 / n);
}

export const distance = (a: Vec, b: Vec): number => norm(sub(a, b));

/** Projection of a onto `onto`: (a·b / b·b)·b. Returns zero vector if `onto` ≈ 0. */
export function projection(a: Vec, onto: Vec): Vec {
  const d = dot(onto, onto);
  if (d <= EPSILON) return onto.map(() => 0);
  return scale(onto, dot(a, onto) / d);
}

/** Cross product — R³ only. */
export function cross(a: Vec, b: Vec): Vec {
  if (a.length !== 3 || b.length !== 3) {
    throw new RangeError(`cross product requires length-3 vectors, got ${a.length} and ${b.length}`);
  }
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Angle between a and b in radians, [0, π]. Returns 0 if either is ≈ 0. */
export function angleBetween(a: Vec, b: Vec): number {
  sameLen(a, b);
  const denom = norm(a) * norm(b);
  if (denom <= EPSILON) return 0;
  // clamp guards against |cos| > 1 from rounding.
  const c = Math.min(1, Math.max(-1, dot(a, b) / denom));
  return Math.acos(c);
}
