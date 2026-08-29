import { describe, it, expect } from "vitest";
import { svd } from "./svd.ts";
import { eigSymmetric } from "./eigen.ts";
import { make, mul, transpose, identity, zeros, type Matrix } from "./matrix.ts";

const approxEqualMatrix = (a: Matrix, b: Matrix, digits = 8): void => {
  expect(a.rows).toBe(b.rows);
  expect(a.cols).toBe(b.cols);
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < a.cols; c++) expect(a.data[r][c]).toBeCloseTo(b.data[r][c], digits);
  }
};

const diag = (s: number[]): Matrix => {
  const D = zeros(s.length, s.length);
  s.forEach((v, i) => (D.data[i][i] = v));
  return D;
};

const reconstruct = (U: Matrix, S: number[], V: Matrix): Matrix =>
  mul(mul(U, diag(S)), transpose(V));

// Deterministic pseudo-random matrices (LCG) so "random" cases are reproducible.
const rng = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const randMatrix = (rows: number, cols: number, seed: number): Matrix => {
  const g = rng(seed);
  return make(Array.from({ length: rows }, () => Array.from({ length: cols }, () => g() * 4 - 2)));
};

describe("svd reconstruction U·diag(S)·Vᵀ ≈ A", () => {
  const cases: Array<[string, Matrix]> = [
    ["square 2×2", make([[1, 2], [3, 4]])],
    ["square 3×3", make([[1, 2, 3], [4, 5, 6], [7, 8, 10]])],
    ["symmetric 3×3", make([[4, 1, -2], [1, 2, 0], [-2, 0, 3]])],
    ["tall 3×2", make([[1, 2], [3, 4], [5, 7]])],
    ["tall 5×3", make([[1, 0, 2], [0, 3, 1], [2, 1, 0], [1, 1, 1], [-1, 2, 3]])],
    ["wide 2×3", make([[1, 2, 3], [4, 5, 7]])],
    ["wide 3×5", make([[1, 0, 2, 1, -1], [0, 3, 1, 1, 2], [2, 1, 0, 1, 3]])],
    ["random 6×3", randMatrix(6, 3, 7)],
    ["random 3×6", randMatrix(3, 6, 11)],
    ["random 4×4", randMatrix(4, 4, 23)],
  ];
  cases.forEach(([name, A]) => {
    it(`reconstructs ${name}`, () => {
      const r = svd(A);
      expect(r).not.toBeNull();
      if (r) approxEqualMatrix(reconstruct(r.U, r.S, r.V), A);
    });
  });
});

describe("svd orthonormal columns UᵀU ≈ I_r and VᵀV ≈ I_r", () => {
  const cases: Array<[string, Matrix]> = [
    ["tall 5×3", make([[1, 0, 2], [0, 3, 1], [2, 1, 0], [1, 1, 1], [-1, 2, 3]])],
    ["wide 3×5", make([[1, 0, 2, 1, -1], [0, 3, 1, 1, 2], [2, 1, 0, 1, 3]])],
    ["square 3×3", make([[1, 2, 3], [4, 5, 6], [7, 8, 10]])],
  ];
  cases.forEach(([name, A]) => {
    it(`orthonormal U and V columns (${name})`, () => {
      const r = svd(A);
      expect(r).not.toBeNull();
      if (r) {
        approxEqualMatrix(mul(transpose(r.U), r.U), identity(r.rank));
        approxEqualMatrix(mul(transpose(r.V), r.V), identity(r.rank));
        expect(r.U.rows).toBe(A.rows);
        expect(r.V.rows).toBe(A.cols);
        expect(r.U.cols).toBe(r.rank);
        expect(r.V.cols).toBe(r.rank);
        expect(r.S.length).toBe(r.rank);
      }
    });
  });
});

describe("svd singular values are ≥ 0 and descending", () => {
  it("random 5×4", () => {
    const r = svd(randMatrix(5, 4, 99));
    expect(r).not.toBeNull();
    if (r) {
      r.S.forEach((s) => expect(s).toBeGreaterThanOrEqual(0));
      for (let i = 1; i < r.S.length; i++) expect(r.S[i - 1]).toBeGreaterThanOrEqual(r.S[i] - 1e-12);
    }
  });
});

