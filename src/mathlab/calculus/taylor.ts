// Taylor polynomial about `center`: Σ_{k=0..order} f^(k)(a)/k! · (x−a)^k.
// Coefficients are NUMERIC — each nth symbolic derivative is evaluated at the
// center, so the returned Node has numeric coefficients and symbolic (x−a)^k
// terms (no lingering unevaluated derivative expressions).
import { type Node, num, add, mul, sub, pow, vari } from "../core/ast.ts";
import { nthDerivative } from "./derivative.ts";
import { evaluate } from "../core/eval.ts";
import { simplify } from "../core/simplify.ts";

// c_k = f^(k)(center) / k!
export function taylorCoeffs(f: Node, v: string, center: number, order: number): number[] {
  const coeffs: number[] = [];
  let fact = 1;
  let dk: Node = f;
  for (let k = 0; k <= order; k++) {
    if (k > 0) { dk = nthDerivative(f, v, k); fact *= k; }
    const fk = evaluate(dk, { vars: { [v]: center }, funcs: {} });
    coeffs.push(fk / fact);
  }
  return coeffs;
}

export function taylor(f: Node, v: string, center: number, order: number): Node {
  const coeffs = taylorCoeffs(f, v, center, order);
  // (x − a); when a==0 the simplify pass collapses it to x.
  const shifted: Node = sub(vari(v), num(center));
  let poly: Node = num(coeffs[0]);
  for (let k = 1; k <= order; k++) {
    poly = add(poly, mul(num(coeffs[k]), pow(shifted, num(k))));
  }
  return simplify(poly);
}
