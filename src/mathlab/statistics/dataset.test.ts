import { describe, it, expect } from "vitest";
import { makeDataset, column, columnByIndex, fromColumns, addColumn } from "./dataset.ts";
import { DimensionError, InvalidInputError } from "../core/errors.ts";

describe("makeDataset", () => {
  it("builds a rectangular table and owns its data (defensive copy)", () => {
    const rows = [
      [1, 2],
      [3, 4],
    ];
    const ds = makeDataset(["a", "b"], rows, "t");
    expect(ds.name).toBe("t");
    expect(ds.columns).toEqual(["a", "b"]);
    expect(ds.rows).toEqual([
      [1, 2],
      [3, 4],
    ]);
    // mutating the caller's input does not leak into the dataset
    rows[0][0] = 999;
    expect(ds.rows[0][0]).toBe(1);
  });

  it("rejects a ragged / width-mismatched row with DimensionError", () => {
    expect(() => makeDataset(["a", "b"], [[1, 2], [3]])).toThrow(DimensionError);
    expect(() => makeDataset(["a"], [[1, 2]])).toThrow(DimensionError);
  });

  it("rejects duplicate column labels with InvalidInputError", () => {
    expect(() => makeDataset(["a", "a"], [[1, 2]])).toThrow(InvalidInputError);
  });

  it("rejects non-finite values (NaN/Infinity) so it round-trips through JSON", () => {
    expect(() => makeDataset(["a"], [[NaN]])).toThrow(InvalidInputError);
    expect(() => makeDataset(["a"], [[Infinity]])).toThrow(InvalidInputError);
    const ds = makeDataset(["a", "b"], [[1, 2]], "j");
    expect(JSON.parse(JSON.stringify(ds))).toEqual(ds);
  });

  it("accepts the empty dataset", () => {
    const ds = makeDataset([], []);
    expect(ds.columns).toEqual([]);
    expect(ds.rows).toEqual([]);
  });
});

describe("column / columnByIndex", () => {
  const ds = makeDataset(["x", "y"], [
    [1, 10],
    [2, 20],
    [3, 30],
  ]);

  it("extracts by label and by index as fresh arrays", () => {
    expect(column(ds, "y")).toEqual([10, 20, 30]);
    expect(columnByIndex(ds, 0)).toEqual([1, 2, 3]);
    // returned array is detached from internal rows
    const c = column(ds, "x");
    c[0] = -1;
    expect(ds.rows[0][0]).toBe(1);
  });

  it("throws on an unknown label or out-of-range index", () => {
    expect(() => column(ds, "z")).toThrow(InvalidInputError);
    expect(() => columnByIndex(ds, 2)).toThrow(InvalidInputError);
    expect(() => columnByIndex(ds, -1)).toThrow(InvalidInputError);
    expect(() => columnByIndex(ds, 1.5)).toThrow(InvalidInputError);
  });

  it("column of an empty dataset (no rows) is an empty array", () => {
    const empty = makeDataset(["a"], []);
    expect(column(empty, "a")).toEqual([]);
  });
});

describe("fromColumns", () => {
  it("builds from named equal-length arrays in key order", () => {
    const ds = fromColumns({ a: [1, 2], b: [3, 4] }, "n");
    expect(ds.name).toBe("n");
    expect(ds.columns).toEqual(["a", "b"]);
    expect(ds.rows).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it("rejects ragged columns with DimensionError", () => {
    expect(() => fromColumns({ a: [1, 2], b: [3] })).toThrow(DimensionError);
  });

  it("an empty record yields the empty dataset", () => {
    expect(fromColumns({})).toEqual(makeDataset([], []));
  });
});

describe("addColumn", () => {
  const ds = makeDataset(["a"], [[1], [2]]);

  it("returns a NEW dataset and leaves the original unchanged (immutable)", () => {
    const ds2 = addColumn(ds, "b", [3, 4]);
    expect(ds2.columns).toEqual(["a", "b"]);
    expect(ds2.rows).toEqual([
      [1, 3],
      [2, 4],
    ]);
    // original untouched
    expect(ds.columns).toEqual(["a"]);
    expect(ds.rows).toEqual([[1], [2]]);
  });

  it("validates length against the current row count", () => {
    expect(() => addColumn(ds, "b", [3])).toThrow(DimensionError);
  });

  it("rejects a duplicate label", () => {
    expect(() => addColumn(ds, "a", [3, 4])).toThrow(InvalidInputError);
  });
});
