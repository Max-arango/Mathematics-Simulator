import type { Vec4 } from "./vec4.ts";

export interface Shape { vertices: Vec4[]; edges: [number, number][] }

// Tesseract: 16 vertices (±1)⁴; edges join vertices differing in one coordinate.
function tesseract(): Shape {
  const vertices: Vec4[] = [];
  for (let i = 0; i < 16; i++) {
    vertices.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
  }
  const edges: [number, number][] = [];
  for (let a = 0; a < 16; a++)
    for (let b = a + 1; b < 16; b++) {
      const diff = a ^ b;
      if (diff && (diff & (diff - 1)) === 0) edges.push([a, b]); // exactly one bit differs
    }
  return { vertices, edges };
}

// 5-cell (4-simplex): 5 mutually equidistant vertices, all pairs connected.
function cell5(): Shape {
  const r = 1 / Math.sqrt(5);
  const vertices: Vec4[] = [
    [1, 1, 1, -r],
    [1, -1, -1, -r],
    [-1, 1, -1, -r],
    [-1, -1, 1, -r],
    [0, 0, 0, 4 * r],
  ];
  const edges: [number, number][] = [];
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) edges.push([a, b]);
  return { vertices, edges };
}

// 16-cell (hyperoctahedron): the 8 points ±eᵢ; every pair joined except antipodes.
function cell16(): Shape {
  const vertices: Vec4[] = [
    [1, 0, 0, 0], [-1, 0, 0, 0],
    [0, 1, 0, 0], [0, -1, 0, 0],
    [0, 0, 1, 0], [0, 0, -1, 0],
    [0, 0, 0, 1], [0, 0, 0, -1],
  ];
  const edges: [number, number][] = [];
  for (let a = 0; a < 8; a++)
    for (let b = a + 1; b < 8; b++) {
      if (a >> 1 === b >> 1) continue; // same axis → antipodal, no edge
      edges.push([a, b]);
    }
  return { vertices, edges };
}

// 24-cell: the 24 permutations of (±1, ±1, 0, 0); edges join vertices at the
// minimum distance √2. Self-dual, unique to 4D (no 3D analogue). 96 edges.
function cell24(): Shape {
  const vertices: Vec4[] = [];
  for (let a = 0; a < 4; a++)
    for (let b = a + 1; b < 4; b++)
      for (const sa of [1, -1])
        for (const sb of [1, -1]) {
          const v: Vec4 = [0, 0, 0, 0];
          v[a] = sa; v[b] = sb;
          vertices.push(v);
        }
  const edges: [number, number][] = [];
  for (let i = 0; i < vertices.length; i++)
    for (let j = i + 1; j < vertices.length; j++) {
      let d2 = 0;
      for (let k = 0; k < 4; k++) d2 += (vertices[i][k] - vertices[j][k]) ** 2;
      if (Math.abs(d2 - 2) < 1e-9) edges.push([i, j]);
    }
  return { vertices, edges };
}

export const POLYTOPES: Record<string, () => Shape> = {
  tesseract,
  cell5,
  cell16,
  cell24,
};

export const POLYTOPE_LABELS: Record<string, string> = {
  tesseract: "Tesseract (8-cell)",
  cell5: "5-cell (simplex)",
  cell16: "16-cell",
  cell24: "24-cell",
};
