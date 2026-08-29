import type { Node } from "./ast.ts";
import { num, neg, add, sub, mul, div, pow, isNum } from "./ast.ts";

// Conservative simplifier: constant folding + identity/annihilator rules.
// Enough to keep derivative output legible; not a full CAS normaliser.
export function simplify(n: Node): Node {
  switch (n.t) {
    case "num": case "const": case "var": return n;
    case "call": return { t: "call", name: n.name, args: n.args.map(simplify) };
    case "neg": {
      const a = simplify(n.a);
      if (isNum(a)) return num(-a.v);
      if (a.t === "neg") return a.a; // -(-x) = x
      return neg(a);
    }
    case "add": {
      const a = simplify(n.a), b = simplify(n.b);
      if (isNum(a) && isNum(b)) return num(a.v + b.v);
      if (isNum(a, 0)) return b;
      if (isNum(b, 0)) return a;
      return add(a, b);
    }
    case "sub": {
      const a = simplify(n.a), b = simplify(n.b);
      if (isNum(a) && isNum(b)) return num(a.v - b.v);
      if (isNum(b, 0)) return a;
      if (isNum(a, 0)) return simplify(neg(b));
      return sub(a, b);
    }
    case "mul": {
      const a = simplify(n.a), b = simplify(n.b);
      if (isNum(a) && isNum(b)) return num(a.v * b.v);
      // Fold a constant across a product: k·(c·X) → (k·c)·X  (associativity of ·).
      // Done before the value-guards below (they narrow `num` off the type).
      if (isNum(a) && b.t === "mul") {
        if (isNum(b.a)) return simplify(mul(num(a.v * b.a.v), b.b));
        if (isNum(b.b)) return simplify(mul(num(a.v * b.b.v), b.a));
      }
      if (isNum(b) && a.t === "mul") {
        if (isNum(a.a)) return simplify(mul(num(b.v * a.a.v), a.b));
        if (isNum(a.b)) return simplify(mul(num(b.v * a.b.v), a.a));
      }
      if (isNum(a, 0) || isNum(b, 0)) return num(0);
      if (isNum(a, 1)) return b;
      if (isNum(b, 1)) return a;
      if (isNum(a, -1)) return simplify(neg(b));
      if (isNum(b, -1)) return simplify(neg(a));
      return mul(a, b);
    }
    case "div": {
      const a = simplify(n.a), b = simplify(n.b);
      if (isNum(a) && isNum(b) && b.v !== 0) return num(a.v / b.v);
      if (isNum(a, 0)) return num(0);
      if (isNum(b, 1)) return a;
      return div(a, b);
    }
    case "pow": {
      const a = simplify(n.a), b = simplify(n.b);
      if (isNum(a) && isNum(b)) return num(Math.pow(a.v, b.v));
      if (isNum(b, 0)) return num(1);
      if (isNum(b, 1)) return a;
      if (isNum(a, 1)) return num(1);
      return pow(a, b);
    }
  }
}
