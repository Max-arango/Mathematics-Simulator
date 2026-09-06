// Body VISUAL layer (§36/§37) — pure, physics-free mapping from a Body3D's type to
// how it should be drawn, plus render-mode / LOD / display-radius policy. Kept strictly
// separate from the physics state: nothing here is read by the simulation, and none of
// these values ever feed back into Body3D (§3/§35). The canvas renderer consumes this;
// a future WebGL CelestialBodyRenderer can consume the SAME profiles unchanged.
import type { BodyType } from "./types.ts";

export type BodyRenderMode = "minimal" | "celestial";
export type CelestialQuality = "low" | "medium" | "high" | "auto";
/** Detail tiers, coarsest→finest, chosen per body per frame (§21/§22). */
export type LODLevel = "point" | "billboard" | "simple" | "full";

/** Visual-only config, held OUTSIDE Body3D (§36). */
export interface BodyVisualConfig {
  renderMode: BodyRenderMode;
  quality: CelestialQuality;
  /** Global multiplier on display size (not physics radius, §20/§35). */
  scale: number;
  showAtmosphere: boolean;
  showGlow: boolean;
  showAccretionDisk: boolean;
  /** Forces minimal + low densities on weak hardware (§23/§45). */
  performanceMode: boolean;
}

export const DEFAULT_VISUAL: BodyVisualConfig = {
  renderMode: "celestial", quality: "auto", scale: 1,
  showAtmosphere: true, showGlow: true, showAccretionDisk: true, performanceMode: false,
};

export type Geometry = "point" | "sphere" | "sphere+disk";
export type ShaderKind = "point" | "planet" | "star" | "black-hole" | "singularity";

export interface BodyVisualProfile {
  geometry: Geometry;
  shader: ShaderKind;
  /** Base colour (hex) — shared with the minimal marker + legend for consistency. */
  baseColor: string;
  /** Self-illuminated (stars) — draw a glow, ignore scene light. */
  emissive: boolean;
  /** Minimal-mode glyph hint. */
  marker: string;
}

const PROFILES: Record<BodyType, BodyVisualProfile> = {
  particle: { geometry: "point", shader: "point", baseColor: "#94a3b8", emissive: false, marker: "·" },
  planet: { geometry: "sphere", shader: "planet", baseColor: "#38bdf8", emissive: false, marker: "●" },
  star: { geometry: "sphere", shader: "star", baseColor: "#fbbf24", emissive: true, marker: "●" },
  "black-hole": { geometry: "sphere+disk", shader: "black-hole", baseColor: "#a78bfa", emissive: false, marker: "◎" },
  singularity: { geometry: "sphere", shader: "singularity", baseColor: "#f472b6", emissive: true, marker: "✦" },
};

/** Visual recipe for a body type (§37). Extensible: add a BodyType → add a row. */
export function getBodyVisualProfile(type: BodyType): BodyVisualProfile {
  return PROFILES[type] ?? PROFILES.particle;
}

/** Performance mode overrides the chosen mode to minimal (§23/§45). */
export function effectiveRenderMode(cfg: BodyVisualConfig): BodyRenderMode {
  return cfg.performanceMode ? "minimal" : cfg.renderMode;
}

/**
 * DISPLAY radius in WORLD units — separate from the physical radius (§20/§35). A
 * physically tiny body is floored so it never vanishes, then scaled by the user's
 * `scale`. The physics NEVER uses this. (The view additionally clamps the projected
 * pixel radius to a sane min/max.)
 */
export function renderRadius(physicalRadius: number, scale: number, minRadius = 0.15): number {
  return Math.max(minRadius, physicalRadius) * Math.max(0.05, scale);
}

/**
 * Pick a level of detail from the body's on-screen size (px radius), the quality
 * preset, and how crowded the scene is (§21/§22). Bigger on screen ⇒ more detail;
 * a crowded scene lowers detail so many bodies stay cheap. "auto" behaves like
 * "medium" with the crowd factor.
 */
export function selectLOD(pixelRadius: number, quality: CelestialQuality, bodyCount: number): LODLevel {
  if (quality === "low") {
    return pixelRadius > 26 ? "simple" : pixelRadius > 9 ? "billboard" : "point";
  }
  if (quality === "high") {
    return pixelRadius > 5 ? "full" : pixelRadius > 2 ? "simple" : "point";
  }
  // medium / auto — thresholds relax (more "point"/"billboard") when crowded.
  const crowd = bodyCount > 500 ? 2.2 : bodyCount > 200 ? 1.8 : bodyCount > 50 ? 1.3 : 1;
  const p = pixelRadius / crowd;
  return p > 18 ? "full" : p > 7 ? "simple" : p > 2.5 ? "billboard" : "point";
}
