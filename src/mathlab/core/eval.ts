import type { Node } from "./ast.ts";

export interface UserFunc { params: string[]; body: Node }

export interface Env {
  vars: Record<string, number>;
  funcs: Record<string, UserFunc>;
}

const CONST_VAL: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  tau: Math.PI * 2,
};

// Explicitly whitelisted numeric functions. No eval / dynamic dispatch.
const FN: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
  exp: Math.exp, ln: Math.log, log: (x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b)),
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow, mod: (a, b) => ((a % b) + b) % b,
};

export const FUNCTION_NAMES = Object.keys(FN);

export function evaluate(n: Node, env: Env): number {
  switch (n.t) {
    case "num": return n.v;
    case "const": return CONST_VAL[n.name];
    case "var": {
      const v = env.vars[n.name];
      if (v === undefined) throw new Error(`Unknown variable '${n.name}'`);
      return v;
    }
    case "neg": return -evaluate(n.a, env);
    case "add": return evaluate(n.a, env) + evaluate(n.b, env);
    case "sub": return evaluate(n.a, env) - evaluate(n.b, env);
    case "mul": return evaluate(n.a, env) * evaluate(n.b, env);
    case "div": return evaluate(n.a, env) / evaluate(n.b, env);
    case "pow": return Math.pow(evaluate(n.a, env), evaluate(n.b, env));
    case "call": {
      const fn = FN[n.name];
      if (fn) return fn(...n.args.map((a) => evaluate(a, env)));
      const uf = env.funcs[n.name];
      if (uf) {
        if (uf.params.length !== n.args.length) throw new Error(`${n.name} expects ${uf.params.length} args`);
        const vars = { ...env.vars };
        uf.params.forEach((p, i) => (vars[p] = evaluate(n.args[i], env)));
        return evaluate(uf.body, { vars, funcs: env.funcs });
      }
      // Not a function: treat name(arg) as implicit multiplication  a·(arg).
      if (n.name in env.vars && n.args.length === 1) return env.vars[n.name] * evaluate(n.args[0], env);
      throw new Error(`Unknown function '${n.name}'`);
    }
  }
}

/**
 * Compile an AST to a fast single-variable numeric function f(x).
 * The returned sampler returns NaN instead of throwing (unknown symbol, domain
 * error): callers are graph renderers that sample partially-typed expressions,
 * so a bad point must draw a gap, not crash the app. `evaluate` still throws.
 */
export function compile1(body: Node, varName: string, env: Env): (x: number) => number {
  const vars = { ...env.vars };
  return (x: number) => {
    try {
      vars[varName] = x;
      return evaluate(body, { vars, funcs: env.funcs });
    } catch {
      return NaN;
    }
  };
}

/** Compile an AST to a two-variable numeric function f(x, y) for surfaces. NaN on error. */
export function compile2(body: Node, vx: string, vy: string, env: Env): (x: number, y: number) => number {
  const vars = { ...env.vars };
  return (x: number, y: number) => {
    try {
      vars[vx] = x;
      vars[vy] = y;
      return evaluate(body, { vars, funcs: env.funcs });
    } catch {
      return NaN;
    }
  };
}

/** Compile an AST to g(x, y, z) for implicit surfaces F(x,y,z)=0. NaN on error. */
export function compile3(body: Node, env: Env): (x: number, y: number, z: number) => number {
  const vars = { ...env.vars };
  return (x: number, y: number, z: number) => {
    try {
      vars.x = x;
      vars.y = y;
      vars.z = z;
      return evaluate(body, { vars, funcs: env.funcs });
    } catch {
      return NaN;
    }
  };
}
