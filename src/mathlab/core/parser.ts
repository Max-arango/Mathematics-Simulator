import { lex, type Tok } from "./lexer.ts";
import type { Node } from "./ast.ts";
import { num, vari, neg, add, sub, mul, div, pow, call } from "./ast.ts";

const CONSTS = new Set(["pi", "e", "phi", "tau"]);

export type Statement =
  | { kind: "func"; name: string; params: string[]; body: Node }
  | { kind: "assign"; name: string; body: Node }
  | { kind: "equation"; lhs: Node; rhs: Node }
  | { kind: "expr"; body: Node };

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}

  private peek(o = 0): Tok | undefined { return this.toks[this.p + o]; }
  private next(): Tok { return this.toks[this.p++]; }
  private eat(k: Tok["k"]): Tok {
    const t = this.toks[this.p];
    if (!t || t.k !== k) throw new Error(`Expected ${k} but got ${t ? t.k : "end"}`);
    this.p++;
    return t;
  }

  parseStatement(): Statement {
    const first = this.peek();
    // function def:  name ( a, b, ... ) = body
    if (first?.k === "id" && this.peek(1)?.k === "lparen") {
      const save = this.p;
      try {
        const name = (this.next() as { v: string }).v;
        this.eat("lparen");
        const params: string[] = [];
        if (this.peek()?.k !== "rparen") {
          params.push((this.eat("id") as { v: string }).v);
          while (this.peek()?.k === "comma") { this.next(); params.push((this.eat("id") as { v: string }).v); }
        }
        this.eat("rparen");
        if (this.peek()?.k === "eq") {
          this.next();
          const body = this.parseExpr();
          this.expectEnd();
          return { kind: "func", name, params, body };
        }
        this.p = save; // was actually a call expression, e.g. sin(x)
      } catch {
        this.p = save;
      }
    }
    // assignment:  name = body
    if (first?.k === "id" && this.peek(1)?.k === "eq" && !CONSTS.has(first.v)) {
      const name = (this.next() as { v: string }).v;
      this.next(); // '='
      const body = this.parseExpr();
      this.expectEnd();
      return { kind: "assign", name, body };
    }
    // General relation: lhs = rhs (e.g. x^2 + y^2 + z^2 = 9).
    const lhs = this.parseExpr();
    if (this.peek()?.k === "eq") {
      this.next();
      const rhs = this.parseExpr();
      this.expectEnd();
      return { kind: "equation", lhs, rhs };
    }
    this.expectEnd();
    return { kind: "expr", body: lhs };
  }

  private expectEnd() {
    if (this.p < this.toks.length) throw new Error(`Unexpected trailing input near token ${this.p}`);
  }

  private beginsPrimary(): boolean {
    const t = this.peek();
    return !!t && (t.k === "num" || t.k === "id" || t.k === "lparen");
  }

  parseExpr(): Node { return this.additive(); }

  private additive(): Node {
    let left = this.multiplicative();
    for (;;) {
      const t = this.peek();
      if (t?.k === "op" && (t.v === "+" || t.v === "-")) {
        this.next();
        const right = this.multiplicative();
        left = t.v === "+" ? add(left, right) : sub(left, right);
      } else break;
    }
    return left;
  }

  private multiplicative(): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.k === "op" && (t.v === "*" || t.v === "/")) {
        this.next();
        const right = this.unary();
        left = t.v === "*" ? mul(left, right) : div(left, right);
      } else if (this.beginsPrimary()) {
        // implicit multiplication: 2x, x(x+1), 2sin(x)
        left = mul(left, this.unary());
      } else break;
    }
    return left;
  }

  private unary(): Node {
    const t = this.peek();
    if (t?.k === "op" && t.v === "-") { this.next(); return neg(this.unary()); }
    if (t?.k === "op" && t.v === "+") { this.next(); return this.unary(); }
    return this.power();
  }

  private power(): Node {
    const base = this.primary();
    const t = this.peek();
    if (t?.k === "op" && t.v === "^") {
      this.next();
      return pow(base, this.unary()); // right-assoc; allows a^-b and a^b^c
    }
    return base;
  }

  private primary(): Node {
    const t = this.next();
    if (!t) throw new Error("Unexpected end of input");
    if (t.k === "num") return num(t.v);
    if (t.k === "lparen") {
      const e = this.parseExpr();
      this.eat("rparen");
      return e;
    }
    if (t.k === "id") {
      if (this.peek()?.k === "lparen") {
        this.next();
        const args: Node[] = [];
        if (this.peek()?.k !== "rparen") {
          args.push(this.parseExpr());
          while (this.peek()?.k === "comma") { this.next(); args.push(this.parseExpr()); }
        }
        this.eat("rparen");
        return call(t.v, args);
      }
      if (CONSTS.has(t.v)) return { t: "const", name: t.v as "pi" };
      return vari(t.v);
    }
    throw new Error(`Unexpected token ${t.k}`);
  }
}

export function parse(src: string): Node {
  return new Parser(lex(src)).parseExpr();
}

export function parseStatement(src: string): Statement {
  return new Parser(lex(src)).parseStatement();
}
