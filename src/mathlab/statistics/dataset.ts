// Dataset (spec §58): a first-class, serialization-friendly table shared by the
// statistics / regression / visualization domains. It is deliberately dumb — pure
// row-major data plus accessors, no statistics — so it round-trips through JSON
// unchanged (spec §47/§81). To guarantee that round-trip, only finite numbers and
// string labels are ever stored: NaN/±Infinity are rejected at construction because
// JSON.stringify would silently turn them into `null`.
//
// Layout is row-major: `rows[i]` is one observation with `rows[i][j]` the value of
// column `j`, so `rows[i].length === columns.length` for every row. Column labels
// must be unique so `column(name)` is unambiguous. Every constructor copies its
// input and every mutator (addColumn) returns a NEW Dataset — instances are treated
// as immutable so callers can share them freely.
import { DimensionError, InvalidInputError } from "../core/errors.ts";

export interface Dataset {
  name?: string;
  columns: string[]; // column labels; unique
  rows: number[][]; // row-major: rows[i] is one observation, length === columns.length
}

/** Every stored value must be a finite number (JSON-safe; NaN/Infinity ⇒ null on serialize). */
function assertFinite(x: number, where: string): void {
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new InvalidInputError(`${where} must be a finite number (got ${x})`);
  }
}

/**
 * Build a Dataset from column labels and row-major data. Validates that labels are
 * unique and that every row matches the column count (rectangular), then defensively
 * copies so the returned Dataset owns its data. Throws DimensionError on a ragged/
 * width-mismatched row, InvalidInputError on duplicate labels or a non-finite value.
 * The empty dataset makeDataset([], []) is valid.
 */
export function makeDataset(columns: string[], rows: number[][], name?: string): Dataset {
  const seen = new Set<string>();
  for (const c of columns) {
    if (typeof c !== "string") throw new InvalidInputError(`column label must be a string (got ${c})`);
    if (seen.has(c)) throw new InvalidInputError(`duplicate column label "${c}"`);
    seen.add(c);
  }
  const width = columns.length;
  const copied: number[][] = rows.map((row, i) => {
    if (row.length !== width) {
      throw new DimensionError(`row ${i} has ${row.length} values, expected ${width}`);
    }
    for (let j = 0; j < width; j++) assertFinite(row[j], `rows[${i}][${j}]`);
    return row.slice();
  });
  return name === undefined
    ? { columns: columns.slice(), rows: copied }
    : { name, columns: columns.slice(), rows: copied };
}

/** Index of a label, or −1. */
function indexOf(ds: Dataset, name: string): number {
  return ds.columns.indexOf(name);
}

/** Extract a column by label as a fresh array. Throws InvalidInputError if absent. */
export function column(ds: Dataset, name: string): number[] {
  const j = indexOf(ds, name);
  if (j < 0) throw new InvalidInputError(`no column "${name}" (have: ${ds.columns.join(", ")})`);
  return ds.rows.map((row) => row[j]);
}

/** Extract a column by position as a fresh array. Throws InvalidInputError if out of range. */
export function columnByIndex(ds: Dataset, j: number): number[] {
  if (!Number.isInteger(j) || j < 0 || j >= ds.columns.length) {
    throw new InvalidInputError(`column index ${j} out of range [0, ${ds.columns.length})`);
  }
  return ds.rows.map((row) => row[j]);
}

/**
 * Build a Dataset from named, equal-length columns. Keys become labels (insertion
 * order), values become the columns. Throws DimensionError if the arrays differ in
 * length (ragged). An empty record yields the empty dataset.
 */
export function fromColumns(cols: Record<string, number[]>, name?: string): Dataset {
  const labels = Object.keys(cols);
  if (labels.length === 0) return makeDataset([], [], name);
  const n = cols[labels[0]].length;
  for (const label of labels) {
    if (cols[label].length !== n) {
      throw new DimensionError(`column "${label}" has ${cols[label].length} values, expected ${n}`);
    }
  }
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) rows.push(labels.map((label) => cols[label][i]));
  return makeDataset(labels, rows, name);
}

/**
 * Return a NEW Dataset with one more column appended (immutable style — `ds` is left
 * untouched). Throws InvalidInputError if the label already exists, DimensionError if
 * `values.length` does not match the current row count.
 */
export function addColumn(ds: Dataset, name: string, values: number[]): Dataset {
  if (indexOf(ds, name) >= 0) throw new InvalidInputError(`column "${name}" already exists`);
  if (values.length !== ds.rows.length) {
    throw new DimensionError(`expected ${ds.rows.length} values for column "${name}", got ${values.length}`);
  }
  const rows = ds.rows.map((row, i) => [...row, values[i]]);
  const columns = [...ds.columns, name];
  return ds.name === undefined ? makeDataset(columns, rows) : makeDataset(columns, rows, ds.name);
}
