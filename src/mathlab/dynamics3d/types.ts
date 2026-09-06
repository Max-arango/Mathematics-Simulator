// Dynamics 3D — space-time dynamics laboratory (Layer 1: shared types).
//
// MODEL HONESTY (spec §2, §37): this is an EFFECTIVE GRAVITATIONAL FIELD model —
// a softened Newtonian N-body system used as a "visual space-time approximation".
// It is NOT a solution of the Einstein field equations. Anything labelled
// "curvature", "space-time deformation" etc. is a pedagogical PROXY of the
// effective potential Φ, not the metric tensor g_ij. The architecture (§22) keeps
// the field/metric behind an interface so a genuine relativistic model can replace
// the proxy later without touching the simulation loop.
//
// A 3-vector is just a length-3 number[] so it interoperates with the shared
// mathlab/linear/vector ops (add/sub/scale/dot/cross/norm/…). No new vector algebra.
export type Vec3 = [number, number, number];

export type BodyType = "particle" | "planet" | "star" | "black-hole" | "singularity";

export interface Body3D {
  id: string;
  name: string;
  position: Vec3;
  velocity: Vec3;
  /** Last computed acceleration (bookkeeping for the inspector / vectors). */
  acceleration: Vec3;
  /** Inertial mass (governs response a = F/m). */
  mass: number;
  /** Physical radius (collision / rendering). */
  radius: number;
  /** EXPERIMENTAL multiplier on this body's gravitational SOURCE strength — NOT a
   *  physical constant. effectiveMass = mass × gravitationalStrength (§10). */
  gravitationalStrength: number;
  type: BodyType;
  active: boolean;
  /** Per-body softening ε override (singularities regularise their field here). */
  softening?: number;
  /** Singularity capture radius: bodies within are absorbed (model rule, not GR). */
  absorptionRadius?: number;
}

/** Field/model parameters shared across evaluations. */
export interface FieldParams {
  /** Effective gravitational constant (experimental; default 1 in dimensionless units). */
  G: number;
  /** Global Plummer softening ε (length). Prevents the 1/r² singularity blowing up. */
  softening: number;
}

export const DEFAULT_FIELD: FieldParams = { G: 1, softening: 0.05 };

export type SimulationStatus =
  | "running" | "paused" | "completed" | "numericalFailure" | "unstable";

export type TerminationReason =
  | "manual" | "escaped" | "collision" | "absorbed" | "numericalFailure" | "timeout";

export type CollisionMode = "ignore" | "elastic" | "merge" | "absorb";

/** Display/label only — the physics runs in whatever units the numbers are in (§34). */
export type UnitSystem = "dimensionless" | "meters" | "kilometers" | "au";

/** Confidence/provenance tag for surfaced quantities (project-wide honesty vocab). */
export type Confidence = "exact" | "numerical" | "estimated" | "proxy";
