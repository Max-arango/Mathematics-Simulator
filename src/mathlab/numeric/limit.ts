// Numerical limit estimation. This is NEVER symbolic: every success returns
// kind 'approx' with an estimated error in meta, so a numerical guess is never
// mistaken for a proven exact value. Divergence / left≠right are reported as
// their own result kinds rather than a bogus number.
import { type MathResult, approx, divergent, undefinedResult } from "../core/result.ts";
import { ABS_TOL, REL_TOL } from "../core/constants.ts";

export type LimitDir = "left" | "right" | "both" | "+inf" | "-inf";

// Geometric step sequence h = 1e-1 .. 1e-8 (finite a). Smaller than 1e-8 hits
// floating-point noise in f, so we stop there deliberately.
const STEPS = [1e-1, 1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8];
// Large magnitudes for x→±∞.
const BIGS = [1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];

const close = (a: number, b: number): boolean =>
  Math.abs(a - b) <= ABS_TOL + REL_TOL * Math.max(Math.abs(a), Math.abs(b));

// Raw samples in approach order (coarsest → finest) with non-finite values kept
// so the classifier can see overflow/poles. `sign` is approach direction.
function oneSidedSamples(f: (x: number) => number, a: number, sign: 1 | -1): number[] {
  return STEPS.map((h) => f(a + sign * h));
}

function infSamples(f: (x: number) => number, sign: 1 | -1): number[] {
  return BIGS.map((x) => f(sign * x));
}

// Classify a sequence of samples approaching the target.
type SideVerdict =
  | { kind: "value"; value: number; error: number }
  | { kind: "divergent"; sign: number }
  | { kind: "unclear" };

// Convergence tolerance: the approach to a limit is only first/second-order in
// h, so the finest two samples won't sit within ABS_TOL. We instead look for the
// best-agreeing consecutive pair (a "plateau"), which sidesteps catastrophic
// cancellation that corrupts the very finest samples (e.g. (1−cos x)/x²).
const LOOSE = 1e-4;
const looseClose = (a: number, b: number): boolean =>
  Math.abs(a - b) <= LOOSE * (1 + Math.max(Math.abs(a), Math.abs(b)));

function classify(ys: number[]): SideVerdict {
  const finite = ys.filter(Number.isFinite);
  const overflowed = finite.length < ys.length; // some samples hit ±Infinity/NaN

  // Blow-up: overflow, or finite magnitudes growing monotonically past a large
  // threshold. Sign taken from the last finite sample.
  if (finite.length >= 1) {
    const mags = finite.map(Math.abs);
    let growing = true;
    for (let i = 1; i < mags.length; i++) if (mags[i] < mags[i - 1]) { growing = false; break; }
    const lastFinite = finite[finite.length - 1];
    if ((overflowed && growing) || (growing && Math.abs(lastFinite) > 1e6)) {
      return { kind: "divergent", sign: Math.sign(lastFinite) || 1 };
    }
  }

  if (finite.length < 3) return { kind: "unclear" };

  // Find the consecutive pair with the smallest gap (the plateau where the
  // sequence has settled before numerical noise reappears).
  let bestI = 0, bestGap = Infinity;
  for (let i = 1; i < finite.length; i++) {
    const g = Math.abs(finite[i] - finite[i - 1]);
    if (g < bestGap) { bestGap = g; bestI = i; }
  }
  const value = finite[bestI];
  if (close(value, finite[bestI - 1]) || looseClose(value, finite[bestI - 1])) {
    return { kind: "value", value, error: Math.max(bestGap, 1e-12) };
  }
  return { kind: "unclear" };
}

export function numericLimit(
  f: (x: number) => number,
  a: number,
  dir: LimitDir,
): MathResult<number> {
  if (dir === "+inf" || dir === "-inf") {
    const v = classify(infSamples(f, dir === "+inf" ? 1 : -1));
    if (v.kind === "value") return approx(v.value, { error: v.error, warnings: ["numerical estimate"] });
    if (v.kind === "divergent") return divergent("magnitude grows without bound");
    return undefinedResult("no numerical convergence at infinity");
  }

  if (dir === "left" || dir === "right") {
    const v = classify(oneSidedSamples(f, a, dir === "right" ? 1 : -1));
    if (v.kind === "value") return approx(v.value, { error: v.error, warnings: ["numerical estimate"] });
    if (v.kind === "divergent") return divergent(`one-sided (${dir}) magnitude grows without bound`);
    return undefinedResult(`no numerical convergence (${dir})`);
  }

  // both: compare left and right approaches.
  const leftYs = oneSidedSamples(f, a, -1);
  const rightYs = oneSidedSamples(f, a, 1);
  const L = classify(leftYs);
  const R = classify(rightYs);

  if (L.kind === "value" && R.kind === "value") {
    if (looseClose(L.value, R.value)) {
      const value = (L.value + R.value) / 2;
      return approx(value, { error: Math.max(L.error, R.error, Math.abs(L.value - R.value)), warnings: ["numerical estimate"] });
    }
    return undefinedResult(`left≠right (${L.value} vs ${R.value})`);
  }
  // Two-sided pole: both blow up. Same sign → divergent (e.g. 1/x²); opposite
  // sign → undefined (e.g. 1/x: −∞ vs +∞).
  if (L.kind === "divergent" && R.kind === "divergent") {
    return L.sign === R.sign
      ? divergent("two-sided blow-up (same sign)")
      : undefinedResult("left→∓∞, right→±∞");
  }
  return undefinedResult("left and right disagree or do not converge");
}
