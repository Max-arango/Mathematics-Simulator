import { create } from "zustand";
import { type Angles6, ZERO_ANGLES } from "./vec4.ts";
import { PARAM_PRESETS, type Param4Exprs } from "./parametric.ts";

export type ShapeKind = "tesseract" | "cell5" | "cell16" | "cell24" | "parametric";

interface FourState {
  kind: ShapeKind;
  angles: Angles6;
  dist: number;         // 4D projection distance
  res: number;          // parametric grid resolution
  exprs: Param4Exprs;
  anim: { playing: boolean; speed: number };

  setKind: (k: ShapeKind) => void;
  setAngle: (plane: keyof Angles6, value: number) => void;
  bumpAngles: (dxw: number, dyz: number) => void; // used by the animation driver
  resetAngles: () => void;
  setDist: (d: number) => void;
  setRes: (r: number) => void;
  setExpr: (key: keyof Param4Exprs, value: string) => void;
  setPreset: (e: Param4Exprs) => void;
  toggleAnim: () => void;
  setSpeed: (s: number) => void;
}

export const useFour = create<FourState>((set) => ({
  kind: "tesseract",
  angles: { ...ZERO_ANGLES },
  dist: 3,
  res: 24,
  exprs: { ...PARAM_PRESETS["Clifford torus"] },
  anim: { playing: true, speed: 0.4 },

  setKind: (kind) => set({ kind }),
  setAngle: (plane, value) => set((s) => ({ angles: { ...s.angles, [plane]: value } })),
  bumpAngles: (dxw, dyz) => set((s) => ({ angles: { ...s.angles, xw: s.angles.xw + dxw, yz: s.angles.yz + dyz } })),
  resetAngles: () => set({ angles: { ...ZERO_ANGLES } }),
  setDist: (dist) => set({ dist: Math.max(1.2, dist) }),
  setRes: (res) => set({ res: Math.max(4, Math.min(64, Math.round(res))) }),
  setExpr: (key, value) => set((s) => ({ exprs: { ...s.exprs, [key]: value } })),
  setPreset: (e) => set({ exprs: { ...e } }),
  toggleAnim: () => set((s) => ({ anim: { ...s.anim, playing: !s.anim.playing } })),
  setSpeed: (speed) => set((s) => ({ anim: { ...s.anim, speed } })),
}));
