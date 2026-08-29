import { describe, it, expect } from "vitest";
import {
  make, zeros, identity, get, set, dims,
  add, sub, scale, mul, transpose, trace,
  lu, determinant, inverse, rank, solve,
  type Matrix,
} from "./matrix.ts";

const approxEqual = (a: Matrix, b: Matrix, digits = 9): void => {
  expect(a.rows).toBe(b.rows);
  expect(a.cols).toBe(b.cols);
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < a.cols; c++) expect(a.data[r][c]).toBeCloseTo(b.data[r][c], digits);
  }
};

describe("matrix construction", () => {
  it("make validates rectangularity", () => {
    expect(make([[1, 2], [3, 4]]).cols).toBe(2);
    expect(() => make([[1, 2], [3]])).toThrow(RangeError);
    expect(() => make([])).toThrow(RangeError);
  });

  it("make copies input (no aliasing)", () => {
    const src = [[1, 2], [3, 4]];
    const m = make(src);
    src[0][0] = 99;
    expect(m.data[0][0]).toBe(1);
  });

  it("zeros and identity", () => {
    expect(zeros(2, 3).data).toEqual([[0, 0, 0], [0, 0, 0]]);
    expect(identity(3).data).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  });

  it("get/set/dims", () => {
    const m = zeros(2, 2);
    set(m, 0, 1, 7);
    expect(get(m, 0, 1)).toBe(7);
    expect(dims(m)).toEqual({ rows: 2, cols: 2 });
  });
});

describe("matrix arithmetic", () => {
  const A = make([[1, 2], [3, 4]]);
  const B = make([[5, 6], [7, 8]]);

  it("add/sub", () => {
    expect(add(A, B).data).toEqual([[6, 8], [10, 12]]);
    expect(sub(B, A).data).toEqual([[4, 4], [4, 4]]);
  });

  it("add/sub reject dimension mismatch", () => {
    expect(() => add(A, zeros(2, 3))).toThrow(RangeError);
  });

  it("scale", () => {
    expect(scale(A, 2).data).toEqual([[2, 4], [6, 8]]);
  });

  it("mul computes the product", () => {
    expect(mul(A, B).data).toEqual([[19, 22], [43, 50]]);
  });

  it("mul validates inner dimensions", () => {
    expect(() => mul(A, zeros(3, 2))).toThrow(RangeError);
  });

  it("mul of non-square conformable matrices", () => {
    const m23 = make([[1, 2, 3], [4, 5, 6]]);
    const m32 = make([[7, 8], [9, 10], [11, 12]]);
    expect(mul(m23, m32).data).toEqual([[58, 64], [139, 154]]);
  });

  it("A·I = A", () => {
    approxEqual(mul(A, identity(2)), A);
    approxEqual(mul(identity(2), A), A);
  });
});

describe("transpose / trace", () => {
  it("transpose", () => {
    expect(transpose(make([[1, 2, 3], [4, 5, 6]])).data).toEqual([[1, 4], [2, 5], [3, 6]]);
  });

  it("transpose is involutive: (Aᵀ)ᵀ = A", () => {
    const A = make([[1, 2, 3], [4, 5, 6]]);
    approxEqual(transpose(transpose(A)), A);
  });

  it("(AB)ᵀ = BᵀAᵀ", () => {
    const A = make([[1, 2], [3, 4], [5, 6]]);
    const B = make([[7, 8, 9], [10, 11, 12]]);
    approxEqual(transpose(mul(A, B)), mul(transpose(B), transpose(A)));
  });

  it("trace sums the diagonal", () => {
    expect(trace(make([[1, 2], [3, 4]]))).toBe(5);
  });

  it("trace requires square", () => {
    expect(() => trace(make([[1, 2, 3]]))).toThrow(RangeError);
  });
});

describe("associativity", () => {
  it("(AB)C = A(BC) within tolerance", () => {
    const A = make([[1, 2], [3, 4]]);
    const B = make([[0.5, 1], [-2, 3]]);
    const C = make([[2, -1], [1, 1]]);
    approxEqual(mul(mul(A, B), C), mul(A, mul(B, C)));
  });
});

describe("LU decomposition", () => {
  it("P·A = L·U", () => {
    const A = make([[2, 1, 1], [4, 3, 3], [8, 7, 9]]);
    const dec = lu(A);
    expect(dec).not.toBeNull();
    if (dec) approxEqual(mul(dec.P, A), mul(dec.L, dec.U));
  });

  it("L is unit lower-triangular, U is upper-triangular", () => {
    const A = make([[4, 3], [6, 3]]);
    const dec = lu(A);
    expect(dec).not.toBeNull();
    if (dec) {
      expect(dec.L.data[0][1]).toBe(0);
      expect(dec.L.data[0][0]).toBe(1);
      expect(dec.L.data[1][1]).toBe(1);
      expect(dec.U.data[1][0]).toBe(0);
    }
  });

  it("returns null for singular matrix", () => {
    expect(lu(make([[1, 2], [2, 4]]))).toBeNull();
  });

  it("lu requires square", () => {
    expect(() => lu(make([[1, 2, 3]]))).toThrow(RangeError);
  });
});

