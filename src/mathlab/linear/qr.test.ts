import { describe, it, expect } from "vitest";
import { qr } from "./qr.ts";
import { make, mul, transpose, identity, type Matrix } from "./matrix.ts";

const approxEqualMatrix = (a: Matrix, b: Matrix, digits = 9): void => {
  expect(a.rows).toBe(b.rows);
  expect(a.cols).toBe(b.cols);
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < a.cols; c++) expect(a.data[r][c]).toBeCloseTo(b.data[r][c], digits);
  }
};

describe("qr shape + preconditions", () => {
  it("returns thin Q (m×n) and R (n×n)", () => {
    const A = make([[1, 2], [3, 4], [5, 6]]); // 3×2
    const { Q, R } = qr(A);
    expect(Q.rows).toBe(3);
    expect(Q.cols).toBe(2);
    expect(R.rows).toBe(2);
    expect(R.cols).toBe(2);
  });

  it("throws RangeError when m < n (underdetermined shape)", () => {
    expect(() => qr(make([[1, 2, 3], [4, 5, 6]]))).toThrow(RangeError);
  });
});

describe("qr reconstruction Q·R = A", () => {
  it("square 2×2", () => {
    const A = make([[4, 3], [6, 3]]);
    const { Q, R } = qr(A);
    approxEqualMatrix(mul(Q, R), A);
  });

  it("square 3×3", () => {
    const A = make([[12, -51, 4], [6, 167, -68], [-4, 24, -41]]);
    const { Q, R } = qr(A);
    approxEqualMatrix(mul(Q, R), A);
  });

  it("tall 4×2", () => {
    const A = make([[1, -1], [1, 4], [1, -1], [1, 4]]);
    const { Q, R } = qr(A);
    approxEqualMatrix(mul(Q, R), A);
  });

  it("tall 5×3 with mixed signs", () => {
    const A = make([
      [2, -1, 0],
      [-1, 2, -1],
      [0, -1, 2],
      [1, 1, 1],
      [-2, 3, 4],
    ]);
    const { Q, R } = qr(A);
    approxEqualMatrix(mul(Q, R), A);
  });
});

describe("qr orthonormality QᵀQ = I", () => {
  it("square case", () => {
    const A = make([[12, -51, 4], [6, 167, -68], [-4, 24, -41]]);
    const { Q } = qr(A);
    approxEqualMatrix(mul(transpose(Q), Q), identity(3));
  });

  it("tall case (columns orthonormal, not full orthogonal)", () => {
    const A = make([[1, -1], [1, 4], [1, -1], [1, 4]]);
    const { Q } = qr(A);
    approxEqualMatrix(mul(transpose(Q), Q), identity(2));
  });

  it("columns each have unit norm", () => {
    const A = make([[3, 1], [4, 1], [0, 1]]);
    const { Q } = qr(A);
    for (let c = 0; c < Q.cols; c++) {
      let nrm = 0;
      for (let r = 0; r < Q.rows; r++) nrm += Q.data[r][c] * Q.data[r][c];
      expect(Math.sqrt(nrm)).toBeCloseTo(1, 9);
    }
  });
});

describe("qr R is upper-triangular", () => {
  it("sub-diagonal entries are exactly zero", () => {
    const A = make([
      [2, -1, 0],
      [-1, 2, -1],
      [0, -1, 2],
      [1, 1, 1],
    ]);
    const { R } = qr(A);
    for (let r = 0; r < R.rows; r++) {
      for (let c = 0; c < r; c++) expect(R.data[r][c]).toBe(0);
    }
  });
});

describe("qr known fixtures", () => {
  it("3×3 Wikipedia fixture: R diagonal magnitudes match hand value", () => {
    // Classic Householder example A = [[12,-51,4],[6,167,-68],[-4,24,-41]].
    // First reflector maps column 1 to [±14,0,0]ᵀ → |R00| = 14 exactly.
    const A = make([[12, -51, 4], [6, 167, -68], [-4, 24, -41]]);
    const { R } = qr(A);
    expect(Math.abs(R.data[0][0])).toBeCloseTo(14, 9);
    expect(Math.abs(R.data[1][1])).toBeCloseTo(175, 9);
    expect(Math.abs(R.data[2][2])).toBeCloseTo(35, 9);
  });

  it("column norm is preserved: |R00| = ‖first column of A‖", () => {
    const A = make([[3, 5], [4, 6], [0, 7]]); // ‖[3,4,0]‖ = 5
    const { R } = qr(A);
    expect(Math.abs(R.data[0][0])).toBeCloseTo(5, 9);
  });
});

describe("qr sanity inputs", () => {
  it("identity input gives Q=±I, R=±I with Q·R = I", () => {
    const { Q, R } = qr(identity(4));
    approxEqualMatrix(mul(Q, R), identity(4));
    approxEqualMatrix(mul(transpose(Q), Q), identity(4));
  });

  it("orthogonal input: R is diagonal ±1, Q·R reconstructs", () => {
    // A rotation matrix is already orthogonal; QR should reconstruct it.
    const t = Math.PI / 5;
    const A = make([[Math.cos(t), -Math.sin(t)], [Math.sin(t), Math.cos(t)]]);
    const { Q, R } = qr(A);
    approxEqualMatrix(mul(Q, R), A);
    approxEqualMatrix(mul(transpose(Q), Q), identity(2));
  });
});
