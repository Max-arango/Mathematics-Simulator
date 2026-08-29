import { describe, it, expect } from "vitest";
import { eigSymmetric } from "./eigen.ts";
import { make, mul, transpose, identity, scale, zeros, type Matrix } from "./matrix.ts";

const approxEqualMatrix = (a: Matrix, b: Matrix, digits = 8): void => {
  expect(a.rows).toBe(b.rows);
  expect(a.cols).toBe(b.cols);
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < a.cols; c++) expect(a.data[r][c]).toBeCloseTo(b.data[r][c], digits);
  }
};

// Column j of V as a plain vector.
const col = (V: Matrix, j: number): number[] => V.data.map((row) => row[j]);

// diag(values) as a Matrix.
const diag = (values: number[]): Matrix => {
  const D = zeros(values.length, values.length);
  values.forEach((v, i) => (D.data[i][i] = v));
  return D;
};

describe("eigSymmetric diagonal matrices", () => {
  it("eigenvalues equal the diagonal (sorted descending)", () => {
    const e = eigSymmetric(make([[2, 0, 0], [0, 5, 0], [0, 0, 1]]));
    expect(e).not.toBeNull();
    if (e) expect(e.values.map((v) => Math.round(v))).toEqual([5, 2, 1]);
  });

  it("eigenvectors of a diagonal matrix are ± the standard basis", () => {
    const e = eigSymmetric(make([[7, 0], [0, 3]]));
    expect(e).not.toBeNull();
    if (e) {
      // values [7,3]; columns must be ±e1, ±e2 respectively.
      for (let j = 0; j < 2; j++) {
        const v = col(e.vectors, j);
        expect(Math.abs(v[j])).toBeCloseTo(1, 8);
        expect(Math.abs(v[1 - j])).toBeCloseTo(0, 8);
      }
    }
  });

  it("1×1 matrix returns the scalar and [[1]]", () => {
    const e = eigSymmetric(make([[42]]));
    expect(e).not.toBeNull();
    if (e) {
      expect(e.values[0]).toBeCloseTo(42, 8);
      expect(Math.abs(e.vectors.data[0][0])).toBeCloseTo(1, 8);
    }
  });
});

describe("eigSymmetric known 2×2 fixture", () => {
  // [[2,1],[1,2]] has eigenvalues 3 (v=[1,1]/√2) and 1 (v=[1,-1]/√2).
  const A = make([[2, 1], [1, 2]]);

  it("eigenvalues are 3 and 1", () => {
    const e = eigSymmetric(A);
    expect(e).not.toBeNull();
    if (e) {
      expect(e.values[0]).toBeCloseTo(3, 8);
      expect(e.values[1]).toBeCloseTo(1, 8);
    }
  });

  it("eigenvectors match hand values up to sign", () => {
    const e = eigSymmetric(A);
    expect(e).not.toBeNull();
    if (e) {
      const s = 1 / Math.sqrt(2);
      const v0 = col(e.vectors, 0);
      const v1 = col(e.vectors, 1);
      // v0 ∝ [1,1]: components equal in magnitude and sign.
      expect(Math.abs(v0[0])).toBeCloseTo(s, 8);
      expect(v0[0]).toBeCloseTo(v0[1], 8);
      // v1 ∝ [1,-1]: components equal in magnitude, opposite sign.
      expect(Math.abs(v1[0])).toBeCloseTo(s, 8);
      expect(v1[0]).toBeCloseTo(-v1[1], 8);
    }
  });
});

describe("eigSymmetric eigen-relation A·v = λ·v", () => {
  const cases: Matrix[] = [
    make([[2, 1], [1, 2]]),
    make([[4, 1, -2], [1, 2, 0], [-2, 0, 3]]),
    make([[6, -2, 0, 0], [-2, 5, -1, 0], [0, -1, 4, -1], [0, 0, -1, 3]]),
  ];
  cases.forEach((A, ci) => {
    it(`A·v ≈ λ·v for every returned pair (case ${ci})`, () => {
      const e = eigSymmetric(A);
      expect(e).not.toBeNull();
      if (e) {
        for (let j = 0; j < A.rows; j++) {
          const v = col(e.vectors, j);
          const Av = A.data.map((row) => row.reduce((acc, aij, k) => acc + aij * v[k], 0));
          const lv = v.map((x) => e.values[j] * x);
          for (let i = 0; i < A.rows; i++) expect(Av[i]).toBeCloseTo(lv[i], 8);
        }
      }
    });
  });
});

