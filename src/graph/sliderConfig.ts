import { parse } from "../mathlab/core/parser.ts";
import { evaluate, type Env } from "../mathlab/core/eval.ts";
import type { Slider } from "../mathlab/graph/scene.ts";

// Per-slider bounds. Stored as strings so they can reference other variables
// (e.g. max = "n - 1"): a slider limited to {0, 2, 4, …, n−1} is min 0, max n−1,
// step 2. Evaluated against the live scene env each render.
export interface SliderCfg { min: string; max: string; step: string }

export function evalExpr(expr: string, env: Env, fallback: number): number {
  if (expr.trim() === "") return fallback;
  try {
    const v = evaluate(parse(expr), env);
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export interface ResolvedSlider { min: number; max: number; step: number }

export function resolveSlider(s: Slider, cfg: SliderCfg | undefined, env: Env): ResolvedSlider {
  if (!cfg) return { min: s.min, max: s.max, step: s.step };
  return {
    min: evalExpr(cfg.min, env, s.min),
    max: evalExpr(cfg.max, env, s.max),
    step: Math.max(0, evalExpr(cfg.step, env, s.step)),
  };
}

/** Snap a value to the nearest step boundary measured from min. */
export function snap(v: number, min: number, step: number): number {
  if (!(step > 0)) return v;
  const snapped = min + Math.round((v - min) / step) * step;
  // Kill floating-point dust from the multiply (e.g. 0.30000000000000004).
  return Number(snapped.toPrecision(12));
}
