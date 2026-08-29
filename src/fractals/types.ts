export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export type FractalCategory = "escape-time" | "newton" | "custom" | "complex";

export interface FractalDef {
  id: string;
  name: string;
  category: FractalCategory;
  /** integer discriminant passed to the shader (see fractal.frag) */
  shaderType: number;
  /** true if this fractal is driven by a fixed complex constant c (Julia-style) */
  usesJuliaC: boolean;
  /** true = rendered by the AST→GLSL custom-expression program (shared math core) */
  custom?: boolean;
  /** true = domain-coloring of f(z) rather than escape-time iteration */
  domain?: boolean;
  params: ParamDef[];
  /** default viewport for a fresh selection */
  view: { centerRe: number; centerIm: number; span: number };
}

export interface Viewport {
  centerRe: number;
  centerIm: number;
  /** vertical span of the view in complex-plane units; smaller = deeper zoom */
  span: number;
}