describe("svd known fixtures", () => {
  it("diagonal matrix → S = |diagonal| sorted descending", () => {
    const A = make([[3, 0, 0], [0, -5, 0], [0, 0, 2]]);
    const r = svd(A);
    expect(r).not.toBeNull();
    if (r) {
      expect(r.S.length).toBe(3);
      expect(r.S[0]).toBeCloseTo(5, 8);
      expect(r.S[1]).toBeCloseTo(3, 8);
      expect(r.S[2]).toBeCloseTo(2, 8);
    }
  });

  it("hand 2×2 [[0,-2],[1,0]] → S = [2, 1]", () => {
    // AᵀA = [[1,0],[0,4]] → singular values √4, √1 = 2, 1.
    const A = make([[0, -2], [1, 0]]);
    const r = svd(A);
    expect(r).not.toBeNull();
    if (r) {
      expect(r.S[0]).toBeCloseTo(2, 8);
      expect(r.S[1]).toBeCloseTo(1, 8);
      approxEqualMatrix(reconstruct(r.U, r.S, r.V), A);
    }
  });
});

describe("svd rank", () => {
  it("rank-deficient [[1,2],[2,4]] → rank 1", () => {
    const r = svd(make([[1, 2], [2, 4]]));
    expect(r).not.toBeNull();
    if (r) {
      expect(r.rank).toBe(1);
      expect(r.S.length).toBe(1);
      expect(r.S[0]).toBeCloseTo(Math.sqrt(25), 8); // ‖A‖_F = √(1+4+4+16) = 5
      approxEqualMatrix(reconstruct(r.U, r.S, r.V), make([[1, 2], [2, 4]]));
    }
  });

  it("full-rank tall → rank = min(m, n) = n", () => {
    const A = make([[1, 0, 2], [0, 3, 1], [2, 1, 0], [1, 1, 1], [-1, 2, 3]]);
    const r = svd(A);
    expect(r).not.toBeNull();
    if (r) expect(r.rank).toBe(3);
  });

  it("full-rank wide → rank = min(m, n) = m", () => {
    const A = make([[1, 0, 2, 1, -1], [0, 3, 1, 1, 2], [2, 1, 0, 1, 3]]);
    const r = svd(A);
    expect(r).not.toBeNull();
    if (r) expect(r.rank).toBe(3);
  });

  it("rank-2 wide 2×4 (two independent rows) → rank 2", () => {
    const A = make([[1, 2, 3, 4], [2, 0, 1, -1]]);
    const r = svd(A);
    expect(r).not.toBeNull();
    if (r) expect(r.rank).toBe(2);
  });
});

describe("svd cross-validation", () => {
  it("σ_max² ≈ largest eigenvalue of AᵀA (independent eigSymmetric on the OTHER Gram)", () => {
    // Wide A: svd internally uses AAᵀ, so eigendecomposing AᵀA here is independent.
    const A = make([[1, 2, 3, 4], [2, 0, 1, -1], [0, 1, 2, 1]]);
    const r = svd(A);
    const e = eigSymmetric(mul(transpose(A), A));
    expect(r).not.toBeNull();
    expect(e).not.toBeNull();
    if (r && e) expect(r.S[0] * r.S[0]).toBeCloseTo(e.values[0], 6);
  });

  it("σ_max is an upper bound on the gain ‖A·x‖ ≤ σ_max·‖x‖ for sampled x", () => {
    const A = randMatrix(4, 3, 5);
    const r = svd(A);
    expect(r).not.toBeNull();
    if (r) {
      const g = rng(777);
      const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      for (let t = 0; t < 200; t++) {
        const x = Array.from({ length: 3 }, () => g() * 2 - 1);
        const Ax = A.data.map((row) => row.reduce((s, a, k) => s + a * x[k], 0));
        expect(norm(Ax)).toBeLessThanOrEqual(r.S[0] * norm(x) + 1e-9);
      }
    }
  });
});

describe("svd degenerate input", () => {
  it("numerically zero matrix (rank 0) → null (empty thin factors)", () => {
    expect(svd(zeros(3, 2))).toBeNull();
  });
});
