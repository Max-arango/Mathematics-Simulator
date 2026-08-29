import { parse } from "../mathlab/core/parser.ts";
import { compile2, type Env } from "../mathlab/core/eval.ts";
import type { Shape } from "./shapes.ts";
import type { Vec4 } from "./vec4.ts";

export interface Param4Exprs { x: string; y: string; z: string; w: string }

const ENV: Env = { vars: {}, funcs: {} };

/**
 * A 2-parameter surface embedded in 4-space: (x,y,z,w)(u,v) over a grid.
 * Uses the shared parser/evaluator — same engine as the calculator. Default
 * u,v run 0…2π (periodic surfaces close up). Returns a wireframe grid.
 */
export function buildParametric(exprs: Param4Exprs, res: number): { shape: Shape; error: string | null } {
  let fx, fy, fz, fw;
  try {
    fx = compile2(parse(exprs.x), "u", "v", ENV);
    fy = compile2(parse(exprs.y), "u", "v", ENV);
    fz = compile2(parse(exprs.z), "u", "v", ENV);
    fw = compile2(parse(exprs.w), "u", "v", ENV);
  } catch (e) {
    return { shape: { vertices: [], edges: [] }, error: e instanceof Error ? e.message : String(e) };
  }

  const n = res;
  const at = (i: number) => (i * 2 * Math.PI) / n;
  const vertices: Vec4[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const u = at(i), v = at(j);
      vertices.push([fx(u, v), fy(u, v), fz(u, v), fw(u, v)]);
    }
  const idx = (i: number, j: number) => j * (n + 1) + i;
  const edges: [number, number][] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      if (i < n) edges.push([idx(i, j), idx(i + 1, j)]);
      if (j < n) edges.push([idx(i, j), idx(i, j + 1)]);
    }
  return { shape: { vertices, edges }, error: null };
}

export const PARAM_PRESETS: Record<string, Param4Exprs> = {
  "Clifford torus": { x: "cos(u)", y: "sin(u)", z: "cos(v)", w: "sin(v)" },
  "Hopf fibration": { x: "cos(u)*cos(v)", y: "cos(u)*sin(v)", z: "sin(u)*cos(v)", w: "sin(u)*sin(v)" },
  "Twisted torus": { x: "cos(u)", y: "sin(u)", z: "cos(v)", w: "sin(v)*cos(u)" },
  "Wave torus": { x: "cos(u)", y: "sin(u)", z: "cos(v) + 0.35*sin(4*u)", w: "sin(v)" },
  "2-sphere in 4D": { x: "sin(v)*cos(u)", y: "sin(v)*sin(u)", z: "cos(v)", w: "0.6*sin(2*u)*sin(v)" },
  "Trefoil band": { x: "cos(u) + 0.3*cos(3*v)", y: "sin(u) + 0.3*sin(3*v)", z: "cos(v)", w: "sin(v)" },
  "Spiral shell": { x: "(1 + 0.5*cos(v))*cos(u)", y: "(1 + 0.5*cos(v))*sin(u)", z: "0.5*sin(v)", w: "0.5*sin(u)*cos(v)" },
  "Klein-ish": { x: "cos(u)*(1 + 0.4*cos(v))", y: "sin(u)*(1 + 0.4*cos(v))", z: "0.4*sin(v)*cos(u/2)", w: "0.4*sin(v)*sin(u/2)" },
};
