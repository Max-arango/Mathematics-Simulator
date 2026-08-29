// Symbolic indefinite integration — a deliberately small, sound subset. It only
// integrates forms whose antiderivative is exact and known: linearity, powers,
// 1/v, and sin/cos/exp applied to the bare variable. There is NO substitution:
// sin(x²), x·sin(x), etc. fall through to unsupported() rather than returning a
// wrong answer. On success the result IS an exact antiderivative → kind 'exact'.
import { type Node, num, add, sub, mul, div, pow, neg, call, vari, isNum } from "../core/ast.ts";
import { type MathResult, exact, unsupported } from "../core/result.ts";
import { simplify } from "../core/simplify.ts";

// Is this node the bare integration variable v?
const isVar = (n: Node, v: string): boolean => n.t === "var" && n.name === v;
// Free of v → treated as a constant factor.
const constOf = (n: Node, v: string): boolean => !dependsOn(n, v);

function dependsOn(n: Node, v: string): boolean {
  switch (n.t) {
    case "var": return n.name === v;
    case "num": case "const": return false;
    case "neg": return dependsOn(n.a, v);
    case "call": return n.args.some((a) => dependsOn(a, v));
    default: return dependsOn(n.a, v) || dependsOn(n.b, v);
  }
}

// Numeric value of a constant exponent, unwrapping neg(num) (how the parser
// represents x^(-2)). Returns null if not a plain numeric literal.
function constExp(n: Node): number | null {
  if (isNum(n)) return n.v;
  if (n.t === "neg" && isNum(n.a)) return -n.a.v;
  return null;
}

// Core: returns null when unsupported (caller wraps in unsupported()).
function integ(n: Node, v: string): Node | null {
  // constant (free of v) → c·v
  if (constOf(n, v)) return mul(n, vari(v));

  switch (n.t) {
    // linearity
    case "add": {
      const l = integ(n.a, v), r = integ(n.b, v);
      return l && r ? add(l, r) : null;
    }
    case "sub": {
      const l = integ(n.a, v), r = integ(n.b, v);
      return l && r ? sub(l, r) : null;
    }
    case "neg": {
      const i = integ(n.a, v);
      return i ? neg(i) : null;
    }
    case "mul": {
      // constant factor pulled out (either side free of v)
      if (constOf(n.a, v)) { const i = integ(n.b, v); return i ? mul(n.a, i) : null; }
      if (constOf(n.b, v)) { const i = integ(n.a, v); return i ? mul(n.b, i) : null; }
      return null; // genuine product of v-dependent factors: not in subset
    }
    case "div": {
      // f / c  → (1/c)·∫f   ;   1/v → ln|v|
      if (constOf(n.b, v)) {
        const i = integ(n.a, v);
        return i ? div(i, n.b) : null;
      }
      // c / v  → c·ln|v|
      if (constOf(n.a, v) && isVar(n.b, v)) return mul(n.a, call("ln", [call("abs", [vari(v)])]));
      return null;
    }
    case "var":
      // ∫v dv = v²/2  (constOf handled other vars already)
      return isVar(n, v) ? div(pow(vari(v), num(2)), num(2)) : null;
    case "pow": {
      // v^n with constant n (accept both num and neg(num) as the exponent)
      const k = constExp(n.b);
      if (isVar(n.a, v) && k !== null) {
        if (k === -1) return call("ln", [call("abs", [vari(v)])]);
        return div(pow(vari(v), num(k + 1)), num(k + 1));
      }
      return null;
    }
    case "call": {
      if (n.args.length !== 1) return null;
      const u = n.args[0];
      if (!isVar(u, v)) return null; // no substitution: inner arg must be exactly v
      switch (n.name) {
        case "sin": return neg(call("cos", [vari(v)]));
        case "cos": return call("sin", [vari(v)]);
        case "exp": return call("exp", [vari(v)]);
        default: return null;
      }
    }
    default:
      return null;
  }
}

export function integrate(f: Node, v: string): MathResult<Node> {
  const r = integ(f, v);
  if (r === null) return unsupported(`no antiderivative in supported subset for this form`);
  return exact(simplify(r));
}
