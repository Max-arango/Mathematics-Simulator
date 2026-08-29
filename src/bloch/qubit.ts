// Single-qubit state + gates for the Bloch sphere.
// |ψ⟩ = a0|0⟩ + a1|1⟩, amplitudes complex. Every gate is expressed as a
// rotation about a Bloch axis by an angle (U = cos(θ/2)·I − i·sin(θ/2)·(n·σ)),
// which is exact up to global phase — irrelevant for the Bloch vector — and
// lets the same code animate an arc for any gate.

export interface C { re: number; im: number }
export type State = [C, C];
export type Mat = [[C, C], [C, C]];
export type Vec3 = [number, number, number];

const c = (re: number, im = 0): C => ({ re, im });
const cadd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
const cmul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cabs2 = (a: C): number => a.re * a.re + a.im * a.im;

export const KET0: State = [c(1), c(0)];

export function applyMat(m: Mat, s: State): State {
  return [
    cadd(cmul(m[0][0], s[0]), cmul(m[0][1], s[1])),
    cadd(cmul(m[1][0], s[0]), cmul(m[1][1], s[1])),
  ];
}

export function normalize(s: State): State {
  const n = Math.sqrt(cabs2(s[0]) + cabs2(s[1])) || 1;
  return [{ re: s[0].re / n, im: s[0].im / n }, { re: s[1].re / n, im: s[1].im / n }];
}

/** Rotation by `angle` about unit Bloch axis n = (nx, ny, nz). */
export function rotation(nx: number, ny: number, nz: number, angle: number): Mat {
  const L = Math.hypot(nx, ny, nz) || 1;
  nx /= L; ny /= L; nz /= L;
  const co = Math.cos(angle / 2), si = Math.sin(angle / 2);
  return [
    [c(co, -si * nz), c(-si * ny, -si * nx)],
    [c(si * ny, -si * nx), c(co, si * nz)],
  ];
}

/** Bloch vector (x, y, z) of a state. |0⟩→+z, |1⟩→−z, |+⟩→+x, |i⟩→+y. */
export function blochVector(s: State): Vec3 {
  const [a0, a1] = s;
  // conj(a0)·a1
  const re = a0.re * a1.re + a0.im * a1.im;
  const im = a0.re * a1.im - a0.im * a1.re;
  return [2 * re, 2 * im, cabs2(a0) - cabs2(a1)];
}

/** Polar angles: θ from the +z axis, φ azimuth in the x–y plane. */
export function angles(s: State): { theta: number; phi: number } {
  const [x, y, z] = blochVector(s);
  return { theta: Math.acos(Math.max(-1, Math.min(1, z))), phi: Math.atan2(y, x) };
}

/**
 * Measurement probabilities in the three cardinal bases, read straight off the
 * Bloch vector: P = (1 ± component)/2. Z = computational basis {|0⟩,|1⟩}.
 */
export function probabilities(s: State) {
  const [x, y, z] = blochVector(s);
  return {
    z0: (1 + z) / 2, z1: (1 - z) / 2,
    xPlus: (1 + x) / 2, xMinus: (1 - x) / 2,
    yPlus: (1 + y) / 2, yMinus: (1 - y) / 2,
  };
}

export interface GateDef { label: string; axis: Vec3; angle: number }

const H_AXIS: Vec3 = [1 / Math.SQRT2, 0, 1 / Math.SQRT2];
export const GATES: Record<string, GateDef> = {
  X: { label: "X", axis: [1, 0, 0], angle: Math.PI },
  Y: { label: "Y", axis: [0, 1, 0], angle: Math.PI },
  Z: { label: "Z", axis: [0, 0, 1], angle: Math.PI },
  H: { label: "H", axis: H_AXIS, angle: Math.PI },
  S: { label: "S", axis: [0, 0, 1], angle: Math.PI / 2 },
  Sdg: { label: "S†", axis: [0, 0, 1], angle: -Math.PI / 2 },
  T: { label: "T", axis: [0, 0, 1], angle: Math.PI / 4 },
  Tdg: { label: "T†", axis: [0, 0, 1], angle: -Math.PI / 4 },
};

/** Apply a gate by name (exact up to global phase). */
export function applyGate(name: string, s: State): State {
  const g = GATES[name];
  if (!g) throw new Error(`Unknown gate ${name}`);
  return normalize(applyMat(rotation(g.axis[0], g.axis[1], g.axis[2], g.angle), s));
}

/** Sample the Bloch-vector arc traced while rotating from `s` by (axis, angle). */
export function arc(s: State, axis: Vec3, angle: number, steps = 32): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 1; k <= steps; k++) {
    const m = rotation(axis[0], axis[1], axis[2], (angle * k) / steps);
    out.push(blochVector(applyMat(m, s)));
  }
  return out;
}

/**
 * Resonant/detuned drive pulse. Under H = (Δ/2)σz + (Ω/2)(cosφ σx + sinφ σy),
 * evolving for time t is a rotation about the effective axis (Ω cosφ, Ω sinφ, Δ)
 * by angle √(Ω²+Δ²)·t. On resonance (Δ=0) a φ=0 pulse rotates about +x.
 */
export function pulseAxisAngle(rabi: number, detuning: number, phase: number, duration: number): { axis: Vec3; angle: number } {
  const wx = rabi * Math.cos(phase), wy = rabi * Math.sin(phase), wz = detuning;
  const omega = Math.hypot(rabi, detuning);
  const axis: Vec3 = omega > 1e-9 ? [wx / omega, wy / omega, wz / omega] : [0, 0, 1];
  return { axis, angle: omega * duration };
}

export function ampString(a: C): string {
  const r = Math.abs(a.re) < 1e-6 ? 0 : a.re;
  const i = Math.abs(a.im) < 1e-6 ? 0 : a.im;
  if (i === 0) return `${round(r)}`;
  if (r === 0) return `${round(i)}i`;
  return `${round(r)}${i > 0 ? "+" : "−"}${round(Math.abs(i))}i`;
}
const round = (v: number) => Number(v.toFixed(3));
