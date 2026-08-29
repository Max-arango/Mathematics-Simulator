import { describe, it, expect } from "vitest";
import { eigSymmetric, eigen } from "./eigen.ts";
import { make, mul, transpose, identity, scale, zeros, trace, determinant, type Matrix } from "./matrix.ts";
import { abs, type Complex } from "../complex/complex.ts";

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

// --- general (non-symmetric / complex-spectrum) eigen() -----------------------------

// Multiset of real parts, ascending, for order-agnostic comparison.
const realsAsc = (vs: Complex[]): number[] => vs.map((z) => z.re).sort((x, y) => x - y);

describe("eigen diagonal & triangular", () => {
  it("3×3 diagonal → eigenvalues equal the diagonal", () => {
    const e = eigen(make([[2, 0, 0], [0, 5, 0], [0, 0, 1]]));
    expect(e.converged).toBe(true);
    expect(realsAsc(e.values)).toEqual([1, 2, 5].map((x) => x));
    e.values.forEach((z) => expect(z.im).toBeCloseTo(0, 9));
  });

  it("3×3 upper-triangular → eigenvalues equal the diagonal", () => {
    const e = eigen(make([[3, 1, 2], [0, 2, 4], [0, 0, 1]]));
    expect(e.converged).toBe(true);
    const r = realsAsc(e.values);
    expect(r[0]).toBeCloseTo(1, 8);
    expect(r[1]).toBeCloseTo(2, 8);
    expect(r[2]).toBeCloseTo(3, 8);
  });

  it("2×2 diagonal (analytic path) → real eigenvalues", () => {
    const e = eigen(make([[7, 0], [0, 3]]));
    expect(e.values[0].re).toBeCloseTo(7, 12);
    expect(e.values[1].re).toBeCloseTo(3, 12);
    expect(e.diagonalizable).toBe(true);
  });
});

describe("eigen cross-check vs eigSymmetric", () => {
  it("symmetric 2×2 [[2,0],[0,3]] agrees with the symmetric solver", () => {
    const A = make([[2, 0], [0, 3]]);
    const g = eigen(A);
    const s = eigSymmetric(A);
    expect(s).not.toBeNull();
    if (s) {
      // both sorted descending by value
      expect(g.values[0].re).toBeCloseTo(s.values[0], 10);
      expect(g.values[1].re).toBeCloseTo(s.values[1], 10);
    }
  });
});

describe("eigen complex spectrum", () => {
  it("rotation [[0,-1],[1,0]] → ±i", () => {
    const e = eigen(make([[0, -1], [1, 0]]));
    expect(e.values[0].re).toBeCloseTo(0, 10);
    expect(e.values[1].re).toBeCloseTo(0, 10);
    expect(Math.abs(e.values[0].im)).toBeCloseTo(1, 10);
    expect(Math.abs(e.values[1].im)).toBeCloseTo(1, 10);
    // conjugate pair: +i listed first by the documented tie-break
    expect(e.values[0].im).toBeCloseTo(1, 10);
    expect(e.values[1].im).toBeCloseTo(-1, 10);
    // complex ⇒ no real eigenvectors, with a warning
    expect(e.vectors[0]).toBeNull();
    expect(e.vectors[1]).toBeNull();
    expect(e.warnings.some((w) => w.includes("complex"))).toBe(true);
  });

  it("rotation-scaling [[1,-1],[1,1]] → 1±i (modulus √2, arg π/4)", () => {
    const e = eigen(make([[1, -1], [1, 1]]));
    e.values.forEach((z) => {
      expect(z.re).toBeCloseTo(1, 10);
      expect(Math.abs(z.im)).toBeCloseTo(1, 10);
      expect(abs(z)).toBeCloseTo(Math.SQRT2, 10);
    });
    expect(Math.abs(Math.atan2(e.values[0].im, e.values[0].re))).toBeCloseTo(Math.PI / 4, 10);
    // distinct (conjugate) spectrum ⇒ diagonalizable over ℂ
    expect(e.diagonalizable).toBe(true);
  });

  it("3×3 companion of (x-2)(x²+1) → {2, ±i}", () => {
    const e = eigen(make([[2, -1, 2], [1, 0, 0], [0, 1, 0]]));
    expect(e.converged).toBe(true);
    // one real eigenvalue ≈ 2 (largest modulus), then ±i
    expect(e.values[0].re).toBeCloseTo(2, 6);
    expect(e.values[0].im).toBeCloseTo(0, 6);
    expect(e.values[1].im).toBeCloseTo(1, 6);
    expect(e.values[2].im).toBeCloseTo(-1, 6);
    expect(Math.abs(e.values[1].re)).toBeCloseTo(0, 6);
  });
});

