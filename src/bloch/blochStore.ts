import { create } from "zustand";
import { KET0, GATES, rotation, applyMat, normalize, blochVector, arc, type State, type Vec3 } from "./qubit.ts";

interface UndoEntry { state: State; trajLen: number; log: number }

interface BlochState {
  state: State;
  trajectory: Vec3[]; // Bloch points, oldest→newest (the path drawn on the sphere)
  lastArc: Vec3[];     // arc of the most recent operation (for arrow animation)
  animSeq: number;     // bumped each op so the view can animate the arrow
  log: string[];       // applied operation labels
  undoStack: UndoEntry[];

  preview: { axis: Vec3; angle: number } | null; // live pulse preview (not committed)
  showTrail: boolean;

  toggleTrail: () => void;
  gate: (name: string) => void;
  rotate: (axis: "x" | "y" | "z", angleDeg: number) => void;
  applyAxis: (axis: Vec3, angle: number, label: string) => void;
  setPreview: (p: { axis: Vec3; angle: number } | null) => void;
  reset: () => void;
  undo: () => void;
  setState: (s: State, label: string) => void;
}

const AXIS: Record<"x" | "y" | "z", Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

export const useBloch = create<BlochState>((set) => ({
  state: KET0,
  trajectory: [blochVector(KET0)],
  lastArc: [],
  animSeq: 0,
  log: [],
  undoStack: [],
  preview: null,
  showTrail: true,

  toggleTrail: () => set((s) => ({ showTrail: !s.showTrail })),
  gate: (name) => {
    const g = GATES[name];
    if (!g) return;
    set((s) => applyOp(s, g.axis, g.angle, g.label));
  },
  rotate: (axis, angleDeg) => {
    if (!angleDeg) return;
    set((s) => applyOp(s, AXIS[axis], (angleDeg * Math.PI) / 180, `R${axis}(${angleDeg}°)`));
  },
  applyAxis: (axis, angle, label) => {
    if (!angle) return;
    set((s) => applyOp(s, axis, angle, label));
  },
  setPreview: (p) => set({ preview: p }),
  reset: () =>
    set({ state: KET0, trajectory: [blochVector(KET0)], lastArc: [], log: [], undoStack: [], animSeq: 0 }),
  undo: () =>
    set((s) => {
      const e = s.undoStack.at(-1);
      if (!e) return {};
      return {
        state: e.state,
        trajectory: s.trajectory.slice(0, e.trajLen),
        log: s.log.slice(0, e.log),
        lastArc: [],
        undoStack: s.undoStack.slice(0, -1),
        animSeq: s.animSeq + 1,
      };
    }),
  setState: (st, label) =>
    set((s) => ({
      state: normalize(st),
      trajectory: [...s.trajectory, blochVector(normalize(st))],
      lastArc: [],
      log: [...s.log, label],
      undoStack: [...s.undoStack, { state: s.state, trajLen: s.trajectory.length, log: s.log.length }],
      animSeq: s.animSeq + 1,
    })),
}));

function applyOp(s: BlochState, axis: Vec3, angle: number, label: string): Partial<BlochState> {
  const path = arc(s.state, axis, angle);
  const next = normalize(applyMat(rotation(axis[0], axis[1], axis[2], angle), s.state));
  return {
    state: next,
    trajectory: [...s.trajectory, ...path],
    lastArc: [blochVector(s.state), ...path],
    log: [...s.log, label],
    undoStack: [...s.undoStack, { state: s.state, trajLen: s.trajectory.length, log: s.log.length }],
    animSeq: s.animSeq + 1,
  };
}
