import type { FractalDef, ParamDef } from "./types.ts";

const exponent: ParamDef = { key: "exponent", label: "Exponent (p)", min: 2, max: 8, step: 0.05, default: 2 };
const iterations: ParamDef = { key: "iterations", label: "Max iterations", min: 30, max: 2000, step: 1, default: 300 };
const escapeRadius: ParamDef = { key: "escapeRadius", label: "Escape radius", min: 2, max: 50, step: 0.5, default: 8 };
const cRe: ParamDef = { key: "cRe", label: "Re(c)", min: -2, max: 2, step: 0.001, default: -0.8 };
const cIm: ParamDef = { key: "cIm", label: "Im(c)", min: -2, max: 2, step: 0.001, default: 0.156 };
const degree: ParamDef = { key: "exponent", label: "Degree (n)", min: 3, max: 8, step: 1, default: 3 };

const escapeTime = [exponent, iterations, escapeRadius];

export const FRACTALS: FractalDef[] = [
  {
    id: "mandelbrot",
    name: "Mandelbrot",
    category: "escape-time",
    shaderType: 0,
    usesJuliaC: false,
    params: [exponent, iterations, escapeRadius],
    view: { centerRe: -0.5, centerIm: 0, span: 2.6 },
  },
  {
    id: "julia",
    name: "Julia",
    category: "escape-time",
    shaderType: 1,
    usesJuliaC: true,
    params: [exponent, iterations, escapeRadius, cRe, cIm],
    view: { centerRe: 0, centerIm: 0, span: 3.2 },
  },
  {
    id: "burning-ship",
    name: "Burning Ship",
    category: "escape-time",
    shaderType: 2,
    usesJuliaC: false,
    params: escapeTime,
    view: { centerRe: -0.5, centerIm: -0.5, span: 3.2 },
  },
  {
    id: "tricorn",
    name: "Tricorn",
    category: "escape-time",
    shaderType: 3,
    usesJuliaC: false,
    params: escapeTime,
    view: { centerRe: 0, centerIm: 0, span: 3.2 },
  },
  {
    id: "celtic",
    name: "Celtic",
    category: "escape-time",
    shaderType: 4,
    usesJuliaC: false,
    params: escapeTime,
    view: { centerRe: -0.4, centerIm: 0, span: 3.0 },
  },
  {
    id: "buffalo",
    name: "Buffalo",
    category: "escape-time",
    shaderType: 5,
    usesJuliaC: false,
    params: escapeTime,
    view: { centerRe: -0.5, centerIm: -0.5, span: 3.4 },
  },
  {
    id: "newton",
    name: "Newton",
    category: "newton",
    shaderType: 10,
    usesJuliaC: false,
    params: [degree, iterations],
    view: { centerRe: 0, centerIm: 0, span: 3.0 },
  },
  {
    id: "custom",
    name: "Custom f(z,c)",
    category: "custom",
    shaderType: 0, // uType 0 = escape-time, c = pixel
    usesJuliaC: false,
    custom: true,
    params: [exponent, iterations, escapeRadius],
    view: { centerRe: -0.5, centerIm: 0, span: 2.6 },
  },
  {
    id: "complex",
    name: "Complex f(z)",
    category: "complex",
    shaderType: 2, // uType 2 = domain coloring
    usesJuliaC: false,
    custom: true,
    domain: true,
    params: [exponent],
    view: { centerRe: 0, centerIm: 0, span: 6.0 },
  },
];

export const FRACTAL_BY_ID = Object.fromEntries(FRACTALS.map((f) => [f.id, f]));

export function defaultParams(f: FractalDef): Record<string, number> {
  return Object.fromEntries(f.params.map((p) => [p.key, p.default]));
}
