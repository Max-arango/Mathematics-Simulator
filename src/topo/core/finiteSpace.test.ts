import { describe, it, expect } from "vitest";
import {
  type FiniteSpace,
  type FMap,
  apply,
  isTopology,
  isHomeomorphism,
  isBijective,
  identity,
  compose,
  inverseMap,
} from "./finiteSpace.ts";

// Power set for building the discrete topology.
const powerSet = <T>(a: T[]): T[][] =>
  a.reduce<T[][]>((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);

const discrete = (points: FiniteSpace["points"]): FiniteSpace => ({ points, opens: powerSet(points) });
const indiscrete = (points: FiniteSpace["points"]): FiniteSpace => ({ points, opens: [[], points] });
const sierpinski: FiniteSpace = { points: ["a", "b"], opens: [[], ["a"], ["a", "b"]] };

describe("isTopology", () => {
  it("accepts discrete and indiscrete", () => {
    expect(isTopology(discrete(["a", "b", "c"])).valid).toBe(true);
    expect(isTopology(indiscrete(["a", "b", "c"])).valid).toBe(true);
    expect(isTopology(sierpinski).valid).toBe(true);
  });
  it("rejects a set not closed under union with a reason", () => {
    const bad: FiniteSpace = { points: ["a", "b", "c"], opens: [[], ["a"], ["b"], ["a", "b", "c"]] };
    const r = isTopology(bad);
    expect(r.valid).toBe(false);
    expect(r.reason).toBeTruthy();
  });
});

describe("identity is a homeomorphism", () => {
  for (const [name, X] of [
    ["discrete", discrete(["a", "b", "c"])],
    ["indiscrete", indiscrete(["a", "b", "c"])],
    ["sierpinski", sierpinski],
  ] as const) {
    it(name, () => {
      expect(isHomeomorphism(identity(X), X, X).homeomorphism).toBe(true);
    });
  }
});

describe("finer vs coarser topology on {a,b}", () => {
  const X = discrete(["a", "b"]); // finer
  const Y = indiscrete(["a", "b"]); // coarser
  const id: FMap = { map: { a: "a", b: "b" } };

  it("id: X→Y (finer→coarser) is continuous & bijective but NOT a homeomorphism", () => {
    const r = isHomeomorphism(id, X, Y);
    expect(r.bijective).toBe(true);
    expect(r.continuous).toBe(true);
    expect(r.inverseContinuous).toBe(false);
    expect(r.homeomorphism).toBe(false);
  });
  it("id: Y→X (coarser→finer) is NOT continuous", () => {
    const r = isHomeomorphism(id, Y, X);
    expect(r.continuous).toBe(false);
    expect(r.homeomorphism).toBe(false);
  });
});

describe("non-bijective map", () => {
  it("collapsing 2 points is not bijective ⇒ not a homeomorphism", () => {
    const X = discrete(["a", "b"]);
    const Y = discrete(["a", "b"]);
    const collapse: FMap = { map: { a: "a", b: "a" } };
    expect(isBijective(collapse, X, Y).bijective).toBe(false);
    expect(isHomeomorphism(collapse, X, Y).homeomorphism).toBe(false);
  });
});

describe("composition", () => {
  it("composite of two homeomorphisms is a homeomorphism and (g∘f)⁻¹ = f⁻¹∘g⁻¹", () => {
    const X = discrete(["a", "b", "c"]);
    const Y = discrete(["x", "y", "z"]);
    const Z = discrete(["p", "q", "r"]);
    const f: FMap = { map: { a: "x", b: "y", c: "z" } };
    const g: FMap = { map: { x: "p", y: "q", z: "r" } };
    expect(isHomeomorphism(f, X, Y).homeomorphism).toBe(true);
    expect(isHomeomorphism(g, Y, Z).homeomorphism).toBe(true);

    const gf = compose(g, f);
    expect(isHomeomorphism(gf, X, Z).homeomorphism).toBe(true);

    const gfInv = inverseMap(gf, X, Z)!;
    const fInv = inverseMap(f, X, Y)!;
    const gInv = inverseMap(g, Y, Z)!;
    const composedInv = compose(fInv, gInv); // f⁻¹∘g⁻¹ : Z→X
    for (const z of Z.points) expect(apply(gfInv, z)).toBe(apply(composedInv, z));
  });
});
