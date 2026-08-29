import { describe, it, expect } from "vitest";
import {
  isTopology,
  isHomeomorphism,
  isContinuous,
  isBijective,
  inverseMap,
  identity,
  compose,
  apply,
  type FiniteSpace,
  type FMap,
} from "./core/finiteSpace.ts";
import { meshInvariants } from "./invariants.ts";
import { classifySurface, homeomorphicSurfaces } from "./topology.ts";
import { buildTopoMesh } from "./mesh.ts";
import { SURFACE_BY_ID, SURFACES } from "./surfaces.ts";

// ---------------------------------------------------------------------------
// 1. isTopology must REJECT a family that is not closed under intersection.
// ---------------------------------------------------------------------------
describe("finiteSpace: isTopology rejects missing intersection-closure", () => {
  it("{∅,{a,b},{b,c},X} is NOT a topology: {a,b}∩{b,c}={b}∉τ", () => {
    const space: FiniteSpace = {
      points: ["a", "b", "c"],
      opens: [[], ["a", "b"], ["b", "c"], ["a", "b", "c"]],
    };
    const r = isTopology(space);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/intersection/);
  });
});

// ---------------------------------------------------------------------------
// 2. Sierpiński space: swap is a bijection but NOT a homeomorphism.
// ---------------------------------------------------------------------------
describe("finiteSpace: Sierpiński swap is a non-homeomorphic bijection", () => {
  const S: FiniteSpace = { points: ["a", "b"], opens: [[], ["a"], ["a", "b"]] };
  const swap: FMap = { map: { a: "b", b: "a" } };

  it("swap is bijective", () => {
    expect(isBijective(swap, S, S).bijective).toBe(true);
  });
  it("swap is NOT continuous (preimage of {a} is {b}∉τ)", () => {
    expect(isContinuous(swap, S, S)).toBe(false);
  });
  it("swap is NOT a homeomorphism", () => {
    expect(isHomeomorphism(swap, S, S).homeomorphism).toBe(false);
  });
  it("identity on S IS a homeomorphism", () => {
    expect(isHomeomorphism(identity(S), S, S).homeomorphism).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. A homeomorphism's inverse is itself a homeomorphism; compose(f,inv)=id.
// ---------------------------------------------------------------------------
describe("finiteSpace: inverse of a homeomorphism is a homeomorphism", () => {
  // Two-point space {a,b} with the SAME topology on both sides; f = swap on the
  // indiscrete topology (a genuine non-identity homeomorphism).
  const X: FiniteSpace = { points: ["a", "b"], opens: [[], ["a", "b"]] };
  const f: FMap = { map: { a: "b", b: "a" } };

  it("f is a homeomorphism (indiscrete: only ∅,X open ⇒ every bijection continuous)", () => {
    expect(isHomeomorphism(f, X, X).homeomorphism).toBe(true);
  });
  it("its inverse is also a homeomorphism", () => {
    const inv = inverseMap(f, X, X)!;
    expect(inv).not.toBeNull();
    expect(isHomeomorphism(inv, X, X).homeomorphism).toBe(true);
  });
  it("compose(f, inverse) = identity on every point", () => {
    const inv = inverseMap(f, X, X)!;
    const round = compose(f, inv);
    const id = identity(X);
    for (const p of X.points) expect(apply(round, p)).toBe(apply(id, p));
  });
});

// ---------------------------------------------------------------------------
// 4. Continuity is direction-sensitive: discrete X vs indiscrete Y.
// ---------------------------------------------------------------------------
describe("finiteSpace: continuity direction (discrete vs indiscrete)", () => {
  const pts = ["a", "b", "c"];
  // discrete: every subset open (power set).
  const discrete: FiniteSpace = {
    points: pts,
    opens: [
      [], ["a"], ["b"], ["c"], ["a", "b"], ["a", "c"], ["b", "c"], ["a", "b", "c"],
    ],
  };
  const indiscrete: FiniteSpace = { points: pts, opens: [[], ["a", "b", "c"]] };
  const id: FMap = { map: { a: "a", b: "b", c: "c" } };

  it("id: X(discrete) → Y(indiscrete) IS continuous", () => {
    expect(isContinuous(id, discrete, indiscrete)).toBe(true);
  });
  it("id: Y(indiscrete) → X(discrete) is NOT continuous", () => {
    expect(isContinuous(id, indiscrete, discrete)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Disjoint union of two spheres ⇒ components === 2, not classifiable.
// ---------------------------------------------------------------------------
describe("invariants: disjoint union of two spheres has 2 components", () => {
  it("merged mesh reports components===2 and is not a single closed surface", () => {
    const m = buildTopoMesh(SURFACE_BY_ID["sphere"], null, 0, [], 40);
    const N = m.gridPos.length / 3;

    // Second sphere: same positions offset by +10 in x.
    const merged = new Float32Array(m.gridPos.length * 2);
    merged.set(m.gridPos, 0);
    for (let i = 0; i < N; i++) {
      merged[(N + i) * 3] = m.gridPos[i * 3] + 10;
      merged[(N + i) * 3 + 1] = m.gridPos[i * 3 + 1];
      merged[(N + i) * 3 + 2] = m.gridPos[i * 3 + 2];
    }

    // Indices: original, then original with +N vertex offset.
    const idx = new Uint32Array(m.indices.length * 2);
    idx.set(m.indices, 0);
    for (let i = 0; i < m.indices.length; i++) idx[m.indices.length + i] = m.indices[i] + N;

    const r = meshInvariants(merged, idx);
    expect(r.components).toBe(2);
    // Classification theorem requires a single connected surface.
    expect(r.components === 1).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Tolerance sanity + EXACT integer Euler characteristic.
// ---------------------------------------------------------------------------
describe("invariants: no over-merge, exact Euler characteristic", () => {
  it("sphere V is large (not collapsed by tol merge)", () => {
    // res=40 sphere: (n-1)*n + 2 poles = 39*40+2 = 1562 distinct vertices.
    expect(classifySurface("sphere").V).toBeGreaterThan(1000);
  });
  it("sphere χ is EXACTLY 2 (integer)", () => {
    const s = classifySurface("sphere");
    expect(s.euler).toBe(2);
    expect(Number.isInteger(s.euler)).toBe(true);
  });
  it("torus χ is EXACTLY 0 (integer)", () => {
    const t = classifySurface("torus");
    expect(t.euler).toBe(0);
    expect(Number.isInteger(t.euler)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Self-homeomorphism + genus equivalence classes across all SURFACES.
// ---------------------------------------------------------------------------
describe("topology: homeomorphism equivalence classes match genus", () => {
  it("every surface is homeomorphic to itself", () => {
    for (const s of SURFACES) {
      expect(homeomorphicSurfaces(s.id, s.id).homeomorphic).toBe(true);
    }
  });

  it("same-genus ⇔ homeomorphic across all pairs (0 with 0, 1 with 1, none across)", () => {
    for (const a of SURFACES)
      for (const b of SURFACES) {
        const got = homeomorphicSurfaces(a.id, b.id).homeomorphic;
        const expected = a.genus === b.genus; // all surfaces here are closed/orientable
        expect(
          got,
          `${a.id}(g${a.genus}) vs ${b.id}(g${b.genus}) expected ${expected} got ${got}`,
        ).toBe(expected);
      }
  });
});

// ---------------------------------------------------------------------------
// 8. Twisted torus ≅ plain torus: different geometry, equal topology.
// ---------------------------------------------------------------------------
describe("topology: twisted torus is homeomorphic to the plain torus", () => {
  it("twisted ↔ torus homeomorphic (both χ=0)", () => {
    const r = homeomorphicSurfaces("twisted", "torus");
    expect(r.homeomorphic).toBe(true);
    expect(r.a.euler).toBe(0);
    expect(r.b.euler).toBe(0);
  });
});
