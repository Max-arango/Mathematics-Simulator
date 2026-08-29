import type { Node } from "./ast.ts";

// Precedence: add/sub 1, mul/div 2, unary neg 3, pow 4, atom 5.
function prec(n: Node): number {
  switch (n.t) {
    case "add": case "sub": return 1;
    case "mul": case "div": return 2;
    case "neg": return 3;
    case "pow": return 4;
    default: return 5;
  }
}

const CONST_SYM: Record<string, string> = { pi: "π", e: "e", phi: "φ", tau: "τ" };

function fmtNum(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toFixed(6)));
}

export function print(n: Node): string {
  const wrap = (child: Node, min: number) => {
    const s = print(child);
    return prec(child) < min ? `(${s})` : s;
  };
  switch (n.t) {
    case "num": return fmtNum(n.v);
    case "const": return CONST_SYM[n.name];
    case "var": return n.name;
    case "neg": return `-${wrap(n.a, 3)}`;
    case "add": return `${wrap(n.a, 1)} + ${wrap(n.b, 1)}`;
    case "sub": return `${wrap(n.a, 1)} - ${wrap(n.b, 2)}`;
    case "mul": return `${wrap(n.a, 2)}·${wrap(n.b, 2)}`;
    case "div": return `${wrap(n.a, 2)}/${wrap(n.b, 3)}`;
    case "pow": return `${wrap(n.a, 5)}^${wrap(n.b, 4)}`;
    case "call": return `${n.name}(${n.args.map(print).join(", ")})`;
  }
}
