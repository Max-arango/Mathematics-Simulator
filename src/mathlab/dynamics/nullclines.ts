// Nullcline sampling for 2-D autonomous systems: the curves f(x,y)=0 and
// g(x,y)=0. Sample by walking along a horizontal/vertical scan and detecting
// sign changes — a coarse, robust method that doesn't need a root-finder.
//
// For a 2-D continuous system ẋ=f(x,y), ẏ=g(x,y):
//   x-nullcline:  f(x,y) = 0    → flow is purely vertical here
//   y-nullcline:  g(x,y) = 0    → flow is purely horizontal here
// Their intersections are equilibrium candidates; conceptually the candidate
// list comes from findEquilibria, but visualizing the nullclines makes the
// combinatorial structure visible (the equilibrium "candidates" sit where the
// two families cross).
//
// Method: march along the x-axis at N y-rows; between consecutive samples whose
// f-values straddle zero, do a bisection to localize the root. Discrete systems
// have no nullclines — the map's fixed-point condition is field(x) − x = 0, a
// different surface — so we return an empty array for them.
import { InvalidInputError } from "../core/errors.ts";
import { ABS_TOL } from "../core/constants.ts";
import { type Vec } from "../linear/vector.ts";
import { evalField, type DynamicalSystem } from "./system.ts";

export interface NullclineOptions {
  /** Sample rows in y between [yMin, yMax]. Default 24. */
  rows?: number;
  /** Sample columns in x between [xMin, xMax]. Default 64. */
  cols?: number;
  /** x range. Default the visible viewport. Caller passes the same viewport
   *  the field renderer uses so the nullcline polyline draws over the field. */
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  /** Bisection depth for localizing a sign-change root. Default 24. */
  bisectIters?: number;
  /** |f| ≤ this counts as "on" the nullcline (no sign change but already small). */
  threshold?: number;
}

export interface Nullcline {
  /** Which component zeroed: f (x-nullcline) or g (y-nullcline). */
  component: "f" | "g";
  /** Polyline samples in world coordinates. */
  samples: Vec[];
}

// Safe eval: return null on any throw / non-finite.
function safeComp(sys: DynamicalSystem, idx: number, x: Vec): number | null {
  try {
    const v = evalField(sys, x);
    const c = v[idx];
    return Number.isFinite(c) ? c : null;
  } catch {
    return null;
  }
}

// Bisection: given f changes sign between (a, fa) and (b, fb), narrow down.
function bisect(sys: DynamicalSystem, idx: number, a: Vec, fa: number, b: Vec, fb: number, iters: number): Vec {
  let lo = a, fLo = fa, hi = b;
  void fb; // half-open interval: we only ever need fLo (the live endpoint) to compare.
  for (let k = 0; k < iters; k++) {
    const mid: Vec = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    const fm = safeComp(sys, idx, mid);
    if (fm === null) break;
    if (Math.sign(fm) === Math.sign(fLo) || fm === 0) { lo = mid; fLo = fm; } else { hi = mid; }
    if (Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) < ABS_TOL) break;
  }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
}

function sampleNullcline(sys: DynamicalSystem, idx: 0 | 1, opts: Required<NullclineOptions>): Nullcline {
  const out: Vec[] = [];
  const { rows, cols, xMin, xMax, yMin, yMax, bisectIters, threshold } = opts;
  const dx = (xMax - xMin) / (cols - 1);
  const dy = (yMax - yMin) / (rows - 1);

  // Scan both axes so we catch horizontals (f=0 ⟺ y=g(x)) AND verticals (g=0 ⟺ x=h(y)).
  // For idx=0 (x-nullcline f=0) the curve is generically y=g(x): march each column
  // in y. For idx=1 (y-nullcline g=0) the curve is generically x=h(y): march each
  // row in x.

  if (idx === 0) {
    // March y in each x-column.
    for (let i = 0; i < cols; i++) {
      const x = xMin + i * dx;
      let prev: Vec | null = null;
      let prevVal: number | null = null;
      for (let j = 0; j < rows; j++) {
        const y = yMin + j * dy;
        const v = safeComp(sys, idx, [x, y]);
        if (v === null) { prev = null; prevVal = null; continue; }
        const pt: Vec = [x, y];
        if (prev !== null && prevVal !== null && Math.sign(prevVal) !== Math.sign(v)) {
          out.push(bisect(sys, idx, prev, prevVal, pt, v, bisectIters));
        } else if (Math.abs(v) <= threshold) {
          out.push(pt);
        }
        prev = pt;
        prevVal = v;
      }
    }
  } else {
    // March x in each y-row.
    for (let j = 0; j < rows; j++) {
      const y = yMin + j * dy;
      let prev: Vec | null = null;
      let prevVal: number | null = null;
      for (let i = 0; i < cols; i++) {
        const x = xMin + i * dx;
        const v = safeComp(sys, idx, [x, y]);
        if (v === null) { prev = null; prevVal = null; continue; }
        const pt: Vec = [x, y];
        if (prev !== null && prevVal !== null && Math.sign(prevVal) !== Math.sign(v)) {
          out.push(bisect(sys, idx, prev, prevVal, pt, v, bisectIters));
        } else if (Math.abs(v) <= threshold) {
          out.push(pt);
        }
        prev = pt;
        prevVal = v;
      }
    }
  }
  return { component: idx === 0 ? "f" : "g", samples: out };
}

/**
 * Compute the x-nullcline (f=0) and y-nullcline (g=0) as polylines over a
 * world-rectangle. The two curves' intersections are equilibrium candidates;
 * the equilibrium list (from `findEquilibria`) sits exactly there. Empty
 * arrays are returned for non-2-D or discrete systems.
 */
export function nullclines(
  sys: DynamicalSystem,
  opts: NullclineOptions = {},
): { xNullcline: Nullcline; yNullcline: Nullcline } {
  if (sys.kind !== "continuous") {
    return {
      xNullcline: { component: "f", samples: [] },
      yNullcline: { component: "g", samples: [] },
    };
  }
  if (sys.vars.length !== 2) {
    throw new InvalidInputError(`nullclines are defined for 2-D systems; this system is ${sys.vars.length}-D`);
  }
  const merged: Required<NullclineOptions> = {
    rows: opts.rows ?? 24,
    cols: opts.cols ?? 64,
    xMin: opts.xMin ?? -6,
    xMax: opts.xMax ?? 6,
    yMin: opts.yMin ?? -6,
    yMax: opts.yMax ?? 6,
    bisectIters: opts.bisectIters ?? 24,
    threshold: opts.threshold ?? 1e-4,
  };
  if (merged.rows < 2 || merged.cols < 2) {
    throw new InvalidInputError("rows and cols must be ≥ 2");
  }
  return {
    xNullcline: sampleNullcline(sys, 0, merged),
    yNullcline: sampleNullcline(sys, 1, merged),
  };
}