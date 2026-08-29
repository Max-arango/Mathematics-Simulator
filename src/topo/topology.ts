import { buildTopoMesh } from "./mesh.ts";
import { meshInvariants, type MeshInvariants } from "./invariants.ts";
import { SURFACE_BY_ID } from "./surfaces.ts";

// Meshes are static per id, so classification is cached.
const cache = new Map<string, MeshInvariants>();

/** Build the surface mesh (no bumps, t=0) and compute its invariants. */
export function classifySurface(id: string, res = 40): MeshInvariants {
  const hit = cache.get(id);
  if (hit) return hit;
  const m = buildTopoMesh(SURFACE_BY_ID[id], null, 0, [], res);
  const r = meshInvariants(m.gridPos, m.indices);
  cache.set(id, r);
  return r;
}

/**
 * Homeomorphism decided by the classification theorem of closed surfaces:
 * two CLOSED, CONNECTED, ORIENTABLE 2-manifolds are homeomorphic iff they have
 * equal Euler characteristic (equivalently equal genus). The verdict is derived
 * entirely from COMPUTED invariants — no declared flag.
 */
export function homeomorphicSurfaces(
  aId: string,
  bId: string,
): { homeomorphic: boolean; reason: string; a: MeshInvariants; b: MeshInvariants } {
  const a = classifySurface(aId);
  const b = classifySurface(bId);
  const classifiable = (m: MeshInvariants) => m.closedManifold && m.components === 1 && m.orientable;
  if (!classifiable(a) || !classifiable(b))
    return { homeomorphic: false, reason: "not both closed, connected, orientable — classification theorem does not apply", a, b };
  const homeomorphic = a.euler === b.euler;
  const reason = homeomorphic
    ? `equal Euler characteristic (χ = ${a.euler}) ⇒ homeomorphic`
    : `different Euler characteristic (χ = ${a.euler} vs ${b.euler}) ⇒ not homeomorphic`;
  return { homeomorphic, reason, a, b };
}
