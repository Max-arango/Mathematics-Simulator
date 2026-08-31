// Host-side evaluator of a parsed expression AST over the complex field ℂ.
//
// The core `evaluate` (../core/eval.ts) is real-only. This mirrors the same AST
// recursion but delegates every operation to the first-class complex algebra in
// ./complex.ts — so a parsed source string can be sampled at complex points
// (typically the variable `z`).
//
// Conventions / branch policy (inherited from ./complex.ts):
//   - log/ln  → NATURAL logarithm. NOTE this deliberately differs from the real
//               evaluator, where bare `log` is base-10 (Math.log10). Over ℂ a
//               base-10 default is meaningless for the analytic functions this
//               module targets, so `log` and `ln` are both natural log.
//   - Principal branches: log has its cut on the negative real axis; sqrt and
//               non-integer `pow` inherit that cut (arg ∈ (−π, π]).
//   - `pow` with a real-integer exponent uses exact repeated multiplication
//               (cut-free); otherwise exp(w·log z).
//   - `abs`/`arg` are real-valued; they are embedded as Complex{re, im:0}.
//   - Named exports, explicit `.ts` extensions, no classes.

import type { Node } from "../core/ast.ts";
import { parse } from "../core/parser.ts";
import { InvalidInputError, UnsupportedOperationError } from "../core/errors.ts";
import {
  type Complex, C,
  add, sub, mul, div, neg, pow,
  exp, log, sqrt, conj,
  sin, cos, tan, sinh, cosh, tanh,
  abs as cAbs, arg as cArg,
} from "./complex.ts";

const CONST_VAL: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  tau: Math.PI * 2,
};

// Whitelisted single-argument functions, name → complex op. `log`/`ln` are
// natural log (see header); `abs`/`arg` return a real embedded as Complex{re,0}.
const CFN: Record<string, (z: Complex) => Complex> = {
  exp, sqrt, conj,
  ln: log, log,
  sin, cos, tan, sinh, cosh, tanh,
  abs: (z) => C(cAbs(z), 0),
  arg: (z) => C(cArg(z), 0),
};

/**
 * Evaluate a parsed AST over ℂ. Variables (e.g. `z`) are bound from `vars`.
 * Unknown variable → InvalidInputError. Unknown function name or non-unary call
 * → UnsupportedOperationError.
 */
export function evalComplex(node: Node, vars: Record<string, Complex>): Complex {
  switch (node.t) {
    case "num": return C(node.v, 0);
    case "const": return C(CONST_VAL[node.name], 0);
    case "var": {
      const v = vars[node.name];
      if (v === undefined) throw new InvalidInputError(`unknown variable '${node.name}'`);
      return v;
    }
    case "neg": return neg(evalComplex(node.a, vars));
    case "add": return add(evalComplex(node.a, vars), evalComplex(node.b, vars));
    case "sub": return sub(evalComplex(node.a, vars), evalComplex(node.b, vars));
    case "mul": return mul(evalComplex(node.a, vars), evalComplex(node.b, vars));
    case "div": return div(evalComplex(node.a, vars), evalComplex(node.b, vars));
    case "pow": return pow(evalComplex(node.a, vars), evalComplex(node.b, vars));
    case "call": {
      const fn = CFN[node.name];
      if (!fn) throw new UnsupportedOperationError(`complex evaluator has no function '${node.name}'`);
      if (node.args.length !== 1) {
        throw new UnsupportedOperationError(`'${node.name}' expects 1 argument over ℂ, got ${node.args.length}`);
      }
      return fn(evalComplex(node.args[0], vars));
    }
  }
}

/**
 * Parse `src` once and return a closure z ↦ f(z) that binds the given variable
 * name (default `z`) and evaluates over ℂ.
 */
export function parseComplexFn(src: string, varName = "z"): (z: Complex) => Complex {
  const node = parse(src);
  return (z: Complex) => evalComplex(node, { [varName]: z });
}
