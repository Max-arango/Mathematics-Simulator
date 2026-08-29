import { parse } from "../mathlab/core/parser.ts";
import { compileComplexGlsl, COMPLEX_GLSL, GlslCompileError } from "../mathlab/core/complexGlsl.ts";

// Fragment shader for user expressions. uType: 0 escape-time (c = pixel,
// Mandelbrot-mode) · 1 Julia (z = pixel, c fixed) · 2 domain coloring of F(z).
function buildFragment(exprGlsl: string): string {
  return `
precision highp float;
#define MAX_ITER 2000
${COMPLEX_GLSL}
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uSpan;
uniform int uMaxIter;
uniform float uEscape2;
uniform int uType;
uniform vec2 uJuliaC;
uniform float uP;
uniform int uPalette;
uniform float uColorOffset;
uniform float uColorScale;
uniform int uInvert;

vec3 palette(float t) {
  vec3 a, b, c, d;
  if (uPalette == 0) {        a = vec3(0.5); b = vec3(0.5); c = vec3(1.0); d = vec3(0.0, 0.10, 0.20); }
  else if (uPalette == 1) {   a = vec3(0.5, 0.25, 0.05); b = vec3(0.5, 0.35, 0.1); c = vec3(1.0, 1.0, 0.7); d = vec3(0.0, 0.15, 0.25); }
  else if (uPalette == 2) {   a = vec3(0.1, 0.3, 0.5); b = vec3(0.2, 0.4, 0.5); c = vec3(1.0, 1.0, 1.0); d = vec3(0.6, 0.7, 0.9); }
  else if (uPalette == 3) {   a = vec3(0.5); b = vec3(0.5); c = vec3(1.0); d = vec3(0.0, 0.33, 0.67); }
  else if (uPalette == 4) {   a = vec3(0.5, 0.0, 0.5); b = vec3(0.5, 0.4, 0.5); c = vec3(1.0, 1.0, 0.5); d = vec3(0.8, 0.9, 0.3); }
  else { return vec3(fract(t)); }
  return a + b * cos(6.28318 * (c * t + d));
}

vec2 F(vec2 z, vec2 c) { return ${exprGlsl}; }

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = gl_FragCoord.xy / uResolution - 0.5;
  vec2 pos = uCenter + vec2(uv.x * aspect, uv.y) * uSpan;

  if (uType == 2) {                       // domain coloring
    vec2 w = F(pos, vec2(0.0));
    float ang = atan(w.y, w.x) / 6.28318 + 0.5;
    float mag = length(w);
    float bright = 0.5 + atan(log(mag + 1.0)) / PI;
    vec3 col = palette(uColorOffset + ang);
    col *= clamp(uColorScale * bright, 0.0, 1.0) + 0.15;
    if (uInvert == 1) col = vec3(1.0) - col;
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  vec2 z, c;
  if (uType == 1) { z = pos; c = uJuliaC; } else { z = vec2(0.0); c = pos; }
  int iter = uMaxIter;
  float dz = 0.0;
  bool esc = false;
  for (int i = 0; i < MAX_ITER; i++) {
    if (i >= uMaxIter) break;
    z = F(z, c);
    dz = dot(z, z);
    if (dz > uEscape2) { iter = i; esc = true; break; }
  }
  if (!esc) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float mu = float(iter) + 1.0 - log(0.5 * log(dz)) / log(2.0);
  float t = uColorOffset + uColorScale * mu * 0.02;
  vec3 col = palette(t);
  if (uInvert == 1) col = vec3(1.0) - col;
  gl_FragColor = vec4(col, 1.0);
}
`;
}

export interface CustomBuild { fragment: string | null; error: string | null }

/** Parse a user expression and build its fragment shader source. */
export function buildCustomShader(source: string): CustomBuild {
  try {
    const ast = parse(source);
    const glsl = compileComplexGlsl(ast);
    return { fragment: buildFragment(glsl), error: null };
  } catch (e) {
    const msg = e instanceof GlslCompileError || e instanceof Error ? e.message : String(e);
    return { fragment: null, error: msg };
  }
}
