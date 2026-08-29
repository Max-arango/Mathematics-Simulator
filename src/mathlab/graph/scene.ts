import { parseStatement } from "../core/parser.ts";
import { evaluate, type Env, type UserFunc } from "../core/eval.ts";
import { freeVars, sub, type Node } from "../core/ast.ts";

export type PlotMode = "2d" | "3d";

export interface SceneInput {
  id: string;
  source: string;
  color: string;
  visible: boolean;
}

export interface Slider { name: string; value: number; min: number; max: number; step: number }
export interface Plot { id: string; color: string; body: Node; mode: PlotMode }
/** Implicit relation rendered as its zero set: g = lhs - rhs = 0. */
export interface ImplicitPlot { id: string; color: string; g: Node; mode: PlotMode }

export interface Scene {
  env: Env;
  plots: Plot[];
  implicits: ImplicitPlot[];
  sliders: Slider[];
  errors: Record<string, string>; // line id -> message
}

const PLOT_VARS: Record<PlotMode, string[]> = { "2d": ["x"], "3d": ["x", "y"] };

/**
 * Build a renderable scene from raw expression lines.
 * - `f(x)=…` / `f(x,y)=…`  → registered as a function AND auto-plotted.
 * - `y = expr(x)` or a bare `expr`      → plotted.
 * - `name = <number>`                   → slider (value overridable via `overrides`).
 * - `name = expr` (no plot var)         → derived scalar.
 * - any free variable left undefined    → auto-slider (default 1).
 */
export function buildScene(lines: SceneInput[], mode: PlotMode, overrides: Record<string, number>): Scene {
  const pv = PLOT_VARS[mode];
  const pvSet = new Set(pv);
  // The dependent axis (y in 2D, z in 3D) is a coordinate, never a slider.
  const outputVar = mode === "3d" ? "z" : "y";
  const reserved = new Set([...pv, outputVar]);
  const funcs: Record<string, UserFunc> = {};
  const numericAssigns: { name: string; val: number }[] = [];
  const derivedAssigns: { name: string; body: Node }[] = [];
  const plotItems: { id: string; color: string; body: Node }[] = [];
  const implicits: ImplicitPlot[] = [];
  const errors: Record<string, string> = {};

  for (const line of lines) {
    if (!line.source.trim() || !line.visible) continue;
    let stmt;
    try {
      stmt = parseStatement(line.source);
    } catch (e) {
      errors[line.id] = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (stmt.kind === "func") {
      funcs[stmt.name] = { params: stmt.params, body: stmt.body };
      // Auto-plot if its parameters match the current plot dimension.
      if (stmt.params.length === pv.length) {
        plotItems.push({ id: line.id, color: line.color, body: subst(stmt.body, stmt.params, pv) });
      }
    } else if (stmt.kind === "assign") {
      if (stmt.name === outputVar || [...freeVars(stmt.body)].some((v) => pvSet.has(v))) {
        plotItems.push({ id: line.id, color: line.color, body: stmt.body });
      } else if (stmt.body.t === "num") {
        numericAssigns.push({ name: stmt.name, val: overrides[stmt.name] ?? stmt.body.v });
      } else {
        derivedAssigns.push({ name: stmt.name, body: stmt.body });
      }
    } else if (stmt.kind === "equation") {
      // Relation lhs = rhs → implicit zero set of g = lhs - rhs.
      // Explicit height "z = f(x,y)" is handled by the assign branch above;
      // here z is a genuine coordinate (e.g. x^2 + y^2 + z^2 = 9).
      const g = sub(stmt.lhs, stmt.rhs);
      const fv = freeVars(g);
      const known = new Set([...reserved, ...pv]);
      if ([...fv].every((v) => known.has(v)) && fv.size > 0) {
        implicits.push({ id: line.id, color: line.color, g, mode });
      } else {
        errors[line.id] = `Equation must use only ${mode === "3d" ? "x, y, z" : "x, y"}`;
      }
    } else {
      plotItems.push({ id: line.id, color: line.color, body: stmt.body });
    }
  }

  // Known names: explicit scalars, derived scalars, functions.
  const defined = new Set<string>([...numericAssigns.map((a) => a.name), ...derivedAssigns.map((a) => a.name), ...Object.keys(funcs)]);
  // Auto-sliders: free vars in any plot/derived body that are neither plot vars nor defined.
  const autoNames = new Set<string>();
  for (const p of plotItems) for (const v of freeVars(p.body)) if (!reserved.has(v) && !defined.has(v)) autoNames.add(v);
  for (const d of derivedAssigns) for (const v of freeVars(d.body)) if (!reserved.has(v) && !defined.has(v)) autoNames.add(v);

  // Build the numeric environment.
  const vars: Record<string, number> = {};
  for (const a of numericAssigns) vars[a.name] = a.val;
  for (const name of autoNames) vars[name] = overrides[name] ?? 1;
  // Resolve derived scalars (retry a few times for inter-dependencies).
  const env: Env = { vars, funcs };
  for (let pass = 0; pass < derivedAssigns.length + 1; pass++) {
    let changed = false;
    for (const d of derivedAssigns) {
      if (Number.isFinite(vars[d.name])) continue;
      try {
        const v = evaluate(d.body, env);
        if (Number.isFinite(v)) { vars[d.name] = v; changed = true; }
      } catch { /* unresolved this pass */ }
    }
    if (!changed) break;
  }

  const sliders: Slider[] = [
    ...numericAssigns.map((a) => sliderFor(a.name, a.val)),
    ...[...autoNames].map((name) => sliderFor(name, vars[name])),
  ];

  const plots: Plot[] = plotItems.map((p) => ({ id: p.id, color: p.color, body: p.body, mode }));
  return { env, plots, implicits, sliders, errors };
}

/** Pick a symmetric slider range around the initial value. */
function sliderFor(name: string, value: number): Slider {
  const mag = Math.max(10, Math.abs(value) * 2);
  return { name, value, min: -mag, max: mag, step: mag / 100 };
}

/** Rename a function's formal parameters to the plot variables (x[,y]). */
function subst(n: Node, from: string[], to: string[]): Node {
  const map: Record<string, string> = {};
  from.forEach((f, i) => (map[f] = to[i]));
  const go = (node: Node): Node => {
    switch (node.t) {
      case "var": return map[node.name] ? { t: "var", name: map[node.name] } : node;
      case "num": case "const": return node;
      case "neg": return { t: "neg", a: go(node.a) };
      case "call": return { t: "call", name: node.name, args: node.args.map(go) };
      default: return { t: node.t, a: go(node.a), b: go(node.b) } as Node;
    }
  };
  return go(n);
}
