import { describe, it, expect } from "vitest";
import { buildTopoMesh } from "./mesh.ts";
import { SURFACE_BY_ID } from "./surfaces.ts";
import { meshInvariants } from "./invariants.ts";

const inv = (id: string, res = 24) => {
  const m = buildTopoMesh(SURFACE_BY_ID[id], null, 0, [], res);
  return { m, r: meshInvariants(m.gridPos, m.indices) };
};

describe("meshInvariants on closed surfaces", () => {
  it("sphere: closed, connected, χ=2, genus 0", () => {
    const { r } = inv("sphere");
    expect(r.closedManifold).toBe(true);
    expect(r.components).toBe(1);
    expect(r.euler).toBe(2);
    expect(r.genus).toBe(0);
    expect(r.boundaryEdges).toBe(0);
  });

  it("torus: closed, χ=0, genus 1", () => {
    const { r } = inv("torus");
    expect(r.closedManifold).toBe(true);
    expect(r.euler).toBe(0);
    expect(r.genus).toBe(1);
  });

  it("genus-0 everyday objects (cup, plate): χ=2, genus 0", () => {
    for (const id of ["cup", "plate"]) {
      const { r } = inv(id);
      expect(r.euler, id).toBe(2);
      expect(r.genus, id).toBe(0);
    }
  });

  it("genus-1 everyday objects (mug, cd): χ=0, genus 1", () => {
    for (const id of ["mug", "cd"]) {
      const { r } = inv(id);
      expect(r.euler, id).toBe(0);
      expect(r.genus, id).toBe(1);
    }
  });
});

describe("torn mesh regression", () => {
  it("deleting a triangle opens a boundary, no longer closed", () => {
    const { m } = inv("torus");
    const torn = m.indices.slice(0, m.indices.length - 3); // drop last triangle
    const r = meshInvariants(m.gridPos, torn);
    expect(r.boundaryEdges).toBeGreaterThan(0);
    expect(r.closedManifold).toBe(false);
  });
});
