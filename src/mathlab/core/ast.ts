// Expression AST. Kept as a discriminated union so symbolic passes
// (derivative, simplify, integrate, print) can pattern-match exhaustively.
export type Node =
  | { t: "num"; v: number }
  | { t: "const"; name: "pi" | "e" | "phi" | "tau" }
  | { t: "var"; name: string }
  | { t: "neg"; a: Node }
  | { t: "add"; a: Node; b: Node }
  | { t: "sub"; a: Node; b: Node }
  | { t: "mul"; a: Node; b: Node }
  | { t: "div"; a: Node; b: Node }
  | { t: "pow"; a: Node; b: Node }
  | { t: "call"; name: string; args: Node[] };

// Constructors (terser than object literals in the symbolic passes).
export const num = (v: number): Node => ({ t: "num", v });
export const vari = (name: string): Node => ({ t: "var", name });
export const neg = (a: Node): Node => ({ t: "neg", a });
export const add = (a: Node, b: Node): Node => ({ t: "add", a, b });
export const sub = (a: Node, b: Node): Node => ({ t: "sub", a, b });
export const mul = (a: Node, b: Node): Node => ({ t: "mul", a, b });
export const div = (a: Node, b: Node): Node => ({ t: "div", a, b });
export const pow = (a: Node, b: Node): Node => ({ t: "pow", a, b });
export const call = (name: string, args: Node[]): Node => ({ t: "call", name, args });

export const isNum = (n: Node, v?: number): n is { t: "num"; v: number } =>
  n.t === "num" && (v === undefined || n.v === v);

/** Collect free variable names (excludes constants and function names). */
export function freeVars(n: Node, out = new Set<string>()): Set<string> {
  switch (n.t) {
    case "var": out.add(n.name); break;
    case "num": case "const": break;
    case "neg": freeVars(n.a, out); break;
    case "call": n.args.forEach((a) => freeVars(a, out)); break;
    default: freeVars(n.a, out); freeVars(n.b, out);
  }
  return out;
}
