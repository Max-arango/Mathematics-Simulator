// Mathematical experiment document — a reproducible research artifact.
// React-free: usable by UI, tests, and (future) CLI/AI. The canonical data is
// the cell SOURCE; all outputs are derived deterministically from it, so a saved
// experiment reproduces exactly. No functions/executable payloads are ever
// stored — only declarative mathematical data.

export const FORMAT = "mathsim-experiment";
export const FORMAT_VERSION = 1;

// Safe bounds — deserialization/limits reject anything larger (untrusted input).
export const LIMITS = {
  maxCells: 300,
  maxSourceLen: 2000,
  maxParamMagnitude: 1e6,
  maxNameLen: 40,
} as const;

export type CellKind = "markdown" | "parameter" | "expression" | "analysis";

export interface MarkdownCell { id: string; kind: "markdown"; source: string }
export interface ParameterCell { id: string; kind: "parameter"; name: string; value: number; min: number; max: number; step: number }
/** Defines a reusable named object (function/expression) referenceable by later cells. */
export interface ExpressionCell { id: string; kind: "expression"; name: string; source: string }
/** Inspects an object defined by an ExpressionCell (by its `name`). */
export interface AnalysisCell { id: string; kind: "analysis"; targetName: string }

export type Cell = MarkdownCell | ParameterCell | ExpressionCell | AnalysisCell;

export interface ExperimentMetadata {
  title: string;
  description: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  appVersion: string;
}

export interface Experiment {
  format: typeof FORMAT;
  version: number;         // FORMAT_VERSION at save time
  metadata: ExperimentMetadata;
  cells: Cell[];
  settings: { seed: number }; // for future stochastic ops; kernel is deterministic today
}

let seq = 0;
export const newId = (prefix = "c"): string => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function emptyExperiment(title = "Untitled experiment"): Experiment {
  const now = new Date(0).toISOString(); // deterministic default; UI stamps real time on save
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    metadata: { title, description: "", author: "", createdAt: now, updatedAt: now, tags: [], appVersion: "0.1.0" },
    cells: [],
    settings: { seed: 12345 },
  };
}
