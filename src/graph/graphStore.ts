import { create } from "zustand";
import type { PlotMode, SceneInput } from "../mathlab/graph/scene.ts";
import type { SliderCfg } from "./sliderConfig.ts";

export const PLOT_COLORS = ["#38e0c8", "#f26d6d", "#7c9cff", "#f2c94c", "#bb6bd9", "#6fcf97", "#f2994a", "#eb5fa0"];

let idSeq = 1;
const newId = () => `e${idSeq++}`;

export interface ExprLine extends SceneInput {}

export type AnalysisTool = "locate" | "derivative" | "integral";
export type AnimMode = "loop" | "pingpong";

export interface SliderAnim {
  name: string | null; // variable currently animating (one at a time)
  playing: boolean;
  speed: number;        // full sweeps per second
  mode: AnimMode;
  dir: 1 | -1;
}

interface GraphState {
  mode: PlotMode;
  lines: ExprLine[];
  sliderValues: Record<string, number>; // persisted slider overrides by variable name
  sliderConfig: Record<string, SliderCfg>; // per-variable min/max/step (expressions)
  anim: SliderAnim;
  zRange: number; // 3D vertical half-extent: z axis / box / clamp span [-zRange, zRange]
  tool: AnalysisTool;
  a: number; // locator / derivative point / integral lower bound
  b: number; // integral upper bound

  setMode: (m: PlotMode) => void;
  addLine: (source?: string) => void;
  updateLine: (id: string, source: string) => void;
  removeLine: (id: string) => void;
  toggleLine: (id: string) => void;
  setSlider: (name: string, value: number) => void;
  setSliderConfig: (name: string, patch: Partial<SliderCfg>) => void;
  setAnim: (patch: Partial<SliderAnim>) => void;
  toggleAnim: (name: string) => void;
  setTool: (t: AnalysisTool) => void;
  setA: (a: number) => void;
  setB: (b: number) => void;
  setZRange: (z: number) => void;
}

const DEFAULT_CFG: SliderCfg = { min: "-10", max: "10", step: "0.1" };

function line(source: string): ExprLine {
  return { id: newId(), source, color: PLOT_COLORS[(idSeq - 1) % PLOT_COLORS.length], visible: true };
}

export const useGraph = create<GraphState>((set) => ({
  mode: "2d",
  lines: [line("sin(x)"), line("x^2"), line("")],
  sliderValues: {},
  sliderConfig: {},
  anim: { name: null, playing: false, speed: 0.3, mode: "loop", dir: 1 },
  zRange: 6,
  tool: "locate",
  a: 1,
  b: 3,

  setMode: (m) => set({ mode: m }),
  addLine: (source = "") => set((s) => ({ lines: [...s.lines, line(source)] })),
  updateLine: (id, source) => set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, source } : l)) })),
  removeLine: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),
  toggleLine: (id) => set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)) })),
  setSlider: (name, value) => set((s) => ({ sliderValues: { ...s.sliderValues, [name]: value } })),
  setSliderConfig: (name, patch) =>
    set((s) => ({ sliderConfig: { ...s.sliderConfig, [name]: { ...DEFAULT_CFG, ...s.sliderConfig[name], ...patch } } })),
  setAnim: (patch) => set((s) => ({ anim: { ...s.anim, ...patch } })),
  toggleAnim: (name) =>
    set((s) =>
      s.anim.name === name
        ? { anim: { ...s.anim, playing: !s.anim.playing } }
        : { anim: { ...s.anim, name, playing: true, dir: 1 } },
    ),
  setTool: (t) => set({ tool: t }),
  setA: (a) => set({ a }),
  setB: (b) => set({ b }),
  setZRange: (z) => set({ zRange: Math.max(1, z) }),
}));
