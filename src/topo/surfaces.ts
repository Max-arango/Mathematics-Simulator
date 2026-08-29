// Parametric closed surfaces grouped by genus (number of holes). `genus` here is
// a DECLARED label, NOT the source of truth for the homeomorphism verdict: it is
// VERIFIED against invariants computed from the actual mesh geometry in
// topology.test.ts, and the runtime verdict is computed in topology.ts via the
// classification theorem. The morph in the UI is a visual isotopy, not a proof.

export type Vec3 = [number, number, number];
export type Domain = "sphere" | "torus";
export interface Surface {
  id: string;
  label: string;
  genus: number;
  domain: Domain; // parameter-space topology (must match to morph)
  fn: (u: number, v: number) => Vec3;
}

// Domain ranges: sphere uses u=θ∈[0,π], v=φ∈[0,2π]; torus uses u,v∈[0,2π].
export const RANGE: Record<Domain, { uMax: number; vMax: number }> = {
  sphere: { uMax: Math.PI, vMax: 2 * Math.PI },
  torus: { uMax: 2 * Math.PI, vMax: 2 * Math.PI },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// --- genus 0 (sphere domain) ------------------------------------------------
const sphere = (u: number, v: number): Vec3 => [Math.sin(u) * Math.cos(v), Math.sin(u) * Math.sin(v), Math.cos(u)];

const ellipsoid = (u: number, v: number): Vec3 => {
  const s = sphere(u, v);
  return [1.5 * s[0], 0.9 * s[1], 0.7 * s[2]];
};

const roundedCube = (u: number, v: number): Vec3 => {
  const n = sphere(u, v);
  const m = Math.max(Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])) || 1;
  const cube: Vec3 = [n[0] / m, n[1] / m, n[2] / m];
  return [lerp(n[0], cube[0], 0.72) * 1.1, lerp(n[1], cube[1], 0.72) * 1.1, lerp(n[2], cube[2], 0.72) * 1.1];
};

const pear = (u: number, v: number): Vec3 => {
  const R = 0.55 + 0.6 * (1 - Math.cos(u)) / 2; // bottom-heavy radius
  return [R * Math.sin(u) * Math.cos(v), R * Math.sin(u) * Math.sin(v), Math.cos(u)];
};

// Everyday genus-0 objects (all closed surfaces, no holes).
const egg = (u: number, v: number): Vec3 => {
  const s = Math.sin(u), c = Math.cos(u), r = (1 + 0.18 * c) * 0.85;
  return [r * s * Math.cos(v), r * s * Math.sin(v), 1.25 * c];
};
const plate = (u: number, v: number): Vec3 => {
  const s = Math.sin(u);
  return [1.55 * s * Math.cos(v), 1.55 * s * Math.sin(v), 0.15 * Math.cos(u) + 0.12 * Math.pow(s, 10)];
};
const bowl = (u: number, v: number): Vec3 => [1.2 * Math.sin(u) * Math.cos(v), 1.2 * Math.sin(u) * Math.sin(v), 0.8 * Math.cos(u)];
const vase = (u: number, v: number): Vec3 => {
  // Radius must vanish at the poles (u=0,π) or the surface is an open tube.
  const R = Math.sin(u) * (0.7 + 0.8 * Math.sin(u));
  return [R * Math.cos(v), R * Math.sin(v), 1.4 * Math.cos(u)];
};
const cupNoHandle = (u: number, v: number): Vec3 => {
  // Smooth tumbler (straight sides, rounded top/bottom): a genus-0 cup body,
  // no handle. tanh gives clean cylindrical walls with no equatorial crease.
  const rho = 0.72 * Math.tanh(2.8 * Math.sin(u));
  return [rho * Math.cos(v), rho * Math.sin(v), 1.18 * Math.cos(u)];
};

// --- genus 1 (torus domain) -------------------------------------------------
const R0 = 1.5, r0 = 0.6;
const torus = (u: number, v: number): Vec3 => {
  const ring = R0 + r0 * Math.cos(v);
  return [ring * Math.cos(u), ring * Math.sin(u), r0 * Math.sin(v)];
};

