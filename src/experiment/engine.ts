import { parse } from "../mathlab/core/parser.ts";
import { print } from "../mathlab/core/print.ts";
import { freeVars, num, type Node } from "../mathlab/core/ast.ts";
import { inspect } from "../inspector/engine.ts";
import type { InspectionResult } from "../inspector/types.ts";
import type { Cell, Experiment, ParameterCell, ExpressionCell } from "./types.ts";

export type CellOutput =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "parameter"; value: number }
  | { kind: "expression"; latex: string; printed: string; vars: string[]; note?: string }
  | { kind: "analysis"; result: InspectionResult };

// Replace variables that name a parameter with their numeric value.
function substitute(n: Node, params: Map<string, number>): Node {
  switch (n.t) {
    case "var": return params.has(n.name) ? num(params.get(n.name)!) : n;
    case "num": case "const": return n;
    case "neg": return { t: "neg", a: substitute(n.a, params) };
    case "call": return { t: "call", name: n.name, args: n.args.map((a) => substitute(a, params)) };
    default: return { t: n.t, a: substitute(n.a, params), b: substitute(n.b, params) } as Node;
  }
}

function paramMap(exp: Experiment): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of exp.cells) if (c.kind === "parameter") m.set(c.name, c.value);
  return m;
}
function exprByName(exp: Experiment): Map<string, ExpressionCell> {
  const m = new Map<string, ExpressionCell>();
  for (const c of exp.cells) if (c.kind === "expression") m.set(c.name, c);
  return m;
}

/** Deterministically derive a cell's output from the canonical experiment. Pure. */
export function run(exp: Experiment, cellId: string): CellOutput {
  const cell = exp.cells.find((c) => c.id === cellId);
  if (!cell) return { kind: "error", message: "cell not found" };
  const params = paramMap(exp);

  switch (cell.kind) {
    case "markdown": return { kind: "none" };
    case "parameter": return { kind: "parameter", value: cell.value };
    case "expression": {
      try {
        const ast = parse(cell.source);
        const resolved = substitute(ast, params);
        const vars = [...freeVars(resolved)].sort();
        return { kind: "expression", latex: cell.source, printed: print(resolved), vars, note: vars.length ? `free variables: ${vars.join(", ")}` : "constant" };
      } catch (e) { return { kind: "error", message: e instanceof Error ? e.message : String(e) }; }
    }
    case "analysis": {
      const target = exprByName(exp).get(cell.targetName);
      if (!target) return { kind: "error", message: `no expression named "${cell.targetName}"` };
      try {
        const resolved = substitute(parse(target.source), params);
        return { kind: "analysis", result: inspect({ kind: "expression", source: print(resolved) }) };
      } catch (e) { return { kind: "error", message: e instanceof Error ? e.message : String(e) }; }
    }
  }
}

export function runAll(exp: Experiment): Record<string, CellOutput> {
  const out: Record<string, CellOutput> = {};
  for (const c of exp.cells) out[c.id] = run(exp, c.id);
  return out;
}

/** Upstream cell ids each cell depends on (parameters it uses; analysis → its expression + params). */
export function dependencies(exp: Experiment): Record<string, string[]> {
  const params = exp.cells.filter((c): c is ParameterCell => c.kind === "parameter");
  const paramIdByName = new Map(params.map((p) => [p.name, p.id]));
  const exprCells = exprByName(exp);
  const deps: Record<string, string[]> = {};

  const paramsUsed = (source: string): string[] => {
    try { return [...freeVars(parse(source))].filter((v) => paramIdByName.has(v)).map((v) => paramIdByName.get(v)!); }
    catch { return []; }
  };
  for (const c of exp.cells) {
    if (c.kind === "expression") deps[c.id] = paramsUsed(c.source);
    else if (c.kind === "analysis") {
      const tgt = exprCells.get(c.targetName);
      deps[c.id] = tgt ? [tgt.id, ...paramsUsed(tgt.source)] : [];
    } else deps[c.id] = [];
  }
  return deps;
}

/** Cells whose output depends (transitively) on the given cell. */
export function dependents(exp: Experiment, cellId: string): string[] {
  const deps = dependencies(exp);
  const out = new Set<string>();
  let frontier = [cellId];
  while (frontier.length) {
    const next: string[] = [];
    for (const c of exp.cells) if (deps[c.id]?.some((d) => frontier.includes(d)) && !out.has(c.id)) { out.add(c.id); next.push(c.id); }
    frontier = next;
  }
  return [...out];
}

export type { Cell };
