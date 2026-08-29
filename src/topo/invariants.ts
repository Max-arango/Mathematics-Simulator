/**
 * Topological invariants computed from a triangulated mesh.
 *
 * The combinatorics (V, E, F, χ, components, orientability) are EXACT integer
 * arithmetic on the merged vertex graph. The ONLY numeric step is the tol-based
 * vertex merge (step 1): coincident vertices at seams/poles are welded by
 * quantizing coordinates, because buildTopoMesh emits duplicate positions there.
 */

export interface MeshInvariants {
  V: number;
  E: number;
  F: number;
  euler: number;
  components: number;
  boundaryEdges: number;
  closedManifold: boolean;
  orientable: boolean;
  genus: number | null;
}

export function meshInvariants(gridPos: Float32Array, indices: Uint32Array, tol = 1e-4): MeshInvariants {
  const N = gridPos.length / 3;

  // 1. Merge coincident vertices by quantizing coords to `tol` (numeric step).
  const canon = new Map<string, number>();
  const idOf = new Int32Array(N);
  const q = (x: number) => Math.round(x / tol);
  for (let i = 0; i < N; i++) {
    const key = `${q(gridPos[i * 3])},${q(gridPos[i * 3 + 1])},${q(gridPos[i * 3 + 2])}`;
    let id = canon.get(key);
    if (id === undefined) { id = canon.size; canon.set(key, id); }
    idOf[i] = id;
  }
  const V = canon.size;

  // 2. Surviving (non-degenerate) triangles as canonical-id triples.
  const tris: [number, number, number][] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = idOf[indices[t]], b = idOf[indices[t + 1]], c = idOf[indices[t + 2]];
    if (a === b || b === c || a === c) continue; // pole slivers
    tris.push([a, b, c]);
  }
  const F = tris.length;

  // 3. Edges: undirected count + triangle multiplicity; directed for orientation.
  const key = (u: number, v: number) => (u < v ? `${u}_${v}` : `${v}_${u}`);
  const edgeCount = new Map<string, number>();
  const dirCount = new Map<string, number>(); // "u_v" directed traversals
  for (const [a, b, c] of tris) {
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      edgeCount.set(key(u, v), (edgeCount.get(key(u, v)) ?? 0) + 1);
      dirCount.set(`${u}_${v}`, (dirCount.get(`${u}_${v}`) ?? 0) + 1);
    }
  }
  const E = edgeCount.size;
  let boundaryEdges = 0;
  let closedManifold = F > 0;
  for (const c of edgeCount.values()) {
    if (c === 1) boundaryEdges++;
    if (c !== 2) closedManifold = false;
  }

  // 4. Euler + connected components via union-find over canonical ids.
  const euler = V - E + F;
  const parent = new Int32Array(V);
  for (let i = 0; i < V; i++) parent[i] = i;
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (const [a, b, c] of tris) { union(a, b); union(b, c); }
  const roots = new Set<number>();
  for (const [a] of tris) roots.add(find(a));
  const components = F > 0 ? roots.size : V;

  // 5. Orientable: on a closed mesh every undirected edge {u,v} is traversed
  //    once as u→v and once as v→u across its two faces.
  let orientable = closedManifold;
  if (closedManifold) {
    for (const [k, c] of edgeCount) {
      if (c !== 2) { orientable = false; break; }
      const [u, v] = k.split("_").map(Number);
      if ((dirCount.get(`${u}_${v}`) ?? 0) !== 1 || (dirCount.get(`${v}_${u}`) ?? 0) !== 1) { orientable = false; break; }
    }
  }

  // 6. Genus only defined for a closed, orientable, connected surface.
  let genus: number | null = null;
  if (closedManifold && orientable && components === 1) {
    const g = (2 - euler) / 2;
    genus = Number.isInteger(g) ? g : null;
  }

  return { V, E, F, euler, components, boundaryEdges, closedManifold, orientable, genus };
}
