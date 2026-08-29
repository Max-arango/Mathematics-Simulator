import { VERT, FRAG } from "./shaders.ts";

export interface RenderState {
  width: number;
  height: number;
  centerRe: number;
  centerIm: number;
  span: number;
  maxIter: number;
  escapeRadius: number;
  exponent: number;
  shaderType: number;
  juliaCRe: number;
  juliaCIm: number;
  palette: number;
  colorOffset: number;
  colorScale: number;
  invert: boolean;
  /** true = use the compiled custom-expression program instead of the builtin one */
  custom: boolean;
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return s;
}

function linkProgram(gl: WebGLRenderingContext, frag: string): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

const BUILTIN_UNIFORMS = [
  "uResolution", "uCenterRe", "uCenterIm", "uSpan", "uMaxIter", "uEscape2", "uExponent",
  "uType", "uJuliaCRe", "uJuliaCIm", "uPalette", "uColorOffset", "uColorScale", "uInvert",
];
const CUSTOM_UNIFORMS = [
  "uResolution", "uCenter", "uSpan", "uMaxIter", "uEscape2", "uType", "uJuliaC", "uP",
  "uPalette", "uColorOffset", "uColorScale", "uInvert",
];

type Locs = Record<string, WebGLUniformLocation | null>;

function locate(gl: WebGLRenderingContext, program: WebGLProgram, names: string[]): Locs {
  const loc: Locs = {};
  for (const n of names) loc[n] = gl.getUniformLocation(program, n);
  return loc;
}

/** Split a float64 into (hi, lo) float32 halves for df64 shader math. */
function split(x: number): [number, number] {
  const hi = Math.fround(x);
  return [hi, x - hi];
}

export class Renderer {
  private gl: WebGLRenderingContext;
  private buf: WebGLBuffer;
  private builtin: { program: WebGLProgram; loc: Locs };
  private customProg: { program: WebGLProgram; loc: Locs } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error("WebGL not supported in this browser.");
    this.gl = gl;

    const program = linkProgram(gl, FRAG);
    this.builtin = { program, loc: locate(gl, program, BUILTIN_UNIFORMS) };

    // Full-screen quad (single big triangle).
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }

  private bindQuad(program: WebGLProgram) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  }

  /** Compile/replace the custom-expression program. Returns an error string or null. */
  setCustomFragment(frag: string): string | null {
    const gl = this.gl;
    try {
      const program = linkProgram(gl, frag);
      if (this.customProg) gl.deleteProgram(this.customProg.program);
      this.customProg = { program, loc: locate(gl, program, CUSTOM_UNIFORMS) };
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  render(s: RenderState) {
    const gl = this.gl;
    gl.viewport(0, 0, s.width, s.height);
    if (s.custom) this.renderCustom(s);
    else this.renderBuiltin(s);
  }

  private renderBuiltin(s: RenderState) {
    const gl = this.gl;
    const { program, loc } = this.builtin;
    gl.useProgram(program);
    this.bindQuad(program);
    gl.uniform2f(loc.uResolution, s.width, s.height);
    gl.uniform2f(loc.uCenterRe, ...split(s.centerRe));
    gl.uniform2f(loc.uCenterIm, ...split(s.centerIm));
    gl.uniform2f(loc.uSpan, ...split(s.span));
    gl.uniform1i(loc.uMaxIter, Math.round(s.maxIter));
    gl.uniform1f(loc.uEscape2, s.escapeRadius * s.escapeRadius);
    gl.uniform1f(loc.uExponent, s.exponent);
    gl.uniform1i(loc.uType, s.shaderType);
    gl.uniform2f(loc.uJuliaCRe, ...split(s.juliaCRe));
    gl.uniform2f(loc.uJuliaCIm, ...split(s.juliaCIm));
    gl.uniform1i(loc.uPalette, s.palette);
    gl.uniform1f(loc.uColorOffset, s.colorOffset);
    gl.uniform1f(loc.uColorScale, s.colorScale);
    gl.uniform1i(loc.uInvert, s.invert ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private renderCustom(s: RenderState) {
    const gl = this.gl;
    if (!this.customProg) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    const { program, loc } = this.customProg;
    gl.useProgram(program);
    this.bindQuad(program);
    gl.uniform2f(loc.uResolution, s.width, s.height);
    gl.uniform2f(loc.uCenter, s.centerRe, s.centerIm);
    gl.uniform1f(loc.uSpan, s.span);
    gl.uniform1i(loc.uMaxIter, Math.round(s.maxIter));
    gl.uniform1f(loc.uEscape2, s.escapeRadius * s.escapeRadius);
    gl.uniform1i(loc.uType, s.shaderType);
    gl.uniform2f(loc.uJuliaC, s.juliaCRe, s.juliaCIm);
    gl.uniform1f(loc.uP, s.exponent);
    gl.uniform1i(loc.uPalette, s.palette);
    gl.uniform1f(loc.uColorOffset, s.colorOffset);
    gl.uniform1f(loc.uColorScale, s.colorScale);
    gl.uniform1i(loc.uInvert, s.invert ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
