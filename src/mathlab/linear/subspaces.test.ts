import { describe, it, expect } from "vitest";
import { nullspace, columnSpace, conditionNumber } from "./subspaces.ts";
import { make, rank, identity, type Matrix } from "./matrix.ts";
import { norm, type Vec } from "./vector.ts";

// ‖A·v‖ for a plain vector v.
const applyNorm = (A: Matrix, v: Vec): number => {
  const Av = A.data.map((row) => row.reduce((s, a, k) => s + a * v[k], 0));
  return norm(Av);
};

describe("nullspace", () => {
  it("full-rank square → trivial (empty basis)", () => {
    expect(nullspace(make([[1, 2], [3, 4]]))).toEqual([]);
  });

  it("full-rank tall (m > n) → trivial", () => {
    expect(nullspace(make([[1, 0], [0, 1], [1, 1]]))).toEqual([]);
  });

  it("rank-deficient [[1,2],[2,4]] → 1-D basis spanning ∝ (2,−1)", () => {
    const basis = nullspace(make([[1, 2], [2, 4]]));
    expect(basis.length).toBe(1);
    const v = basis[0];
    // v ∝ (2,−1): the ratio v[0]/v[1] must be −2.
    expect(v[0] / v[1]).toBeCloseTo(-2, 8);
  });

  it("every null-space basis vector v satisfies ‖A·v‖ ≈ 0", () => {
    const A = make([[1, 2, 3], [2, 4, 6], [1, 1, 1]]); // rows 1,2 dependent → nullity ≥ 1
    const basis = nullspace(A);
    expect(basis.length).toBeGreaterThan(0);
    basis.forEach((v) => expect(applyNorm(A, v)).toBeCloseTo(0, 8));
  });

  it("dimension obeys rank–nullity (nullity = cols − rank), square", () => {
    const A = make([[1, 2, 3], [2, 4, 6], [1, 1, 1]]);
    expect(nullspace(A).length).toBe(A.cols - rank(A));
  });

  it("wide matrix has nullity = cols − rank", () => {
    const A = make([[1, 2, 3, 4], [2, 4, 6, 8]]); // rank 1, 4 columns
    const basis = nullspace(A);
    expect(basis.length).toBe(A.cols - rank(A));
    basis.forEach((v) => expect(applyNorm(A, v)).toBeCloseTo(0, 8));
  });

  it("basis vectors are unit length", () => {
    const basis = nullspace(make([[1, 2], [2, 4]]));
    basis.forEach((v) => expect(norm(v)).toBeCloseTo(1, 8));
  });
});

describe("columnSpace", () => {
  it("dimension equals the rank (full-rank square)", () => {
    const A = make([[1, 2], [3, 4]]);
    expect(columnSpace(A).length).toBe(rank(A));
  });

  it("dimension equals the rank (rank-deficient)", () => {
    const A = make([[1, 2], [2, 4]]);
    expect(columnSpace(A).length).toBe(1);
    expect(columnSpace(A).length).toBe(rank(A));
  });

  it("returns actual columns of A at pivot positions", () => {
    const A = make([[1, 2], [2, 4]]); // col 0 is the pivot column
    const basis = columnSpace(A);
    expect(basis).toEqual([[1, 2]]);
  });

  it("dimension equals the rank (rectangular)", () => {
    const A = make([[1, 0, 1], [0, 1, 1]]); // rank 2, third column dependent
    expect(columnSpace(A).length).toBe(rank(A));
  });
});

describe("conditionNumber", () => {
  it("identity → 1", () => {
    expect(conditionNumber(identity(3))).toBeCloseTo(1, 8);
  });

  it("diag(1, 100) → 100", () => {
    expect(conditionNumber(make([[1, 0], [0, 100]]))).toBeCloseTo(100, 6);
  });

  it("singular matrix → Infinity", () => {
    expect(conditionNumber(make([[1, 2], [2, 4]]))).toBe(Infinity);
  });

  it("rank-deficient rectangular → Infinity", () => {
    expect(conditionNumber(make([[1, 2, 3], [2, 4, 6]]))).toBe(Infinity);
  });

  it("is ≥ 1 for well-conditioned matrices", () => {
    expect(conditionNumber(make([[2, 1], [1, 3]]))).toBeGreaterThanOrEqual(1 - 1e-9);
  });
});
