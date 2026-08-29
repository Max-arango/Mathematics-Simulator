import { describe, it, expect } from "vitest";
import { leastSquares } from "./leastSquares.ts";
import { make } from "./matrix.ts";
import { dot } from "./vector.ts";

describe("leastSquares regression fixtures", () => {
  it("line fit y = a + b·x matches hand-computed a=3.5, b=1.4", () => {
    // Points (1,6),(2,5),(3,7),(4,10); classic ordinary-least-squares line.
    const A = make([[1, 1], [1, 2], [1, 3], [1, 4]]);
    const b = [6, 5, 7, 10];
    const out = leastSquares(A, b);
    expect(out).not.toBeNull();
    if (out) {
      expect(out.x[0]).toBeCloseTo(3.5, 9); // intercept
      expect(out.x[1]).toBeCloseTo(1.4, 9); // slope
      expect(out.rank).toBe(2);
    }
  });

  it("residualNorm for that fit equals the hand value √1.2", () => {
    const A = make([[1, 1], [1, 2], [1, 3], [1, 4]]);
    const b = [6, 5, 7, 10];
    const out = leastSquares(A, b);
    expect(out).not.toBeNull();
    // fitted y = [4.9, 6.3, 7.7, 9.1]; residuals [1.1,-1.3,-0.7,0.9]; Σr² = 4.2 ... verify below
    if (out) expect(out.residualNorm).toBeCloseTo(Math.sqrt(1.1 ** 2 + 1.3 ** 2 + 0.7 ** 2 + 0.9 ** 2), 9);
  });
});

describe("leastSquares exact-fit case", () => {
  it("collinear data → residualNorm ≈ 0 and exact coefficients", () => {
    // y = 1 + 2x exactly at x = 0,1,2,3.
    const A = make([[1, 0], [1, 1], [1, 2], [1, 3]]);
    const b = [1, 3, 5, 7];
    const out = leastSquares(A, b);
    expect(out).not.toBeNull();
    if (out) {
      expect(out.x[0]).toBeCloseTo(1, 9);
      expect(out.x[1]).toBeCloseTo(2, 9);
      expect(out.residualNorm).toBeCloseTo(0, 9);
    }
  });

  it("square full-rank system solves exactly (residual ≈ 0)", () => {
    const A = make([[3, 2], [1, 2]]);
    const b = [5, 5];
    const out = leastSquares(A, b);
    expect(out).not.toBeNull();
    if (out) {
      // matches matrix.solve on the same system: x = [0, 2.5]
      expect(out.x[0]).toBeCloseTo(0, 9);
      expect(out.x[1]).toBeCloseTo(2.5, 9);
      expect(out.residualNorm).toBeCloseTo(0, 9);
    }
  });
});

describe("leastSquares normal-equation property Aᵀ·r ≈ 0", () => {
  it("residual is orthogonal to every column of A (4×2)", () => {
    const A = make([[1, 1], [1, 2], [1, 3], [1, 4]]);
    const b = [6, 5, 7, 10];
    const out = leastSquares(A, b);
    expect(out).not.toBeNull();
    if (out) {
      for (let j = 0; j < A.cols; j++) {
        const col = A.data.map((row) => row[j]);
        expect(dot(col, out.residual)).toBeCloseTo(0, 7);
      }
    }
  });

  it("residual orthogonal to column space (5×3 overdetermined)", () => {
    const A = make([
      [1, 0, 0],
      [1, 1, 1],
      [1, 2, 4],
      [1, 3, 9],
      [1, 4, 16],
    ]); // quadratic design matrix
    const b = [1.2, 0.9, 2.1, 5.2, 9.9];
    const out = leastSquares(A, b);
    expect(out).not.toBeNull();
    if (out) {
      expect(out.rank).toBe(3);
      for (let j = 0; j < A.cols; j++) {
        const col = A.data.map((row) => row[j]);
        expect(dot(col, out.residual)).toBeCloseTo(0, 6);
      }
    }
  });
});

describe("leastSquares residual definition", () => {
  it("residual equals A·x − b componentwise", () => {
    const A = make([[2, 0], [0, 1], [1, 1]]);
    const b = [1, 2, 4];
    const out = leastSquares(A, b);
    expect(out).not.toBeNull();
    if (out) {
      for (let i = 0; i < A.rows; i++) {
        const ax = A.data[i][0] * out.x[0] + A.data[i][1] * out.x[1];
        expect(out.residual[i]).toBeCloseTo(ax - b[i], 9);
      }
    }
  });
});

describe("leastSquares failure model", () => {
  it("rank-deficient A returns null", () => {
    // Column 2 = 2·column 1 → rank 1 < 2.
    const A = make([[1, 2], [2, 4], [3, 6]]);
    const b = [1, 2, 3];
    expect(leastSquares(A, b)).toBeNull();
  });

  it("dimension mismatch throws RangeError", () => {
    const A = make([[1, 1], [1, 2], [1, 3]]);
    expect(() => leastSquares(A, [1, 2])).toThrow(RangeError);
  });

  it("underdetermined (m < n) throws RangeError via qr", () => {
    const A = make([[1, 2, 3], [4, 5, 6]]);
    expect(() => leastSquares(A, [1, 2])).toThrow(RangeError);
  });
});
