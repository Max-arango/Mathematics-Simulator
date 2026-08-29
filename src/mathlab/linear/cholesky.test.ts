import { describe, it, expect } from "vitest";
import { cholesky } from "./cholesky.ts";
import { make, mul, transpose, identity, type Matrix } from "./matrix.ts";

const approxEqualMatrix = (a: Matrix, b: Matrix, digits = 9): void => {
  expect(a.rows).toBe(b.rows);
  expect(a.cols).toBe(b.cols);
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < a.cols; c++) expect(a.data[r][c]).toBeCloseTo(b.data[r][c], digits);
  }
};

describe("cholesky reconstruction A = L·Lᵀ", () => {
  it("2×2 SPD", () => {
    const A = make([[4, 12], [12, 37]]);
    const L = cholesky(A);
    expect(L).not.toBeNull();
    if (L) approxEqualMatrix(mul(L, transpose(L)), A);
  });

  it("3×3 SPD", () => {
    const A = make([[4, 12, -16], [12, 37, -43], [-16, -43, 98]]);
    const L = cholesky(A);
    expect(L).not.toBeNull();
    if (L) approxEqualMatrix(mul(L, transpose(L)), A);
  });

  it("identity factors to identity", () => {
    const L = cholesky(identity(3));
    expect(L).not.toBeNull();
    if (L) approxEqualMatrix(L, identity(3));
  });

  it("diagonal SPD factors to sqrt of diagonal", () => {
    const A = make([[9, 0, 0], [0, 16, 0], [0, 0, 25]]);
    const L = cholesky(A);
    expect(L).not.toBeNull();
    if (L) approxEqualMatrix(L, make([[3, 0, 0], [0, 4, 0], [0, 0, 5]]));
  });
});

describe("cholesky known fixtures (hand-computed L)", () => {
  it("2×2 matches hand value L = [[2,0],[6,1]]", () => {
    const L = cholesky(make([[4, 12], [12, 37]]));
    expect(L).not.toBeNull();
    if (L) approxEqualMatrix(L, make([[2, 0], [6, 1]]));
  });

  it("3×3 matches hand value L = [[2,0,0],[6,1,0],[-8,5,3]]", () => {
    const L = cholesky(make([[4, 12, -16], [12, 37, -43], [-16, -43, 98]]));
    expect(L).not.toBeNull();
    if (L) approxEqualMatrix(L, make([[2, 0, 0], [6, 1, 0], [-8, 5, 3]]));
  });
});

describe("cholesky output is lower-triangular", () => {
  it("above-diagonal entries are zero", () => {
    const A = make([[4, 12, -16], [12, 37, -43], [-16, -43, 98]]);
    const L = cholesky(A);
    expect(L).not.toBeNull();
    if (L) {
      for (let r = 0; r < L.rows; r++) {
        for (let c = r + 1; c < L.cols; c++) expect(L.data[r][c]).toBe(0);
      }
    }
  });
});

describe("cholesky non-SPD returns null", () => {
  it("indefinite symmetric [[1,2],[2,1]] → null", () => {
    expect(cholesky(make([[1, 2], [2, 1]]))).toBeNull();
  });

  it("zero matrix (pivot 0) → null", () => {
    expect(cholesky(make([[0, 0], [0, 0]]))).toBeNull();
  });

  it("negative-definite [[-1,0],[0,-1]] → null", () => {
    expect(cholesky(make([[-1, 0], [0, -1]]))).toBeNull();
  });

  it("positive-semidefinite-but-singular → null (strict positive-definite)", () => {
    // [[1,1],[1,1]] has eigenvalues 0 and 2 → PSD, not PD → rejected.
    expect(cholesky(make([[1, 1], [1, 1]]))).toBeNull();
  });
});

describe("cholesky preconditions throw", () => {
  it("non-square throws RangeError", () => {
    expect(() => cholesky(make([[1, 2, 3], [4, 5, 6]]))).toThrow(RangeError);
  });

  it("grossly non-symmetric throws RangeError", () => {
    expect(() => cholesky(make([[4, 12], [13, 37]]))).toThrow(RangeError);
  });
});
