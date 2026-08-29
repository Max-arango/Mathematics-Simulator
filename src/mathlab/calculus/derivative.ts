import type { Node } from "../core/ast.ts";
import { num, vari, neg, add, sub, mul, div, pow, call, isNum } from "../core/ast.ts";
import { simplify } from "../core/simplify.ts";

// d/dv of a known unary function, expressed in terms of its argument node `u`
// (chain rule multiplies by u' at the call site).
function fnDeriv(name: string, u: Node): Node {
  switch (name) {
    case "sin": return call("cos", [u]);
    case "cos": return neg(call("sin", [u]));
    case "tan": return div(num(1), pow(call("cos", [u]), num(2)));
    case "exp": return call("exp", [u]);
    case "ln": return div(num(1), u);
    case "log": return div(num(1), mul(u, call("ln", [num(10)])));
    case "sqrt": return div(num(1), mul(num(2), call("sqrt", [u])));
    case "sinh": return call("cosh", [u]);
    case "cosh": return call("sinh", [u]);
    case "tanh": return div(num(1), pow(call("cosh", [u]), num(2)));
    case "asin": return div(num(1), call("sqrt", [sub(num(1), pow(u, num(2)))]));
    case "acos": return neg(div(num(1), call("sqrt", [sub(num(1), pow(u, num(2)))])));
    case "atan": return div(num(1), add(num(1), pow(u, num(2))));
    case "abs": return call("sign", [u]);
    case "sign": return num(0);
    default: throw new Error(`No symbolic derivative for '${name}'`);
  }
}

/** Raw symbolic derivative w.r.t. variable `v` (call simplify on the result). */
export function diff(n: Node, v: string): Node {
  switch (n.t) {
    case "num": case "const": return num(0);
    case "var": return num(n.name === v ? 1 : 0);
    case "neg": return neg(diff(n.a, v));
    case "add": return add(diff(n.a, v), diff(n.b, v));
    case "sub": return sub(diff(n.a, v), diff(n.b, v));
    case "mul": return add(mul(diff(n.a, v), n.b), mul(n.a, diff(n.b, v)));
    case "div": return div(sub(mul(diff(n.a, v), n.b), mul(n.a, diff(n.b, v))), pow(n.b, num(2)));
    case "pow": {
      const { a, b } = n;
      const da = diff(a, v), db = diff(b, v);
      if (isNum(b)) {
        // d/dv a^k = k a^(k-1) a'
        return mul(mul(num(b.v), pow(a, num(b.v - 1))), da);
      }
      // general: a^b (b' ln a + b a'/a)
      return mul(pow(a, b), add(mul(db, call("ln", [a])), div(mul(b, da), a)));
    }
    case "call": {
      if (n.args.length !== 1) throw new Error(`Cannot differentiate multi-arg ${n.name}`);
      const u = n.args[0];
      return mul(fnDeriv(n.name, u), diff(u, v));
    }
  }
}

export function derivative(n: Node, v: string): Node {
  return simplify(diff(n, v));
}

/** nth derivative. */
export function nthDerivative(n: Node, v: string, order: number): Node {
  let d = n;
  for (let i = 0; i < order; i++) d = derivative(d, v);
  return d;
}

export { vari };
