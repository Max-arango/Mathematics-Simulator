import type { Node } from "./ast.ts";

// Shared complex-arithmetic prelude. WebGL1 (GLSL ES 1.00) has no hyperbolic
// builtins, so they are expanded via exp().
export const COMPLEX_GLSL = `
const float PI = 3.141592653589793;
float sh(float x){ return 0.5*(exp(x)-exp(-x)); }
float ch(float x){ return 0.5*(exp(x)+exp(-x)); }
vec2 cadd(vec2 a, vec2 b){ return a+b; }
vec2 csub(vec2 a, vec2 b){ return a-b; }
vec2 cneg(vec2 a){ return -a; }
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x); }
vec2 cdiv(vec2 a, vec2 b){ float d=dot(b,b); return vec2(a.x*b.x+a.y*b.y, a.y*b.x-a.x*b.y)/d; }
vec2 cconj(vec2 a){ return vec2(a.x,-a.y); }
vec2 cexp(vec2 a){ float e=exp(a.x); return vec2(e*cos(a.y), e*sin(a.y)); }
vec2 clog(vec2 a){ return vec2(0.5*log(dot(a,a)), atan(a.y,a.x)); }
vec2 cpowr(vec2 a, float p){ float r=length(a); if(r==0.0) return vec2(0.0); float t=atan(a.y,a.x); float rp=pow(r,p); return rp*vec2(cos(p*t), sin(p*t)); }
vec2 cpowc(vec2 a, vec2 b){ return cexp(cmul(b, clog(a))); }
vec2 cpowi(vec2 a, int n){ vec2 r=vec2(1.0,0.0); for(int k=0;k<16;k++){ if(k>=n) break; r=cmul(r,a);} return r; }
vec2 csin(vec2 a){ return vec2(sin(a.x)*ch(a.y), cos(a.x)*sh(a.y)); }
vec2 ccos(vec2 a){ return vec2(cos(a.x)*ch(a.y), -sin(a.x)*sh(a.y)); }
vec2 ctan(vec2 a){ return cdiv(csin(a), ccos(a)); }
vec2 csqrt(vec2 a){ return cpowr(a, 0.5); }
vec2 cabsz(vec2 a){ return vec2(abs(a.x), abs(a.y)); }
`;

const CONST_VAL: Record<string, number> = { pi: Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2, tau: Math.PI * 2 };
const FN_MAP: Record<string, string> = {
  sin: "csin", cos: "ccos", tan: "ctan", exp: "cexp", ln: "clog", log: "clog",
  sqrt: "csqrt", conjugate: "cconj", conj: "cconj", abs: "cabsz",
};

export class GlslCompileError extends Error {}

function glslFloat(v: number): string {
  if (!Number.isFinite(v)) throw new GlslCompileError(`Non-finite constant ${v}`);
  let s = String(v).replace("e+", "e");
  if (!/[.e]/.test(s)) s += ".0";
  return s;
}

// Emit a GLSL expression of type vec2 (a complex number) for the AST node.
// Allowed variables on the GPU: z, c, i (imaginary unit), p (real parameter).
function emit(n: Node): string {
  switch (n.t) {
    case "num": return `vec2(${glslFloat(n.v)}, 0.0)`;
    case "const": return `vec2(${glslFloat(CONST_VAL[n.name])}, 0.0)`;
    case "var":
      if (n.name === "z" || n.name === "c") return n.name;
      if (n.name === "i") return "vec2(0.0, 1.0)";
      if (n.name === "p") return "vec2(uP, 0.0)";
      throw new GlslCompileError(`Variable '${n.name}' unsupported on GPU (use z, c, i, p)`);
    case "neg": return `cneg(${emit(n.a)})`;
    case "add": return `cadd(${emit(n.a)}, ${emit(n.b)})`;
    case "sub": return `csub(${emit(n.a)}, ${emit(n.b)})`;
    case "mul": return `cmul(${emit(n.a)}, ${emit(n.b)})`;
    case "div": return `cdiv(${emit(n.a)}, ${emit(n.b)})`;
    case "pow": {
      const base = emit(n.a);
      if (n.b.t === "num") {
        if (Number.isInteger(n.b.v) && n.b.v >= 1 && n.b.v <= 16) return `cpowi(${base}, ${n.b.v})`;
        return `cpowr(${base}, ${glslFloat(n.b.v)})`;
      }
      return `cpowc(${base}, ${emit(n.b)})`;
    }
    case "call": {
      const g = FN_MAP[n.name];
      if (!g || n.args.length !== 1) throw new GlslCompileError(`Function '${n.name}' unsupported on GPU`);
      return `${g}(${emit(n.args[0])})`;
    }
  }
}

/** Compile an AST into a GLSL vec2 expression for `F(z, c)`. Throws GlslCompileError. */
export function compileComplexGlsl(ast: Node): string {
  return emit(ast);
}
