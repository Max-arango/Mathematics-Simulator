// Full-screen triangle vertex shader.
export const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Escape-time + Newton fragment shader.  z -> z^p + c (folds per type).
// uType: 0 Mandelbrot · 1 Julia · 2 Burning Ship · 3 Tricorn · 4 Celtic ·
//        5 Buffalo · 10 Newton (basins of z^n - 1).
//
// Coordinates + iteration run in emulated double precision (df64) for the
// escape-time family with integer exponents; fractional p and Newton use the
// float32 path (shallow zoom).
export const FRAG = `
precision highp float;

#define MAX_ITER 2000
#define MAX_POW 16

uniform vec2 uResolution;
uniform vec2 uCenterRe;   // df64
uniform vec2 uCenterIm;   // df64
uniform vec2 uSpan;       // df64, vertical span
uniform int uMaxIter;
uniform float uEscape2;
uniform float uExponent;
uniform int uType;
uniform vec2 uJuliaCRe;   // df64
uniform vec2 uJuliaCIm;   // df64
uniform int uPalette;
uniform float uColorOffset;
uniform float uColorScale;
uniform int uInvert;

// ---- df64 arithmetic (Thasler) -------------------------------------------
vec2 dsSet(float a) { return vec2(a, 0.0); }
vec2 dsAdd(vec2 a, vec2 b) {
  float t1 = a.x + b.x;
  float e = t1 - a.x;
  float t2 = ((b.x - e) + (a.x - (t1 - e))) + a.y + b.y;
  float hi = t1 + t2;
  return vec2(hi, t2 - (hi - t1));
}
vec2 dsNeg(vec2 a) { return vec2(-a.x, -a.y); }
vec2 dsSub(vec2 a, vec2 b) { return dsAdd(a, dsNeg(b)); }
vec2 dsMul(vec2 a, vec2 b) {
  float split = 4097.0;
  float cona = a.x * split;
  float conb = b.x * split;
  float a1 = cona - (cona - a.x);
  float b1 = conb - (conb - b.x);
  float a2 = a.x - a1;
  float b2 = b.x - b1;
  float c11 = a.x * b.x;
  float c21 = a2 * b2 + (a2 * b1 + (a1 * b2 + (a1 * b1 - c11)));
  float c2 = a.x * b.y + a.y * b.x;
  float t1 = c11 + c2;
  float e = t1 - c11;
  float t2 = a.y * b.y + ((c2 - e) + (c11 - (t1 - e))) + c21;
  float hi = t1 + t2;
  return vec2(hi, t2 - (hi - t1));
}
vec2 dsAbs(vec2 a) { return a.x < 0.0 ? dsNeg(a) : a; }
void cmul(vec2 ar, vec2 ai, vec2 br, vec2 bi, out vec2 outR, out vec2 outI) {
  outR = dsSub(dsMul(ar, br), dsMul(ai, bi));
  outI = dsAdd(dsMul(ar, bi), dsMul(ai, br));
}

// ---- float32 complex helpers (fractional exp + Newton) -------------------
vec2 cpow(vec2 z, float p) {
  float r = length(z);
  if (r == 0.0) return vec2(0.0);
  float theta = atan(z.y, z.x);
  float rp = pow(r, p);
  return rp * vec2(cos(p * theta), sin(p * theta));
}
vec2 cmulF(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdivF(vec2 a, vec2 b) { float d = dot(b, b); return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d; }

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

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = gl_FragCoord.xy / uResolution - 0.5;
  float span = uSpan.x + uSpan.y;
  vec2 center = vec2(uCenterRe.x + uCenterRe.y, uCenterIm.x + uCenterIm.y);
  vec2 pos = center + vec2(uv.x * aspect, uv.y) * span;

  int p = int(floor(uExponent + 0.5));

  // ---- Newton basins of z^n - 1 -------------------------------------------
  if (uType == 10) {
    vec2 z = pos;
    int usedIter = uMaxIter;
    for (int i = 0; i < MAX_ITER; i++) {
      if (i >= uMaxIter) break;
      vec2 zn1 = cpow(z, float(p - 1));          // z^(n-1)
      vec2 f = cmulF(zn1, z) - vec2(1.0, 0.0);   // z^n - 1
      vec2 df = float(p) * zn1;                  // n z^(n-1)
      vec2 step = cdivF(f, df);
      z -= step;
      if (dot(step, step) < 1e-14) { usedIter = i; break; }
    }
    float ang = atan(z.y, z.x) / 6.28318 + 0.5;  // which root (0..1)
    float t = uColorOffset + ang + float(usedIter) * 0.03 * uColorScale;
    vec3 col = palette(t);
    if (uInvert == 1) col = vec3(1.0) - col;
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  bool isInt = abs(uExponent - float(p)) < 0.001 && p >= 2;
  int iterOut = uMaxIter;
  float dzOut = 0.0;
  bool escaped = false;

  if (isInt) {
    vec2 posR = dsAdd(uCenterRe, dsMul(dsSet(uv.x * aspect), uSpan));
    vec2 posI = dsAdd(uCenterIm, dsMul(dsSet(uv.y), uSpan));
    vec2 zr, zi, cr, ci;
    if (uType == 1) { zr = posR; zi = posI; cr = uJuliaCRe; ci = uJuliaCIm; }
    else            { zr = dsSet(0.0); zi = dsSet(0.0); cr = posR; ci = posI; }

    for (int i = 0; i < MAX_ITER; i++) {
      if (i >= uMaxIter) break;
      if (uType == 2) { zr = dsAbs(zr); zi = dsAbs(zi); }  // Burning Ship
      if (uType == 3) { zi = dsNeg(zi); }                  // Tricorn (conjugate)
      vec2 wr = zr, wi = zi;
      for (int k = 1; k < MAX_POW; k++) {
        if (k >= p) break;
        cmul(wr, wi, zr, zi, wr, wi);
      }
      if (uType == 4) { wr = dsAbs(wr); }                  // Celtic
      if (uType == 5) { wr = dsAbs(wr); wi = dsAbs(wi); }  // Buffalo
      zr = dsAdd(wr, cr);
      zi = dsAdd(wi, ci);
      float dz = zr.x * zr.x + zi.x * zi.x;
      if (dz > uEscape2) { iterOut = i; dzOut = dz; escaped = true; break; }
    }
  } else {
    vec2 z, c;
    if (uType == 1) { z = pos; c = vec2(uJuliaCRe.x, uJuliaCIm.x); }
    else            { z = vec2(0.0); c = pos; }
    for (int i = 0; i < MAX_ITER; i++) {
      if (i >= uMaxIter) break;
      if (uType == 2) z = abs(z);
      if (uType == 3) z.y = -z.y;
      z = cpow(z, uExponent);
      if (uType == 4) z.x = abs(z.x);
      if (uType == 5) z = abs(z);
      z += c;
      float dz = dot(z, z);
      if (dz > uEscape2) { iterOut = i; dzOut = dz; escaped = true; break; }
    }
  }

  if (!escaped) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  float mu = float(iterOut) + 1.0 - log(0.5 * log(dzOut)) / log(uExponent);
  float t = uColorOffset + uColorScale * mu * 0.02;
  vec3 col = palette(t);
  if (uInvert == 1) col = vec3(1.0) - col;
  gl_FragColor = vec4(col, 1.0);
}
`;
