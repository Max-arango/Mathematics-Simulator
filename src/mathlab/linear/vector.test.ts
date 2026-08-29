import { describe, it, expect } from "vitest";
import {
  add, sub, scale, dot, norm, normalize, distance, projection, cross, angleBetween,
  type Vec,
} from "./vector.ts";

describe("vector arithmetic", () => {
  it("adds and subtracts componentwise", () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
  });

  it("scales", () => {
    expect(scale([1, -2, 3], 2)).toEqual([2, -4, 6]);
    expect(scale([1, 2], 0)).toEqual([0, 0]);
  });

  it("computes dot product", () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it("dot is commutative (u·v = v·u)", () => {
    const u: Vec = [1.5, -2, 7], v: Vec = [3, 0.25, -1];
    expect(dot(u, v)).toBeCloseTo(dot(v, u), 12);
  });

  it("‖v‖² = v·v", () => {
    const v: Vec = [3, 4, 12];
    expect(norm(v) ** 2).toBeCloseTo(dot(v, v), 9);
    expect(norm([3, 4])).toBe(5);
  });

  it("normalize yields a unit vector", () => {
    const u = normalize([3, 4]);
    expect(norm(u)).toBeCloseTo(1, 12);
    expect(u[0]).toBeCloseTo(0.6, 12);
    expect(u[1]).toBeCloseTo(0.8, 12);
  });

  it("normalize of zero vector returns zero vector (guarded)", () => {
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("distance is symmetric", () => {
    const a: Vec = [1, 2, 3], b: Vec = [4, 6, 3];
    expect(distance(a, b)).toBeCloseTo(distance(b, a), 12);
    expect(distance(a, b)).toBe(5);
  });

  it("distance to self is zero", () => {
    expect(distance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it("projection formula: (a·b/b·b)·b", () => {
    expect(projection([2, 2], [3, 0])).toEqual([2, 0]);
  });

  it("projection is idempotent-ish (project the projection onto same vector)", () => {
    const b: Vec = [1, 1, 1];
    const p1 = projection([3, 1, 2], b);
    const p2 = projection(p1, b);
    p1.forEach((x, i) => expect(x).toBeCloseTo(p2[i], 9));
  });

  it("projection onto zero vector returns zero vector", () => {
    expect(projection([1, 2, 3], [0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("cross product of basis vectors", () => {
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
  });

  it("cross is anti-commutative: cross(u,v) = −cross(v,u)", () => {
    const u: Vec = [1, 2, 3], v: Vec = [4, 5, 6];
    expect(cross(u, v)).toEqual(scale(cross(v, u), -1));
  });

  it("cross(u,v) ⊥ u and ⊥ v", () => {
    const u: Vec = [1, 2, 3], v: Vec = [-2, 0, 5];
    const w = cross(u, v);
    expect(dot(w, u)).toBeCloseTo(0, 9);
    expect(dot(w, v)).toBeCloseTo(0, 9);
  });

  it("cross of parallel vectors is zero", () => {
    expect(cross([1, 2, 3], [2, 4, 6])).toEqual([0, 0, 0]);
  });

  it("cross throws on non-R³ vectors", () => {
    expect(() => cross([1, 2], [3, 4])).toThrow(RangeError);
    expect(() => cross([1, 2, 3, 4], [1, 2, 3, 4])).toThrow(RangeError);
  });

  it("angleBetween orthonormal vectors is π/2", () => {
    expect(angleBetween([1, 0], [0, 1])).toBeCloseTo(Math.PI / 2, 12);
  });

  it("angleBetween identical direction is 0", () => {
    expect(angleBetween([2, 0], [5, 0])).toBeCloseTo(0, 9);
  });

  it("angleBetween opposite direction is π", () => {
    expect(angleBetween([1, 0], [-1, 0])).toBeCloseTo(Math.PI, 9);
  });

  it("angleBetween with a zero vector returns 0 (guarded)", () => {
    expect(angleBetween([0, 0], [1, 1])).toBe(0);
  });

  it("throws RangeError on length mismatch (programmer error)", () => {
    expect(() => add([1, 2], [1, 2, 3])).toThrow(RangeError);
    expect(() => sub([1], [1, 2])).toThrow(RangeError);
    expect(() => dot([1, 2], [1])).toThrow(RangeError);
    expect(() => angleBetween([1], [1, 2])).toThrow(RangeError);
  });
});