describe("determinant", () => {
  it("det(I) = 1", () => {
    expect(determinant(identity(4))).toBeCloseTo(1, 12);
  });

  it("known 2×2 matches hand value", () => {
    expect(determinant(make([[1, 2], [3, 4]]))).toBeCloseTo(-2, 9);
  });

  it("known 3×3 matches hand value", () => {
    // det = 6*(−2*..): compute by hand → -306
    expect(determinant(make([[6, 1, 1], [4, -2, 5], [2, 8, 7]]))).toBeCloseTo(-306, 9);
  });

  it("singular matrix has determinant 0", () => {
    expect(determinant(make([[1, 2], [2, 4]]))).toBe(0);
  });

  it("det(AB) = det(A)·det(B) within tolerance", () => {
    const A = make([[1, 2], [3, 5]]);
    const B = make([[2, 0], [1, 3]]);
    expect(determinant(mul(A, B))).toBeCloseTo(determinant(A) * determinant(B), 9);
  });
});

describe("inverse", () => {
  it("A·A⁻¹ ≈ I for an invertible matrix", () => {
    const A = make([[4, 7], [2, 6]]);
    const inv = inverse(A);
    expect(inv).not.toBeNull();
    if (inv) approxEqual(mul(A, inv), identity(2));
  });

  it("inverse of 3×3 round-trips to I", () => {
    const A = make([[2, 1, 1], [1, 3, 2], [1, 0, 0]]);
    const inv = inverse(A);
    expect(inv).not.toBeNull();
    if (inv) {
      approxEqual(mul(A, inv), identity(3));
      approxEqual(mul(inv, A), identity(3));
    }
  });

  it("inverse of a known 2×2", () => {
    const inv = inverse(make([[4, 7], [2, 6]]));
    expect(inv).not.toBeNull();
    if (inv) approxEqual(inv, make([[0.6, -0.7], [-0.2, 0.4]]));
  });

  it("inverse of singular matrix is null", () => {
    expect(inverse(make([[1, 2], [2, 4]]))).toBeNull();
  });

  it("inverse of identity is identity", () => {
    const inv = inverse(identity(3));
    expect(inv).not.toBeNull();
    if (inv) approxEqual(inv, identity(3));
  });
});

describe("rank", () => {
  it("full-rank matrix", () => {
    expect(rank(make([[1, 0], [0, 1]]))).toBe(2);
  });

  it("rank-deficient [[1,2],[2,4]] = 1", () => {
    expect(rank(make([[1, 2], [2, 4]]))).toBe(1);
  });

  it("zero matrix has rank 0", () => {
    expect(rank(zeros(3, 3))).toBe(0);
  });

  it("non-square rank (rows < cols)", () => {
    expect(rank(make([[1, 2, 3], [4, 5, 6]]))).toBe(2);
  });

  it("rank bounded by min(rows,cols) for dependent rows", () => {
    expect(rank(make([[1, 2, 3], [2, 4, 6], [3, 6, 9]]))).toBe(1);
  });
});

describe("solve", () => {
  it("solves Ax = b and A·x ≈ b", () => {
    const A = make([[3, 2], [1, 2]]);
    const b = [5, 5];
    const x = solve(A, b);
    expect(x).not.toBeNull();
    if (x) {
      const Ax = mul(A, make([[x[0]], [x[1]]]));
      expect(Ax.data[0][0]).toBeCloseTo(b[0], 9);
      expect(Ax.data[1][0]).toBeCloseTo(b[1], 9);
    }
  });

  it("solves a 3×3 system, verifies residual", () => {
    const A = make([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]]);
    const b = [8, -11, -3];
    const x = solve(A, b);
    expect(x).not.toBeNull();
    if (x) {
      expect(x[0]).toBeCloseTo(2, 9);
      expect(x[1]).toBeCloseTo(3, 9);
      expect(x[2]).toBeCloseTo(-1, 9);
    }
  });

  it("returns null for singular system", () => {
    expect(solve(make([[1, 2], [2, 4]]), [1, 2])).toBeNull();
  });

  it("throws on mismatched b length", () => {
    expect(() => solve(make([[1, 2], [3, 4]]), [1, 2, 3])).toThrow(RangeError);
  });
});