// A genuine twisted torus: a NON-circular (elliptical) cross-section rotated as
// it travels around the ring. A circular section would be invariant under the
// twist, giving a plain torus — so the ellipse (a≠b) is essential.
const twistedTorus = (u: number, v: number): Vec3 => {
  const a = 0.7, b = 0.32, phi = 2 * u;
  const radial = Math.cos(phi) * a * Math.cos(v) - Math.sin(phi) * b * Math.sin(v);
  const z = Math.sin(phi) * a * Math.cos(v) + Math.cos(phi) * b * Math.sin(v);
  const ring = R0 + radial;
  return [ring * Math.cos(u), ring * Math.sin(u), z];
};

const bentTorus = (u: number, v: number): Vec3 => {
  // Smooth handled ring: gentle tube modulation + smooth periodic tilt so the
  // morph from the donut is a clean bend (no lumps, no seam crease).
  const r = 0.5 + 0.16 * Math.cos(u);
  const ring = R0 + r * Math.cos(v);
  return [ring * Math.cos(u), ring * Math.sin(u), r * Math.sin(v) + 0.5 * Math.sin(u)];
};

// Everyday genus-1 objects (exactly one hole).
const ring = (u: number, v: number): Vec3 => {
  const R = 1.6, r = 0.22, rr = R + r * Math.cos(v);
  return [rr * Math.cos(u), rr * Math.sin(u), r * Math.sin(v)];
};
const bagel = (u: number, v: number): Vec3 => {
  const R = 1.3, r = 0.8, rr = R + r * Math.cos(v);
  return [rr * Math.cos(u), rr * Math.sin(u), r * Math.sin(v)];
};
const cd = (u: number, v: number): Vec3 => {
  // Flattened torus: wide radial cross-section, thin in z → a disc with a hole.
  const R = 1.2, rr = R + 0.6 * Math.cos(v);
  return [rr * Math.cos(u), rr * Math.sin(u), 0.08 * Math.sin(v)];
};
const teacup = (u: number, v: number): Vec3 => {
  // (1 − cos(u/2)) is NOT 2π-periodic → tore the seam; use a periodic tilt.
  const r = 0.3 + 0.5 * (0.55 + 0.45 * Math.cos(u));
  const rr = 1.35 + r * Math.cos(v);
  return [rr * Math.cos(u), rr * Math.sin(u), r * Math.sin(v) + 0.45 * Math.sin(u)];
};

export const SURFACES: Surface[] = [
  // genus 0 — no holes
  { id: "sphere", label: "Ball / sphere", genus: 0, domain: "sphere", fn: sphere },
  { id: "egg", label: "Egg", genus: 0, domain: "sphere", fn: egg },
  { id: "plate", label: "Plate", genus: 0, domain: "sphere", fn: plate },
  { id: "bowl", label: "Bowl", genus: 0, domain: "sphere", fn: bowl },
  { id: "vase", label: "Vase", genus: 0, domain: "sphere", fn: vase },
  { id: "cup", label: "Cup (no handle)", genus: 0, domain: "sphere", fn: cupNoHandle },
  { id: "ellipsoid", label: "Ellipsoid", genus: 0, domain: "sphere", fn: ellipsoid },
  { id: "cube", label: "Rounded cube", genus: 0, domain: "sphere", fn: roundedCube },
  { id: "pear", label: "Pear", genus: 0, domain: "sphere", fn: pear },
  // genus 1 — one hole
  { id: "torus", label: "Donut / torus", genus: 1, domain: "torus", fn: torus },
  { id: "mug", label: "Mug (handle)", genus: 1, domain: "torus", fn: bentTorus },
  { id: "teacup", label: "Teacup", genus: 1, domain: "torus", fn: teacup },
  { id: "ring", label: "Ring", genus: 1, domain: "torus", fn: ring },
  { id: "bagel", label: "Bagel", genus: 1, domain: "torus", fn: bagel },
  { id: "cd", label: "CD / disc-with-hole", genus: 1, domain: "torus", fn: cd },
  { id: "twisted", label: "Twisted torus", genus: 1, domain: "torus", fn: twistedTorus },
];

export const SURFACE_BY_ID = Object.fromEntries(SURFACES.map((s) => [s.id, s]));

/** Euler characteristic from the declared genus. The AUTHORITATIVE χ is computed
 *  from the mesh in invariants.ts (V − E + F); this is the closed-form label. */
export const eulerChar = (genus: number) => 2 - 2 * genus;

/** Declared-label homeomorphism (same genus). The computed verdict lives in
 *  topology.ts (homeomorphicSurfaces); this remains only for the label test. */
export const homeomorphic = (a: Surface, b: Surface) => a.genus === b.genus;