describe("eigen known real spectrum {1,2,3}", () => {
  // companion matrix of (x-1)(x-2)(x-3) = x³ - 6x² + 11x - 6
  const A = make([[6, -11, 6], [1, 0, 0], [0, 1, 0]]);
  it("recovers {1,2,3} to ~6 digits", () => {
    const e = eigen(A);
    expect(e.converged).toBe(true);
    const r = realsAsc(e.values);
    expect(r[0]).toBeCloseTo(1, 6);
    expect(r[1]).toBeCloseTo(2, 6);
    expect(r[2]).toBeCloseTo(3, 6);
    e.values.forEach((z) => expect(z.im).toBeCloseTo(0, 6));
    expect(e.diagonalizable).toBe(true);
  });

  it("eigenvector property A·v ≈ λ·v for each real simple eigenvalue", () => {
    const e = eigen(A);
    e.values.forEach((z, j) => {
      const v = e.vectors[j];
      expect(v).not.toBeNull();
      if (v) {
        const Av = A.data.map((rowk) => rowk.reduce((acc, aij, k) => acc + aij * v[k], 0));
        for (let i = 0; i < A.rows; i++) expect(Av[i]).toBeCloseTo(z.re * v[i], 6);
      }
    });
  });
});

describe("eigen defective (Jordan block)", () => {
  const A = make([[2, 1], [0, 2]]);
  it("algebraic 2 / geometric 1, not diagonalizable, one honest eigenvector", () => {
    const e = eigen(A);
    expect(e.values[0].re).toBeCloseTo(2, 12);
    expect(e.values[1].re).toBeCloseTo(2, 12);
    expect(e.algebraicMultiplicity).toEqual([2]);
    expect(e.geometricMultiplicity).toEqual([1]);
    expect(e.diagonalizable).toBe(false);
    expect(e.warnings.some((w) => w.includes("defective"))).toBe(true);
    // exactly one real eigenvector returned; the surplus copy is null
    const nonNull = e.vectors.filter((v) => v !== null);
    expect(nonNull.length).toBe(1);
    const v = nonNull[0]!;
    const Av = A.data.map((rowk) => rowk.reduce((acc, aij, k) => acc + aij * v[k], 0));
    expect(Av[0]).toBeCloseTo(2 * v[0], 10);
    expect(Av[1]).toBeCloseTo(2 * v[1], 10);
  });
});

describe("eigen non-defective repeated eigenvalue", () => {
  it("diag(2,2,5): algebraic 2 / geometric 2 for λ=2, diagonalizable", () => {
    const e = eigen(make([[2, 0, 0], [0, 2, 0], [0, 0, 5]]));
    // distinct eigenvalues in descending-|value| order: 5 (alg 1), 2 (alg 2)
    expect(e.algebraicMultiplicity).toEqual([1, 2]);
    expect(e.geometricMultiplicity).toEqual([1, 2]);
    expect(e.diagonalizable).toBe(true);
  });
});

describe("eigen trace/determinant sanity (4×4, forces Hessenberg)", () => {
  const A = make([
    [4, 1, 0, 2],
    [1, 3, 1, 0],
    [0, 1, 2, 1],
    [2, 0, 1, 1],
  ]);
  it("Σ Re(λ) ≈ trace and Π λ ≈ det", () => {
    const e = eigen(A);
    expect(e.converged).toBe(true);
    const sumRe = e.values.reduce((sacc, z) => sacc + z.re, 0);
    expect(sumRe).toBeCloseTo(trace(A), 8);
    // product of all eigenvalues (complex) — its real part is det, imaginary part ≈ 0
    let prodRe = 1;
    let prodIm = 0;
    for (const z of e.values) {
      const nr = prodRe * z.re - prodIm * z.im;
      const ni = prodRe * z.im + prodIm * z.re;
      prodRe = nr;
      prodIm = ni;
    }
    expect(prodRe).toBeCloseTo(determinant(A), 6);
    expect(prodIm).toBeCloseTo(0, 6);
  });
});

describe("eigen ordering, scalar & preconditions", () => {
  it("values are sorted by descending |value|", () => {
    const e = eigen(make([[6, -11, 6], [1, 0, 0], [0, 1, 0]]));
    for (let i = 1; i < e.values.length; i++) {
      expect(abs(e.values[i - 1])).toBeGreaterThanOrEqual(abs(e.values[i]) - 1e-9);
    }
  });

  it("1×1 matrix returns the scalar as a real eigenvalue with eigenvector [±1]", () => {
    const e = eigen(make([[42]]));
    expect(e.values[0].re).toBeCloseTo(42, 12);
    expect(e.values[0].im).toBeCloseTo(0, 12);
    expect(e.vectors[0]).not.toBeNull();
    if (e.vectors[0]) expect(Math.abs(e.vectors[0][0])).toBeCloseTo(1, 12);
    expect(e.diagonalizable).toBe(true);
  });

  it("non-square throws RangeError", () => {
    expect(() => eigen(make([[1, 2, 3], [4, 5, 6]]))).toThrow(RangeError);
  });
});
