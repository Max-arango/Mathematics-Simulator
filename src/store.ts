import { create } from "zustand";
import { FRACTAL_BY_ID, FRACTALS, defaultParams } from "./fractals/registry.ts";
import type { Viewport } from "./fractals/types.ts";

export const PALETTES = ["Classic", "Fire", "Ocean", "Rainbow", "Neon", "Grayscale"];

export type AnimMode = "loop" | "pingpong" | "once";

export interface AnimState {
  key: string | null; // parameter being animated
  from: number;
  to: number;
  speed: number; // full sweeps per second
  steps: number; // 0 = continuous; >0 = snap to N discrete stops
  mode: AnimMode;
  playing: boolean;
  phase: number; // 0..1 progress along the sweep
  dir: 1 | -1;
}

export type AppMode = "calculator" | "fractal" | "bloch" | "fourd" | "topo" | "docs";

interface State {
  appMode: AppMode;
  setAppMode: (m: AppMode) => void;
  activeId: string;
  params: Record<string, number>;
  view: Viewport;
  palette: number;
  colorOffset: number;
  colorScale: number;
  invert: boolean;
  pickMode: boolean;
  anim: AnimState;
  customExpr: string; // f(z,c) for the Custom escape-time fractal
  complexExpr: string; // f(z) for the Complex domain-coloring view
  exprError: string | null;

  setExpr: (source: string) => void;
  setExprError: (err: string | null) => void;
  setAnim: (patch: Partial<AnimState>) => void;
  /** Point the animator at a parameter and seed from/to with its full range. */
  animBind: (key: string) => void;
  animToggle: () => void;
  /** Advance the animation by dt seconds and write the parameter. */
  animTick: (dt: number) => void;
  setPickMode: (on: boolean) => void;
  setActive: (id: string) => void;
  setParam: (key: string, value: number) => void;
  resetParams: () => void;
  setView: (v: Partial<Viewport>) => void;
  zoomAt: (fracX: number, fracY: number, aspect: number, factor: number) => void;
  panBy: (dRe: number, dIm: number) => void;
  resetView: () => void;
  setColor: (patch: Partial<Pick<State, "palette" | "colorOffset" | "colorScale" | "invert">>) => void;
  /** Jump to Julia using a complex point picked on the Mandelbrot plane. */
  juliaFromPoint: (cRe: number, cIm: number) => void;
  loadConfig: (cfg: ExportConfig) => void;
}

export interface ExportConfig {
  algorithm: string;
  params: Record<string, number>;
  view: Viewport;
  color: { palette: number; colorOffset: number; colorScale: number; invert: boolean };
}

export const useStore = create<State>((set) => ({
  appMode: "calculator",
  setAppMode: (m) => set({ appMode: m }),
  activeId: "mandelbrot",
  params: defaultParams(FRACTAL_BY_ID.mandelbrot),
  view: { ...FRACTAL_BY_ID.mandelbrot.view },
  palette: 0,
  colorOffset: 0,
  colorScale: 1,
  invert: false,
  pickMode: false,
  anim: { key: null, from: 0, to: 1, speed: 0.25, steps: 0, mode: "pingpong", playing: false, phase: 0, dir: 1 },
  customExpr: "z^2 + c",
  complexExpr: "sin(z)",
  exprError: null,

  setExpr: (source) =>
    set((s) => (FRACTAL_BY_ID[s.activeId]?.domain ? { complexExpr: source } : { customExpr: source })),
  setExprError: (err) => set({ exprError: err }),
  setAnim: (patch) => set((s) => ({ anim: { ...s.anim, ...patch } })),
  animBind: (key) => {
    const def = FRACTAL_BY_ID[useStore.getState().activeId].params.find((p) => p.key === key);
    if (!def) return;
    set((s) => ({ anim: { ...s.anim, key, from: def.min, to: def.max, phase: 0, dir: 1 } }));
  },
  animToggle: () => set((s) => ({ anim: { ...s.anim, playing: !s.anim.playing } })),
  animTick: (dt) => {
    const s = useStore.getState();
    const a = s.anim;
    if (!a.playing || !a.key || !(a.key in s.params)) return;
    {
      let phase = a.phase + a.dir * a.speed * dt;
      let dir = a.dir;
      let playing = true;
      if (a.mode === "pingpong") {
        if (phase > 1) { phase = 2 - phase; dir = -1; }
        else if (phase < 0) { phase = -phase; dir = 1; }
      } else if (a.mode === "loop") {
        phase = ((phase % 1) + 1) % 1;
      } else { // once
        if (phase >= 1) { phase = 1; playing = false; }
      }
      const q = a.steps > 0 ? Math.round(phase * a.steps) / a.steps : phase;
      const value = a.from + (a.to - a.from) * q;
      set({ anim: { ...a, phase, dir, playing }, params: { ...s.params, [a.key]: value } });
    }
  },
  setPickMode: (on) => set({ pickMode: on }),
  setActive: (id) => {
    const f = FRACTAL_BY_ID[id];
    if (!f) return;
    set((s) => ({ activeId: id, params: defaultParams(f), view: { ...f.view }, anim: { ...s.anim, key: null, playing: false } }));
  },
  setParam: (key, value) => set((s) => ({ params: { ...s.params, [key]: value } })),
  resetParams: () => set((s) => ({ params: defaultParams(FRACTAL_BY_ID[s.activeId]) })),
  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
  zoomAt: (fracX, fracY, aspect, factor) =>
    set((s) => {
      const { centerRe, centerIm, span } = s.view;
      // Complex coordinate under the cursor before zoom.
      const px = centerRe + (fracX - 0.5) * span * aspect;
      const py = centerIm + (fracY - 0.5) * span;
      const newSpan = span * factor;
      // Keep that coordinate under the cursor after zoom.
      return {
        view: {
          centerRe: px - (fracX - 0.5) * newSpan * aspect,
          centerIm: py - (fracY - 0.5) * newSpan,
          span: newSpan,
        },
      };
    }),
  panBy: (dRe, dIm) => set((s) => ({ view: { ...s.view, centerRe: s.view.centerRe + dRe, centerIm: s.view.centerIm + dIm } })),
  resetView: () => set((s) => ({ view: { ...FRACTAL_BY_ID[s.activeId].view } })),
  setColor: (patch) => set(patch),
  juliaFromPoint: (cRe, cIm) => {
    const f = FRACTAL_BY_ID.julia;
    set({ activeId: "julia", view: { ...f.view }, params: { ...defaultParams(f), cRe, cIm }, pickMode: false });
  },
  loadConfig: (cfg) => {
    if (!FRACTAL_BY_ID[cfg.algorithm]) return;
    set({
      activeId: cfg.algorithm,
      params: { ...defaultParams(FRACTAL_BY_ID[cfg.algorithm]), ...cfg.params },
      view: { ...cfg.view },
      palette: cfg.color.palette,
      colorOffset: cfg.color.colorOffset,
      colorScale: cfg.color.colorScale,
      invert: cfg.color.invert,
    });
  },
}));

export function currentConfig(): ExportConfig {
  const s = useStore.getState();
  return {
    algorithm: s.activeId,
    params: s.params,
    view: s.view,
    color: { palette: s.palette, colorOffset: s.colorOffset, colorScale: s.colorScale, invert: s.invert },
  };
}

export { FRACTALS };
