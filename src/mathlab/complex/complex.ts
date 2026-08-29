// First-class complex-scalar arithmetic for the shared math engine. Pure,
// allocation-per-op functions over a plain {re,im} record.
//
// Branch cuts (principal values):
//   log(z)  = ln|z| + i·arg(z),  arg ∈ (−π, π]      → cut along the negative real axis.
//   sqrt(z) = principal square root (arg/2 ∈ (−π/2, π/2]).
//   pow/powReal derive from log, so inherit its cut; pow with a real-integer
//     exponent uses repeated multiplication instead (exact, cut-free).
//   asin/acos/atan use the principal-branch √/log formulas below.

export interface Complex {
  re: number;
  im: number;
}

export const C = (re: number, im = 0): Complex => ({ re, im });

// --- field ops ---
export const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

/** Division; div-by-zero yields NaN components rather than throwing. */
export const div = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return { re: NaN, im: NaN };
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};

export const neg = (z: Complex): Complex => ({ re: -z.re, im: -z.im });
export const conj = (z: Complex): Complex => ({ re: z.re, im: -z.im });
export const scale = (z: Complex, k: number): Complex => ({ re: z.re * k, im: z.im * k });

// --- projections / magnitude ---
export const re = (z: Complex): number => z.re;
export const im = (z: Complex): number => z.im;
export const abs = (z: Complex): number => Math.hypot(z.re, z.im);
export const arg = (z: Complex): number => Math.atan2(z.im, z.re);

export const eq = (a: Complex, b: Complex, tol = 1e-12): boolean =>
  Math.abs(a.re - b.re) <= tol && Math.abs(a.im - b.im) <= tol;

// --- polar ---
export const toPolar = (z: Complex): { r: number; theta: number } => ({ r: abs(z), theta: arg(z) });
export const fromPolar = (r: number, theta: number): Complex => ({
  re: r * Math.cos(theta),
  im: r * Math.sin(theta),
});

// --- exp / log / powers ---
export const exp = (z: Complex): Complex => {
  const e = Math.exp(z.re);
  return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) };
};

/** Principal branch: log(0) = −Infinity + 0i. */
export const log = (z: Complex): Complex => ({ re: Math.log(abs(z)), im: arg(z) });

/** z^p for real p via polar form: r^p·(cos pθ, sin pθ). Principal branch. */
export const powReal = (z: Complex, p: number): Complex => {
  const { r, theta } = toPolar(z);
  const rp = Math.pow(r, p);
  return { re: rp * Math.cos(p * theta), im: rp * Math.sin(p * theta) };
};

/** z^w. Real-integer w uses repeated multiplication (exact); else exp(w·log z). */
export const pow = (z: Complex, w: Complex): Complex => {
  if (w.im === 0 && Number.isInteger(w.re)) {
    let n = w.re;
    if (n === 0) return { re: 1, im: 0 };
    const base = n < 0 ? div({ re: 1, im: 0 }, z) : z;
    n = Math.abs(n);
    let acc: Complex = { re: 1, im: 0 };
    for (let i = 0; i < n; i++) acc = mul(acc, base);
    return acc;
  }
  return exp(mul(w, log(z)));
};

/** Principal square root. */
export const sqrt = (z: Complex): Complex => powReal(z, 0.5);

// --- trig (sin(a+bi) = sin a cosh b + i cos a sinh b, etc.) ---
export const sin = (z: Complex): Complex => ({
  re: Math.sin(z.re) * Math.cosh(z.im),
  im: Math.cos(z.re) * Math.sinh(z.im),
});
export const cos = (z: Complex): Complex => ({
  re: Math.cos(z.re) * Math.cosh(z.im),
  im: -Math.sin(z.re) * Math.sinh(z.im),
});
export const tan = (z: Complex): Complex => div(sin(z), cos(z));

// --- hyperbolic ---
export const sinh = (z: Complex): Complex => ({
  re: Math.sinh(z.re) * Math.cos(z.im),
  im: Math.cosh(z.re) * Math.sin(z.im),
});
export const cosh = (z: Complex): Complex => ({
  re: Math.cosh(z.re) * Math.cos(z.im),
  im: Math.sinh(z.re) * Math.sin(z.im),
});
export const tanh = (z: Complex): Complex => div(sinh(z), cosh(z));

// --- inverse trig (principal branches) ---
const I: Complex = { re: 0, im: 1 };
const ONE: Complex = { re: 1, im: 0 };

/** atan(z) = (i/2)(log(1−iz) − log(1+iz)). */
export const atan = (z: Complex): Complex => {
  const iz = mul(I, z);
  const t = sub(log(sub(ONE, iz)), log(add(ONE, iz)));
  return mul({ re: 0, im: 0.5 }, t);
};

/** asin(z) = −i·log(iz + √(1−z²)). */
export const asin = (z: Complex): Complex => {
  const root = sqrt(sub(ONE, mul(z, z)));
  return mul({ re: 0, im: -1 }, log(add(mul(I, z), root)));
};

/** acos(z) = π/2 − asin(z). */
export const acos = (z: Complex): Complex => sub({ re: Math.PI / 2, im: 0 }, asin(z));
