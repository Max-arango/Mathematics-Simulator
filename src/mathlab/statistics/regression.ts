// Least-squares regression (spec §33). Both fits reduce to a linear least-squares solve on a
// design matrix, so they REUSE linear/leastSquares (QR-based, condition-aware) rather than
// re-deriving normal equations. Reported: coefficients, per-point residuals, R², and a
// predictor. R² = 1 − SS_res/SS_tot is the coefficient of determination — it measures fit,
// NOT causation (spec §33): a high R² says the model explains the sample's variance, nothing
// about why. For polynomial fits, high degree can overfit; degree is the caller's choice.
import { make } from "../linear/matrix.ts";
import { leastSquares } from "../linear/leastSquares.ts";
import { mean } from "./descriptive.ts";
import { DimensionError, InvalidInputError, NumericalInstabilityError } from "../core/errors.ts";
import { EPSILON } from "../core/constants.ts";

export interface RegressionFit {
  coefficients: number[]; // ascending power order: c0 + c1·x + c2·x² + …
  residuals: number[]; // yᵢ − ŷᵢ (observed − predicted), aligned to input order
  r2: number; // coefficient of determination, ≤ 1 (can be negative for a poor forced fit)
  predict: (x: number) => number;
  degree: number;
}

/** Fit coefficients (ascending powers) to (x,y) via a Vandermonde design matrix + least squares. */
function fitPolynomial(x: number[], y: number[], degree: number): RegressionFit {
  if (x.length !== y.length) throw new DimensionError(`x and y must have equal length (${x.length} vs ${y.length})`);
  if (!Number.isInteger(degree) || degree < 1) throw new InvalidInputError(`degree must be an integer ≥ 1 (got ${degree})`);
  if (x.length < degree + 1) throw new InvalidInputError(`need at least ${degree + 1} points to fit degree ${degree} (got ${x.length})`);

  // Vandermonde: rows = observations, columns = [1, x, x², …, x^degree].
  const rows = x.map((xi) => {
    const row = new Array<number>(degree + 1);
    let p = 1;
    for (let j = 0; j <= degree; j++) { row[j] = p; p *= xi; }
    return row;
  });
  const ls = leastSquares(make(rows), y);
  if (ls === null) throw new NumericalInstabilityError("regression design matrix is rank-deficient (collinear/duplicate x); reduce degree or vary the data");
  const coefficients = ls.x;

  const predict = (xi: number): number => {
    let s = 0, p = 1;
    for (let j = 0; j <= degree; j++) { s += coefficients[j] * p; p *= xi; }
    return s;
  };
  const residuals = x.map((xi, i) => y[i] - predict(xi));

  // R² = 1 − SS_res/SS_tot. SS_tot ≈ 0 (constant y) makes R² undefined; report 1 for an exact
  // fit of a constant, else throw rather than emit ±∞.
  const ym = mean(y);
  const ssTot = y.reduce((a, yi) => a + (yi - ym) ** 2, 0);
  const ssRes = residuals.reduce((a, r) => a + r * r, 0);
  let r2: number;
  if (ssTot < EPSILON) r2 = ssRes < EPSILON ? 1 : 0;
  else r2 = 1 - ssRes / ssTot;

  return { coefficients, residuals, r2, predict, degree };
}

/**
 * Ordinary least-squares line y = intercept + slope·x. Returns the shared RegressionFit plus
 * named `slope`/`intercept` for convenience (= coefficients[1]/coefficients[0]).
 */
export function linearRegression(x: number[], y: number[]): RegressionFit & { slope: number; intercept: number } {
  const fit = fitPolynomial(x, y, 1);
  return { ...fit, intercept: fit.coefficients[0], slope: fit.coefficients[1] };
}

/** Polynomial least-squares fit of the given degree (≥1). */
export function polynomialRegression(x: number[], y: number[], degree: number): RegressionFit {
  return fitPolynomial(x, y, degree);
}
