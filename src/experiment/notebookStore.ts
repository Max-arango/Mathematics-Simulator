import { create } from "zustand";
import { emptyExperiment, newId, type Experiment, type Cell, type CellKind } from "./types.ts";
import { serialize, deserialize } from "./serialize.ts";
import { EXAMPLES } from "./examples.ts";

const LS_KEY = "mathsim.notebook.autosave";

function loadInitial(): Experiment {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (raw) { const r = deserialize(raw); if (r.ok && r.experiment) return r.experiment; }
  } catch { /* ignore */ }
  return EXAMPLES[0].build();
}
function autosave(exp: Experiment) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, serialize(exp)); } catch { /* quota/SSR */ }
}

interface Snapshot { label: string; exp: Experiment }

interface NotebookState {
  exp: Experiment;
  undoStack: Experiment[];
  redoStack: Experiment[];
  snapshots: Snapshot[];
  lastKey: string | null; // for coalescing rapid edits (slider drags) into one undo step

  addCell: (kind: CellKind, at?: number) => void;
  updateCell: (id: string, patch: Partial<Cell>, coalesceKey?: string) => void;
  deleteCell: (id: string) => void;
  moveCell: (id: string, dir: -1 | 1) => void;
  duplicateCell: (id: string) => void;
  undo: () => void;
  redo: () => void;
  snapshot: (label: string) => void;
  restoreSnapshot: (i: number) => void;
  load: (exp: Experiment) => void;
  loadExample: (id: string) => void;
  setTitle: (title: string) => void;
}

function defaultCell(kind: CellKind): Cell {
  switch (kind) {
    case "markdown": return { id: newId("m"), kind, source: "## Notes" };
    case "parameter": return { id: newId("p"), kind, name: "a", value: 1, min: -5, max: 5, step: 0.1 };
    case "expression": return { id: newId("e"), kind, name: "f", source: "x^2" };
    case "analysis": return { id: newId("a"), kind, targetName: "f" };
  }
}

export const useNotebook = create<NotebookState>((set) => {
  const commit = (state: NotebookState, next: Experiment, coalesceKey?: string): Partial<NotebookState> => {
    const stamped: Experiment = { ...next, metadata: { ...next.metadata, updatedAt: new Date(0).toISOString() } };
    autosave(stamped);
    // Coalesce consecutive edits with the same key (e.g. dragging one slider).
    if (coalesceKey && coalesceKey === state.lastKey) return { exp: stamped, redoStack: [], lastKey: coalesceKey };
    return { exp: stamped, undoStack: [...state.undoStack, state.exp].slice(-100), redoStack: [], lastKey: coalesceKey ?? null };
  };
  const editCells = (state: NotebookState, fn: (cells: Cell[]) => Cell[], coalesceKey?: string) =>
    commit(state, { ...state.exp, cells: fn(state.exp.cells) }, coalesceKey);

  return {
    exp: loadInitial(),
    undoStack: [], redoStack: [], snapshots: [], lastKey: null,

    addCell: (kind, at) => set((s) => editCells(s, (cells) => {
      const c = defaultCell(kind);
      const i = at ?? cells.length;
      return [...cells.slice(0, i), c, ...cells.slice(i)];
    })),
    updateCell: (id, patch, coalesceKey) => set((s) => editCells(s, (cells) => cells.map((c) => (c.id === id ? { ...c, ...patch } as Cell : c)), coalesceKey)),
    deleteCell: (id) => set((s) => editCells(s, (cells) => cells.filter((c) => c.id !== id))),
    moveCell: (id, dir) => set((s) => editCells(s, (cells) => {
      const i = cells.findIndex((c) => c.id === id); const j = i + dir;
      if (i < 0 || j < 0 || j >= cells.length) return cells;
      const copy = [...cells]; [copy[i], copy[j]] = [copy[j], copy[i]]; return copy;
    })),
    duplicateCell: (id) => set((s) => editCells(s, (cells) => {
      const i = cells.findIndex((c) => c.id === id); if (i < 0) return cells;
      const clone = { ...cells[i], id: newId(cells[i].kind[0]) } as Cell;
      return [...cells.slice(0, i + 1), clone, ...cells.slice(i + 1)];
    })),
    undo: () => set((s) => {
      const prev = s.undoStack.at(-1); if (!prev) return {};
      autosave(prev);
      return { exp: prev, undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, s.exp], lastKey: null };
    }),
    redo: () => set((s) => {
      const next = s.redoStack.at(-1); if (!next) return {};
      autosave(next);
      return { exp: next, redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, s.exp], lastKey: null };
    }),
    snapshot: (label) => set((s) => ({ snapshots: [...s.snapshots, { label, exp: s.exp }] })),
    restoreSnapshot: (i) => set((s) => { const snap = s.snapshots[i]; return snap ? commit(s, snap.exp) : {}; }),
    load: (exp) => set((s) => ({ ...commit(s, exp), snapshots: s.snapshots })),
    loadExample: (id) => set((s) => { const ex = EXAMPLES.find((e) => e.id === id); return ex ? commit(s, ex.build()) : {}; }),
    setTitle: (title) => set((s) => commit(s, { ...s.exp, metadata: { ...s.exp.metadata, title } })),
  };
});

export { emptyExperiment };
