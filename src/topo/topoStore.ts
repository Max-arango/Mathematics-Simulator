import { create } from "zustand";
import type { Bump } from "./mesh.ts";

interface TopoState {
  sourceId: string;
  targetId: string;
  t: number;              // morph fraction source → target
  playing: boolean;
  speed: number;
  bumps: Bump[];          // grab deformations
  mode: "orbit" | "deform";
  wireframe: boolean;
  res: number;
  inflate: number;        // global displacement along normal
  twist: number;          // twist about the vertical axis
  spin: boolean;          // auto-rotate the object in space
  spinSpeed: number;
  colorMode: number;      // 0 solid · 1 normal · 2 height

  setSource: (id: string) => void;
  setTarget: (id: string) => void;
  setPair: (src: string, dst: string) => void;
  setT: (t: number) => void;
  togglePlay: () => void;
  setSpeed: (s: number) => void;
  addBump: (b: Bump) => void;
  updateLastBump: (amp: number) => void;
  clearBumps: () => void;
  randomDeform: () => void;
  setMode: (m: "orbit" | "deform") => void;
  toggleWireframe: () => void;
  setRes: (r: number) => void;
  setInflate: (v: number) => void;
  setTwist: (v: number) => void;
  toggleSpin: () => void;
  setSpinSpeed: (v: number) => void;
  setColorMode: (m: number) => void;
  resetDeforms: () => void;
}

export const useTopo = create<TopoState>((set) => ({
  sourceId: "torus",
  targetId: "mug",
  t: 0,
  playing: false,
  speed: 0.35,
  bumps: [],
  mode: "orbit",
  wireframe: false,
  res: 60,
  inflate: 0,
  twist: 0,
  spin: false,
  spinSpeed: 0.5,
  colorMode: 0,

  setSource: (sourceId) => set({ sourceId, bumps: [] }),
  setTarget: (targetId) => set({ targetId }),
  setPair: (sourceId, targetId) => set({ sourceId, targetId, t: 0, bumps: [] }),
  setT: (t) => set({ t: Math.max(0, Math.min(1, t)) }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  addBump: (b) => set((s) => ({ bumps: [...s.bumps, b] })),
  updateLastBump: (amp) =>
    set((s) => (s.bumps.length ? { bumps: [...s.bumps.slice(0, -1), { ...s.bumps.at(-1)!, amp }] } : {})),
  clearBumps: () => set({ bumps: [] }),
  randomDeform: () =>
    set((s) => {
      // A few smooth bumps at deterministic-ish spread positions (no RNG in store creator elsewhere).
      const extra: Bump[] = Array.from({ length: 4 }, (_, i) => ({
        u: (i * 1.7 + s.bumps.length * 0.5) % (2 * Math.PI),
        v: (i * 2.3 + 1) % (2 * Math.PI),
        amp: (i % 2 ? 0.4 : -0.35),
        sigma: 0.55,
      }));
      return { bumps: [...s.bumps, ...extra] };
    }),
  setMode: (mode) => set({ mode }),
  toggleWireframe: () => set((s) => ({ wireframe: !s.wireframe })),
  setRes: (res) => set({ res: Math.max(12, Math.min(80, Math.round(res))) }),
  setInflate: (inflate) => set({ inflate }),
  setTwist: (twist) => set({ twist }),
  toggleSpin: () => set((s) => ({ spin: !s.spin })),
  setSpinSpeed: (spinSpeed) => set({ spinSpeed }),
  setColorMode: (colorMode) => set({ colorMode }),
  resetDeforms: () => set({ bumps: [], inflate: 0, twist: 0 }),
}));
