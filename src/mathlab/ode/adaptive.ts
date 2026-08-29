// Adaptive-step embedded Runge–Kutta: RUNGE–KUTTA–FEHLBERG 4(5) (RKF45).
//
// One step evaluates f six times and forms two solutions from the same stages: a
// 4th-order estimate y4 and a 5th-order estimate y5. Their difference estimates the
// local truncation error, which drives the step size. We propagate the 5th-order
// solution (LOCAL EXTRAPOLATION), so the reported `order` is 5 and the error
// estimate is a conservative bound on the actually-committed error.
//
// Step control (simple error-normalised, not PI): with a component scale
//   sc_i = absTol + relTol·max(|y_i|, |y5_i|),  errNorm = sqrt(mean_i (err_i/sc_i)²)
// accept when errNorm ≤ 1. Next step  h·clamp(SAFETY·errNorm^(−1/5), MIN_FAC, MAX_FAC).
// A rejected step keeps t and shrinks h; MAX_ODE_STEPS bounds accepted+rejected so a
// pathological problem can't spin forever (→ termination "max-steps").
//
// STILL AN EXPLICIT, NON-STIFF METHOD. Adaptivity fixes accuracy, not stability: on a
// stiff system the controller is forced to tiny steps (or hits the cap) rather than
// blowing up — but this is not an implicit/stiff solver. See solvers.ts.
import { add, scale, type Vec } from "../linear/vector.ts";
import { ABS_TOL, REL_TOL, MAX_ODE_STEPS } from "../core/constants.ts";
import { InvalidInputError } from "../core/errors.ts";
import type { ODEMethod, ODEProblem, ODEResult, ODEOptions } from "./types.ts";

const SAFETY = 0.9;
const MIN_FAC = 0.2; // never shrink faster than 5×  }  clamps keep the controller from
const MAX_FAC = 5.0; // never grow faster than 5×    }  wild swings on a single estimate
const ERR_EXP = 1 / 5; // 1/(lower order + 1) = 1/5 for a 4(5) pair

const allFinite = (v: Vec): boolean => v.every(Number.isFinite);
const infNorm = (v: Vec): number => v.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

// Σ coef·k over the stages (the a-row / b-weights of the tableau).
const comb = (pairs: [number, Vec][]): Vec =>
  pairs.reduce<Vec>((acc, [c, k]) => add(acc, scale(k, c)), k0(pairs[0][1].length));
const k0 = (n: number): Vec => new Array(n).fill(0);

function rkf45Step(f: ODEProblem["f"], t: number, y: Vec, h: number): { y4: Vec; y5: Vec } {
  const k1 = f(t, y);
  const k2 = f(t + h / 4, add(y, scale(comb([[1 / 4, k1]]), h)));
  const k3 = f(t + (3 / 8) * h, add(y, scale(comb([[3 / 32, k1], [9 / 32, k2]]), h)));
  const k4 = f(t + (12 / 13) * h, add(y, scale(comb([[1932 / 2197, k1], [-7200 / 2197, k2], [7296 / 2197, k3]]), h)));
  const k5 = f(t + h, add(y, scale(comb([[439 / 216, k1], [-8, k2], [3680 / 513, k3], [-845 / 4104, k4]]), h)));
  const k6 = f(t + h / 2, add(y, scale(comb([[-8 / 27, k1], [2, k2], [-3544 / 2565, k3], [1859 / 4104, k4], [-11 / 40, k5]]), h)));
  const y4 = add(y, scale(comb([[25 / 216, k1], [1408 / 2565, k3], [2197 / 4104, k4], [-1 / 5, k5]]), h));
  const y5 = add(y, scale(comb([[16 / 135, k1], [6656 / 12825, k3], [28561 / 56430, k4], [-9 / 50, k5], [2 / 55, k6]]), h));
  return { y4, y5 };
}

function solve(p: ODEProblem, o: ODEOptions = {}): ODEResult {
  const { f, y0, t0, t1 } = p;
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) throw new InvalidInputError("t0/t1 must be finite");
  if (t1 <= t0) throw new InvalidInputError(`t1 must exceed t0 (got t0=${t0}, t1=${t1})`);
  if (y0.length === 0) throw new InvalidInputError("y0 must be non-empty");
  if (!allFinite(y0)) throw new InvalidInputError("y0 must be finite");
  if (o.h !== undefined && (!(o.h > 0) || !Number.isFinite(o.h))) throw new InvalidInputError(`h must be > 0 (got ${o.h})`);

  const absTol = o.absTol ?? ABS_TOL;
  const relTol = o.relTol ?? REL_TOL;
  if (!(absTol > 0) || !(relTol > 0)) throw new InvalidInputError("absTol/relTol must be > 0");

  const cap = Math.min(o.maxSteps ?? MAX_ODE_STEPS, MAX_ODE_STEPS);
  const span = t1 - t0;
  let h = o.h ?? span / 100; // heuristic initial step
  h = Math.min(h, span);

  const t: number[] = [t0];
  const y: Vec[] = [y0.slice()];
  let cur = y0.slice();
  let tc = t0;
  let accepted = 0, rejected = 0, maxErr = 0;
  const warnings: string[] = [];
  let termination: ODEResult["termination"] = "reached-t1";

  while (tc < t1) {
    if (accepted + rejected >= cap) {
      termination = "max-steps";
      warnings.push(`hit step cap ${cap} before reaching t1 (t=${tc})`);
      break;
    }
    if (tc + h > t1) h = t1 - tc; // don't overshoot the endpoint

    const { y4, y5 } = rkf45Step(f, tc, cur, h);
    if (!allFinite(y5) || !allFinite(y4)) {
      termination = "non-finite";
      warnings.push(`state became non-finite near t≈${tc + h}; stopped (result untrustworthy past here)`);
      break;
    }

    // component error scale sc_i and RMS-normalised error
    let sumSq = 0;
    for (let i = 0; i < y5.length; i++) {
      const sc = absTol + relTol * Math.max(Math.abs(cur[i]), Math.abs(y5[i]));
      const e = (y5[i] - y4[i]) / sc;
      sumSq += e * e;
    }
    const errNorm = Math.sqrt(sumSq / y5.length);

    if (errNorm <= 1) {
      accepted++;
      tc += h;
      cur = y5; // local extrapolation: propagate the higher-order estimate
      t.push(tc);
      y.push(cur);
      maxErr = Math.max(maxErr, infNorm(y5.map((v, i) => v - y4[i])));
    } else {
      rejected++;
    }
    // step-size update (errNorm==0 ⇒ grow by MAX_FAC)
    const fac = errNorm === 0 ? MAX_FAC : Math.min(MAX_FAC, Math.max(MIN_FAC, SAFETY * errNorm ** -ERR_EXP));
    h *= fac;
  }

  return {
    t, y, steps: accepted + rejected, accepted, rejected,
    errorEstimate: maxErr, method: "rkf45", order: 5,
    converged: termination === "reached-t1", warnings, termination,
  };
}

export const rkf45: ODEMethod = {
  name: "rkf45",
  order: 5,
  adaptive: true,
  description: "Adaptive Runge–Kutta–Fehlberg 4(5), error-controlled step, local extrapolation.",
  solve,
};