describe("eigSymmetric orthonormality VᵀV ≈ I", () => {
  const cases: Matrix[] = [
    make([[2, 1], [1, 2]]),
    make([[4, 1, -2], [1, 2, 0], [-2, 0, 3]]),
    make([[6, -2, 0, 0], [-2, 5, -1, 0], [0, -1, 4, -1], [0, 0, -1, 3]]),
  ];
  cases.forEach((A, ci) => {
    it(`orthonormal eigenvector columns (case ${ci})`, () => {
      const e = eigSymmetric(A);
      expect(e).not.toBeNull();
      if (e) approxEqualMatrix(mul(transpose(e.vectors), e.vectors), identity(A.rows));
    });
  });
});

describe("eigSymmetric reconstruction V·diag(λ)·Vᵀ ≈ A", () => {
  const cases: Matrix[] = [
    make([[2, 1], [1, 2]]),
    make([[4, 1, -2], [1, 2, 0], [-2, 0, 3]]),
    make([[6, -2, 0, 0], [-2, 5, -1, 0], [0, -1, 4, -1], [0, 0, -1, 3]]),
  ];
  cases.forEach((A, ci) => {
    it(`reconstructs A (case ${ci})`, () => {
      const e = eigSymmetric(A);
      expect(e).not.toBeNull();
      if (e) {
        const recon = mul(mul(e.vectors, diag(e.values)), transpose(e.vectors));
        approxEqualMatrix(recon, A);
      }
    });
  });
});

describe("eigSymmetric trace = Σλ and det = Πλ", () => {
  it("3×3: trace and determinant match the spectrum", () => {
    const A = make([[4, 1, -2], [1, 2, 0], [-2, 0, 3]]);
    const e = eigSymmetric(A);
    expect(e).not.toBeNull();
    if (e) {
      const sum = e.values.reduce((s, v) => s + v, 0);
      const prod = e.values.reduce((p, v) => p * v, 1);
      // trace = 4+2+3 = 9; det computed by hand / cofactor = 4(6)−1(3)−2(4) = 13.
      expect(sum).toBeCloseTo(9, 8);
      expect(prod).toBeCloseTo(13, 8);
    }
  });
});

describe("eigSymmetric descending order", () => {
  it("values come back sorted descending", () => {
    const e = eigSymmetric(make([[4, 1, -2], [1, 2, 0], [-2, 0, 3]]));
    expect(e).not.toBeNull();
    if (e) {
      for (let i = 1; i < e.values.length; i++) {
        expect(e.values[i - 1]).toBeGreaterThanOrEqual(e.values[i] - 1e-12);
      }
    }
  });
});

describe("eigSymmetric repeated eigenvalues", () => {
  it("2·I → eigenvalue 2 (multiplicity 3) with orthonormal vectors", () => {
    const A = scale(identity(3), 2);
    const e = eigSymmetric(A);
    expect(e).not.toBeNull();
    if (e) {
      e.values.forEach((v) => expect(v).toBeCloseTo(2, 8));
      approxEqualMatrix(mul(transpose(e.vectors), e.vectors), identity(3));
    }
  });

  it("double eigenvalue: [[2,0,0],[0,3,0],[0,0,3]] reconstructs with orthonormal basis", () => {
    const A = make([[2, 0, 0], [0, 3, 0], [0, 0, 3]]);
    const e = eigSymmetric(A);
    expect(e).not.toBeNull();
    if (e) {
      const vals = [...e.values].sort((x, y) => x - y);
      expect(vals[0]).toBeCloseTo(2, 8);
      expect(vals[1]).toBeCloseTo(3, 8);
      expect(vals[2]).toBeCloseTo(3, 8);
      approxEqualMatrix(mul(transpose(e.vectors), e.vectors), identity(3));
      const recon = mul(mul(e.vectors, diag(e.values)), transpose(e.vectors));
      approxEqualMatrix(recon, A);
    }
  });
});

describe("eigSymmetric preconditions throw", () => {
  it("non-square throws RangeError", () => {
    expect(() => eigSymmetric(make([[1, 2, 3], [4, 5, 6]]))).toThrow(RangeError);
  });

  it("grossly non-symmetric throws RangeError", () => {
    expect(() => eigSymmetric(make([[1, 2], [3, 4]]))).toThrow(RangeError);
  });
});
