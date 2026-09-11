// Dynamics 3D — Space-Time Dynamics Laboratory (Layer 3: renderer + controls).
//
// Pure React + 2D-canvas over the mathlab/dynamics3d engine. The PHYSICS lives in a
// Simulation held in a ref and is stepped in the animation loop (§27) — never in
// React state. Rendering reuses the project's own 4×4 camera (components/graph/mat4)
// exactly like the 4D view: true (x,y,z) positions projected through an orbit camera,
// NOT a 2D fake (§6). This is an EFFECTIVE gravitational-field model — a visual
// space-time approximation, NOT the Einstein metric (§2, §37).
import { useEffect, useMemo, useRef, useState } from "react";
import { perspective, multiply, orbitViewAt, orbitBasis, type Mat4 } from "../graph/mat4.ts";
import { norm } from "../../mathlab/linear/vector.ts";
import {
  createSimulation, stepSimulation, resetSimulation, report, frameToBodies, historyTrail,
  type Simulation,
} from "../../mathlab/dynamics3d/simulation.ts";
import { makeScenario, SCENARIO_IDS, type ScenarioId } from "../../mathlab/dynamics3d/scenarios.ts";
import { fieldAt, accelerationSources } from "../../mathlab/dynamics3d/field.ts";
import { potentialAt, effectiveMass } from "../../mathlab/dynamics3d/potential.ts";
import { sampleFieldGridZ, potentialSurfaceZ, traceFieldLine, type SurfaceVertex, type FieldSample } from "../../mathlab/dynamics3d/fieldViz.ts";
import { sampleMathFieldGrid3D, traceMathTrajectory3D, type MathFieldGridSample } from "../../mathlab/dynamics3d/mathField.ts";
import { makeSystem, type DynamicalSystem } from "../../mathlab/dynamics/system.ts";
import type { Body3D, BodyType, Vec3 } from "../../mathlab/dynamics3d/types.ts";
import type { Integrator } from "../../mathlab/dynamics3d/integrators.ts";
import type { CollisionMode, GravityModel } from "../../mathlab/dynamics3d/types.ts";
import {
  getBodyVisualProfile, renderRadius, selectLOD, effectiveRenderMode,
  planetPalette, defaultPlanetVariant, PLANET_VARIANTS,
  type BodyRenderMode, type CelestialQuality, type BodyVisualConfig,
  type PlanetVariant, type PlanetPalette,
} from "../../mathlab/dynamics3d/rendering.ts";
// General Relativity mode (Phase 9) — consumes the already-QA'd relativity
// pipeline as-is: metric model -> normalize a spatial velocity into a timelike
// 4-velocity -> integrate the geodesic. This is a coordinate-position PLOT of
// an exact/approximate geodesic, not a spacetime-curvature renderer (§2/§37,
// same honesty rule as the effective gravity-field visuals above).
import type { MetricModel } from "../../mathlab/relativity/metric.ts";
import { minkowski } from "../../mathlab/relativity/models/minkowski.ts";
import { makeSchwarzschild } from "../../mathlab/relativity/models/schwarzschild.ts";
import { makeKerr } from "../../mathlab/relativity/models/kerr.ts";
import { normalizeTimelikeVelocity } from "../../mathlab/relativity/normalize.ts";
import { integrateGeodesic, type GeodesicTermination } from "../../mathlab/relativity/geodesic.ts";
import { hasValue } from "../../mathlab/core/result.ts";

const TYPE_COLOR: Record<BodyType, string> = {
  particle: "#94a3b8", planet: "#38bdf8", star: "#fbbf24",
  "black-hole": "#a78bfa", singularity: "#f472b6",
};

// Add-body presets (§13). Reasonable params; strength is the experimental multiplier.
const BODY_PRESETS: Record<string, Partial<Body3D> & { type: BodyType }> = {
  Particle: { type: "particle", mass: 0.001, radius: 0.15 },
  Planet: { type: "planet", mass: 5, radius: 0.35 },
  Star: { type: "star", mass: 200, radius: 0.8 },
  "Black Hole": { type: "black-hole", mass: 800, radius: 0.4, softening: 0.2, absorptionRadius: 0.6 },
  Singularity: { type: "singularity", mass: 500, radius: 0.4, softening: 0.3, absorptionRadius: 0.8 },
};

const VIZ_LABELS: Record<string, string> = {
  bodies: "Bodies", trails: "Trails", axes: "Axes", grid: "Grid",
  velocity: "Velocity", accel: "Acceleration", gravityField: "Gravity field",
  deformation: "Space-time deform.", fieldLines: "Field lines",
};

const SUBSTEPS_PER_UNIT = 2; // physics substeps advanced per (speed=1) frame
let addCounter = 0;

export type GRMetricId = "minkowski" | "schwarzschild" | "kerr";

interface GRControls {
  metricId: GRMetricId; M: number; a: number;
  r0: number; vFrac: number;
  x0: number; y0: number; z0: number; vx: number; vy: number; vz: number;
  tau1: number; h: number;
}

interface GRTrace {
  key: string;
  points: Vec3[];
  termination: GeodesicTermination | "domainError";
  error: string | null;
}

function makeGRModel(id: GRMetricId, M: number, a: number): MetricModel {
  if (id === "minkowski") return minkowski;
  if (id === "schwarzschild") return makeSchwarzschild(M);
  return makeKerr(M, a);
}

/**
 * Build (x0, spatial u) from the simple UI controls, solve the missing u^t via
 * the timelike-normalization helper, integrate the geodesic, then convert the
 * spatial coordinates to Cartesian for the existing camera pipeline (VISUAL
 * ONLY — spherical->Cartesian is a coordinate-position plot, not curvature).
 */
function computeGRTrace(model: MetricModel, ctl: GRControls): Omit<GRTrace, "key"> {
  let x0: number[];
  let uSpatial: number[];
  if (ctl.metricId === "minkowski") {
    x0 = [0, ctl.x0, ctl.y0, ctl.z0];
    uSpatial = [ctl.vx, ctl.vy, ctl.vz];
  } else {
    x0 = [0, ctl.r0, Math.PI / 2, 0]; // equatorial start
    // ponytail: dphi/dtau approximated by the standard circular-orbit dphi/dt
    // rate (a=0 reduces to Schwarzschild's sqrt(M/r^3)), scaled by vFrac —
    // a simple, physically-flavored slider, not a rigorous ZAMO/ISCO solve.
    const aTerm = ctl.metricId === "kerr" ? ctl.a : 0;
    const omega = Math.sqrt(ctl.M) / (Math.pow(ctl.r0, 1.5) + aTerm * Math.sqrt(ctl.M));
    uSpatial = [0, 0, ctl.vFrac * omega]; // u^r=0, u^theta=0, u^phi=vFrac*omega
  }
  const normRes = normalizeTimelikeVelocity(model, x0, uSpatial);
  if (!hasValue(normRes)) {
    const reason = "reason" in normRes ? normRes.reason : undefined;
    return { points: [], termination: "domainError", error: reason ?? "no valid timelike velocity" };
  }
  const result = integrateGeodesic(model, x0, normRes.value, { tau1: ctl.tau1, h: ctl.h });
  const points: Vec3[] = result.states.map((s): Vec3 => {
    if (ctl.metricId === "minkowski") return [s.x[1], s.x[2], s.x[3]];
    const [, r, theta, phi] = s.x;
    return [r * Math.sin(theta) * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(theta)];
  });
  return { points, termination: result.termination, error: null };
}

/** Content-hash signature of the active bodies (position/mass/strength/softening) —
 * the same cache-key ingredient surfCache uses, shared here so the gravity-field
 * grid and field-line caches invalidate exactly when the deformation sheet does. */
function bodySig(bodies: Body3D[], scrubbing: boolean, ph: number): number {
  let sig = scrubbing ? ph : 0;
  for (const b of bodies) if (b.active) sig += b.position[0] + 2.1 * b.position[1] + 4.9 * b.position[2] + 3.7 * b.mass + 5.3 * b.gravitationalStrength + (b.softening ?? 0);
  return sig;
}

/** Project through mvp, returning screen px + clip-w depth (null if behind camera). */
function projectP(mvp: Mat4, x: number, y: number, z: number, w: number, h: number) {
  const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
  if (cw <= 1e-6) return null;
  const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
  const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
  return { x: (cx / cw * 0.5 + 0.5) * w, y: (1 - (cy / cw * 0.5 + 0.5)) * h, cw };
}

export function Dynamics3DView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Model: "gravity" is the existing N-body engine (default, unchanged below);
  // "mathfield" is an independent arbitrary 3D vector field (Phase 2, ADR-003) —
  // it does not touch the gravity Simulation at all; "gr" (Phase 9) integrates
  // a real geodesic through an exact metric model (relativity/), also fully
  // independent of the gravity Simulation and the mathfield system.
  const [modelMode, setModelMode] = useState<"gravity" | "mathfield" | "gr">("gravity");

  // System / controls (React state → drives sim settings + sidebar).
  const [scenarioId, setScenarioId] = useState<ScenarioId>("planetary");
  const [playing, setPlaying] = useState(false);
  const [playDir, setPlayDir] = useState<1 | -1>(1); // time direction: forward / reverse
  const [speed, setSpeed] = useState(1);
  const [dt, setDt] = useState(0.005);
  const [integrator, setIntegrator] = useState<Integrator>("verlet");
  // Newtonian gravity model — "softened" (default, Plummer-regularised, finite
  // everywhere) vs "exact" (unsoftened 1/r², clamped near r=0). See gravityModel.ts.
  const [gravityModel, setGravityModel] = useState<GravityModel>("softened");
  const [collisionMode, setCollisionMode] = useState<CollisionMode>("ignore");
  const [trailLength, setTrailLength] = useState(400);
  const [historyCap, setHistoryCap] = useState(20000); // recorded frames for time scrubbing
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viz, setViz] = useState({
    bodies: true, trails: true, axes: true, grid: true,
    velocity: false, accel: false, gravityField: false, deformation: false, fieldLines: false,
  });
  // Body rendering (visual only — never touches physics, §36).
  const [renderModeUI, setRenderMode] = useState<BodyRenderMode>("celestial");
  const [quality, setQuality] = useState<CelestialQuality>("auto");
  const [bodyScale, setBodyScale] = useState(1);
  const [effects, setEffects] = useState({ atmosphere: true, glow: true, accretionDisk: true, advanced: false });
  const [performanceMode, setPerformanceMode] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [debug, setDebug] = useState(false);

  // Per-planet appearance (visual only, kept OUT of Body3D, §36): id → variant.
  const variants = useRef<Map<string, PlanetVariant>>(new Map());
  // Click-to-place spawning: armed body spec + spawn-plane height.
  const [placeArm, setPlaceArm] = useState<{ preset: string; variant: PlanetVariant } | null>(null);
  const [addVariant, setAddVariant] = useState<PlanetVariant>("earth");
  const [spawnZ, setSpawnZ] = useState(0);
  const placeRef = useRef(placeArm); placeRef.current = placeArm;
  const spawnZRef = useRef(spawnZ); spawnZRef.current = spawnZ;

  const [fieldDensity, setFieldDensity] = useState(9);
  const [deformScale, setDeformScale] = useState(0.05);
  const [vectorScale, setVectorScale] = useState(1.5);
  const [deformRes, setDeformRes] = useState(24);   // space-time sheet grid resolution
  const [fieldExtent, setFieldExtent] = useState(22); // sheet / field half-size
  const [, forceUI] = useState(0);

  // ── Mathematical Field model (Phase 2) — independent of the gravity Simulation. ──
  const [mfx, setMfx] = useState("y");
  const [mfy, setMfy] = useState("-x");
  const [mfz, setMfz] = useState("0");
  const [mfError, setMfError] = useState<string | null>(null);
  const [mfExtent, setMfExtent] = useState(8);     // sample-box half-size
  const [mfRes, setMfRes] = useState(5);           // grid points per axis (res³ arrows)
  const [mfArrowScale, setMfArrowScale] = useState(1);
  const [mfProbeCount, setMfProbeCount] = useState(6);

  // Parse the field (same try/catch-into-error-state pattern as the 2D DynamicsView).
  const mathSys = useMemo<DynamicalSystem | null>(() => {
    try { setMfError(null); return makeSystem(["x", "y", "z"], [mfx, mfy, mfz]); }
    catch (e) { setMfError(e instanceof Error ? e.message : String(e)); return null; }
  }, [mfx, mfy, mfz]);

  // ── General Relativity model (Phase 9) — a single test-particle geodesic
  // through an exact metric, independent of the gravity Simulation. ──
  const [grMetricId, setGrMetricId] = useState<GRMetricId>("schwarzschild");
  const [grM, setGrM] = useState(1);
  const [grA, setGrA] = useState(0.5);
  const [grR0, setGrR0] = useState(10);       // equatorial start radius (Schwarzschild/Kerr)
  const [grVFrac, setGrVFrac] = useState(1);  // fraction of the circular-orbit angular rate
  const [grX0x, setGrX0x] = useState(8);      // Minkowski: initial Cartesian position
  const [grX0y, setGrX0y] = useState(0);
  const [grX0z, setGrX0z] = useState(0);
  const [grV0x, setGrV0x] = useState(0);      // Minkowski: initial velocity (units c=1)
  const [grV0y, setGrV0y] = useState(0.5);
  const [grV0z, setGrV0z] = useState(0);
  const [grTau1, setGrTau1] = useState(50);   // affine-parameter integration range
  const [grH, setGrH] = useState(0.05);       // affine-parameter step size

  const grModel = useMemo(() => makeGRModel(grMetricId, grM, grA), [grMetricId, grM, grA]);

  // Camera (refs — smooth pointer updates without re-render).
  const yaw = useRef(0.9), pitch = useRef(0.5), dist = useRef(45);
  // Camera TARGET — the point the orbit revolves around. Pan/fly moves it so the
  // user travels through the space, not just spins around the origin.
  const target = useRef<Vec3>([0, 0, 0]);
  const keys = useRef<Set<string>>(new Set());

  // Simulation in a ref — the physics never touches React state.
  const simRef = useRef<Simulation>(makeSim("planetary", 0.005));
  function makeSim(id: ScenarioId, step: number): Simulation {
    const sc = makeScenario(id);
    return createSimulation(sc.bodies, { dt: step, integrator: "verlet", trailLength: 400 });
  }

  // Refs mirroring live control values for the (once-captured) rAF loop.
  const playRef = useRef(playing); playRef.current = playing;
  const playDirRef = useRef(playDir); playDirRef.current = playDir;
  const speedRef = useRef(speed); speedRef.current = speed;
  const playheadRef = useRef(-1); // -1 = live edge; else index into sim.history
  const vizRef = useRef(viz); vizRef.current = viz;
  const selRef = useRef(selectedId); selRef.current = selectedId;
  const fieldCtl = useRef({ density: fieldDensity, deformScale, vectorScale, deformRes, extent: fieldExtent });
  fieldCtl.current = { density: fieldDensity, deformScale, vectorScale, deformRes, extent: fieldExtent };
  const modelModeRef = useRef(modelMode); modelModeRef.current = modelMode;
  const mathSysRef = useRef(mathSys); mathSysRef.current = mathSys;
  const mfCtl = useRef({ extent: mfExtent, res: mfRes, arrowScale: mfArrowScale, probeCount: mfProbeCount });
  mfCtl.current = { extent: mfExtent, res: mfRes, arrowScale: mfArrowScale, probeCount: mfProbeCount };
  // Sampled arrows + probe streamlines — recomputed only when the field source or
  // sampling controls change (keyed on the sys reference + a param string), never
  // per animation frame (§ physics/sampling stays out of the rAF hot path).
  const mfCache = useRef<{ sys: DynamicalSystem | null; key: string; grid: MathFieldGridSample | null; probes: Vec3[][] }>({
    sys: null, key: "", grid: null, probes: [],
  });
  // GR controls mirrored into a ref for the rAF loop, same pattern as fieldCtl/mfCtl —
  // and a cache recomputed only when the key changes, never per animation frame.
  const grModelRef = useRef<MetricModel>(grModel); grModelRef.current = grModel;
  const grCtl = useRef<GRControls>({
    metricId: grMetricId, M: grM, a: grA, r0: grR0, vFrac: grVFrac,
    x0: grX0x, y0: grX0y, z0: grX0z, vx: grV0x, vy: grV0y, vz: grV0z, tau1: grTau1, h: grH,
  });
  grCtl.current = {
    metricId: grMetricId, M: grM, a: grA, r0: grR0, vFrac: grVFrac,
    x0: grX0x, y0: grX0y, z0: grX0z, vx: grV0x, vy: grV0y, vz: grV0z, tau1: grTau1, h: grH,
  };
  const grCache = useRef<GRTrace>({ key: "", points: [], termination: "completed", error: null });
  const visualRef = useRef<BodyVisualConfig & { labels: boolean }>({
    renderMode: renderModeUI, quality, scale: bodyScale,
    showAtmosphere: effects.atmosphere, showGlow: effects.glow, showAccretionDisk: effects.accretionDisk,
    performanceMode, labels: showLabels,
  });
  visualRef.current = {
    renderMode: renderModeUI, quality, scale: bodyScale,
    showAtmosphere: effects.atmosphere, showGlow: effects.glow, showAccretionDisk: effects.accretionDisk,
    performanceMode, labels: showLabels,
  };
  // Frame-time telemetry (debug overlay only).
  const perf = useRef({ fps: 0, last: 0, drawn: 0 });
  // Cache the deformation sheet — recompute only when bodies/controls change, so a
  // high-resolution grid stays smooth while orbiting a paused scene.
  const surfCache = useRef<{ key: string; surf: SurfaceVertex[][]; minZ: number } | null>(null);
  // Same idea for the gravity-field grid + field-line sampling below (§8/§20) —
  // both are pure functions of bodies/params/extent, so they're recomputed only
  // when bodySig()/extent/resolution change, never on a camera-only frame.
  const gridCache = useRef<{ key: string; samples: FieldSample[] } | null>(null);
  const lineCache = useRef<{ key: string; lines: Vec3[][] } | null>(null);

  // Assign default planet variants (cycled) so a fresh scene's planets look distinct.
  const assignDefaultVariants = (s: Simulation) => {
    const m = new Map<string, PlanetVariant>();
    let pi = 0;
    for (const b of s.bodies) if (b.type === "planet") m.set(b.id, defaultPlanetVariant(pi++));
    variants.current = m;
  };
  const getVariant = (id: string): PlanetVariant => variants.current.get(id) ?? "earth";
  // Assign for the initial scenario once.
  useEffect(() => { assignDefaultVariants(simRef.current); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Load a scenario (also on dt change we just mutate sim.dt live).
  const loadScenario = (id: ScenarioId) => {
    const sc = makeScenario(id);
    simRef.current = createSimulation(sc.bodies, { dt: sc.dt, integrator, collisionMode, trailLength, maxHistory: historyCap });
    simRef.current.params.model = gravityModel;
    assignDefaultVariants(simRef.current);
    playheadRef.current = -1;
    setScenarioId(id);
    setDt(sc.dt);
    setPlaying(false);
    setSelectedId(null);
    forceUI((n) => n + 1);
  };

  // Spawn a body at an explicit world position (click-to-place, §12).
  const spawnBodyAt = (preset: string, variant: PlanetVariant, pos: Vec3) => {
    const p = BODY_PRESETS[preset];
    const n = ++addCounter;
    const body: Body3D = {
      id: `add-${n}`, name: `${preset} ${n}`, type: p.type,
      position: [pos[0], pos[1], pos[2]], velocity: [0, 0, 0], acceleration: [0, 0, 0],
      mass: p.mass ?? 1, radius: p.radius ?? 0.3, gravitationalStrength: 1, active: true,
      softening: p.softening, absorptionRadius: p.absorptionRadius,
    };
    simRef.current.bodies.push(body);
    simRef.current.trails.set(body.id, [[...body.position] as Vec3]);
    if (p.type === "planet") variants.current.set(body.id, variant);
    setSelectedId(body.id);
    forceUI((n2) => n2 + 1);
  };

  // Keep sim settings synced when the user changes them.
  useEffect(() => { simRef.current.dt = dt; }, [dt]);
  useEffect(() => { simRef.current.integrator = integrator; }, [integrator]);
  useEffect(() => { simRef.current.params.model = gravityModel; }, [gravityModel]);
  useEffect(() => { simRef.current.collisionMode = collisionMode; }, [collisionMode]);
  useEffect(() => { simRef.current.trailLength = trailLength; }, [trailLength]);
  useEffect(() => {
    const sim = simRef.current;
    sim.maxHistory = historyCap;
    if (sim.history.length > historyCap) sim.history.splice(0, sim.history.length - historyCap);
  }, [historyCap]);

  // ── animation + physics loop ───────────────────────────────────────────────
  useEffect(() => {
    let raf = 0, acc = 0, lastUI = 0;
    const loop = (now: number) => {
      const sim = simRef.current;
      if (playRef.current) {
        acc += speedRef.current * SUBSTEPS_PER_UNIT;
        const n = Math.floor(acc);
        acc -= n;
        if (n > 0) {
          if (playDirRef.current === -1) {
            // Reverse: rewind through recorded history.
            let ph = playheadRef.current === -1 ? sim.history.length - 1 : playheadRef.current;
            ph = Math.max(0, ph - n);
            playheadRef.current = ph;
            if (ph === 0) setPlaying(false); // hit the start of the recording
          } else {
            const end = sim.history.length - 1;
            if (playheadRef.current !== -1 && playheadRef.current < end) {
              // Replay recorded frames forward until we catch the live edge.
              const ph = Math.min(end, playheadRef.current + n);
              playheadRef.current = ph >= end ? -1 : ph;
            } else if (modelModeRef.current === "gravity" && sim.status !== "numericalFailure" && sim.status !== "completed") {
              stepSimulation(sim, n, true); // live edge → simulate new frames
              playheadRef.current = -1;
            } else {
              setPlaying(false); // at the live edge but can't advance further (or not in gravity mode)
            }
          }
        }
      }
      // Fly: move the camera target with held keys (WASD/QE/space + arrows).
      const k = keys.current;
      if (k.size) {
        const speed = Math.max(0.05, dist.current * 0.02);
        const cy = Math.cos(yaw.current), sy = Math.sin(yaw.current);
        const fwd: Vec3 = [-cy, -sy, 0];          // into the screen (horizontal)
        const right: Vec3 = [-sy, cy, 0];          // screen right (horizontal)
        const tg = target.current;
        const mv = (v: Vec3, s: number) => { tg[0] += v[0] * s; tg[1] += v[1] * s; tg[2] += v[2] * s; };
        if (k.has("w") || k.has("arrowup")) mv(fwd, speed);
        if (k.has("s") || k.has("arrowdown")) mv(fwd, -speed);
        if (k.has("d") || k.has("arrowright")) mv(right, speed);
        if (k.has("a") || k.has("arrowleft")) mv(right, -speed);
        if (k.has("e") || k.has(" ")) tg[2] += speed;
        if (k.has("q")) tg[2] -= speed;
      }
      draw();
      const dtf = now - perf.current.last; perf.current.last = now;
      if (dtf > 0 && dtf < 1000) perf.current.fps = perf.current.fps ? perf.current.fps * 0.9 + (1000 / dtf) * 0.1 : 1000 / dtf;
      if (now - lastUI > 120) { forceUI((k) => k + 1); lastUI = now; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard fly controls (WASD / QE / space / arrows). Ignored while typing in a field.
  useEffect(() => {
    const FLY = new Set(["w", "a", "s", "d", "q", "e", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
    const isField = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");
    };
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!FLY.has(key) || isField(e.target)) return;
      keys.current.add(key);
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.key.toLowerCase()); };
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", clear); };
  }, []);

  const draw = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const aspect = w / h || 1;
    const fov = Math.PI / 4;
    const t = target.current;
    const mvp = multiply(perspective(fov, aspect, 0.1, 5000), orbitViewAt(yaw.current, pitch.current, dist.current, t[0], t[1], t[2]));
    const f = 1 / Math.tan(fov / 2);
    const sim = simRef.current;
    const P = (x: Vec3) => projectP(mvp, x[0], x[1], x[2], w, h);
    const EXT = fieldCtl.current.extent;
    // Time scrubber: when the playhead is behind the live edge, render the recorded
    // configuration at that frame (and reconstruct trails from history).
    const ph = playheadRef.current;
    const scrubbing = ph >= 0 && ph < sim.history.length - 1;
    const bodies = scrubbing ? frameToBodies(sim, sim.history[ph]) : sim.bodies;
    const vc = visualRef.current;
    const perfMode = vc.performanceMode; // degrade visuals before physics (§45)

    // Grid on the z=0 plane.
    if (vizRef.current.grid) {
      const G = 20, stepG = 4;
      ctx.strokeStyle = "rgba(80,100,140,0.18)"; ctx.lineWidth = 1;
      for (let i = -G; i <= G; i += stepG) {
        seg(ctx, P([i, -G, 0]), P([i, G, 0]));
        seg(ctx, P([-G, i, 0]), P([G, i, 0]));
      }
    }
    const gravityMode = modelModeRef.current === "gravity";
    const mathFieldMode = modelModeRef.current === "mathfield";
    const grMode = modelModeRef.current === "gr";

    // Space-time DEFORMATION PROXY (§7) — rubber sheet of the effective potential.
    if (gravityMode && vizRef.current.deformation) {
      const n = perfMode ? Math.min(fieldCtl.current.deformRes, 16) : fieldCtl.current.deformRes;
      // Bodies signature: recompute the sheet only when a source actually changes
      // (moved / mass / strength edited) or the gravity model/params change, not on
      // every camera-only frame.
      const key = `${n}|${EXT}|${fieldCtl.current.deformScale}|${bodySig(bodies, scrubbing, ph)}|${sim.params.model}|${sim.params.G}|${sim.params.softening}`;
      let cache = surfCache.current;
      if (!cache || cache.key !== key) {
        const surf = potentialSurfaceZ(bodies, sim.params, EXT, n, fieldCtl.current.deformScale, EXT);
        let mz = 0;
        for (const row of surf) for (const v of row) if (v.z < mz) mz = v.z;
        cache = { key, surf, minZ: mz };
        surfCache.current = cache;
      }
      const surf = cache.surf;
      const minZ = cache.minZ;
      const depth = (z: number) => (minZ < 0 ? z / minZ : 0); // 0..1, deeper = 1
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const v = surf[i][j];
          const p = P([v.x, v.y, v.z]);
          if (i + 1 < n) { const q = P([surf[i + 1][j].x, surf[i + 1][j].y, surf[i + 1][j].z]); ctx.strokeStyle = `rgba(129,140,248,${0.12 + 0.5 * depth((v.z + surf[i + 1][j].z) / 2)})`; seg(ctx, p, q); }
          if (j + 1 < n) { const q = P([surf[i][j + 1].x, surf[i][j + 1].y, surf[i][j + 1].z]); ctx.strokeStyle = `rgba(129,140,248,${0.12 + 0.5 * depth((v.z + surf[i][j + 1].z) / 2)})`; seg(ctx, p, q); }
        }
      }
    }

    // Gravity field vectors (§8) — direction of acceleration at each grid point.
    // Cached like the deformation sheet above: resampled only when the bodies,
    // extent or density actually change, not on every camera-only frame.
    if (gravityMode && vizRef.current.gravityField) {
      const density = perfMode ? Math.min(fieldCtl.current.density, 7) : fieldCtl.current.density;
      const gridKey = `${density}|${EXT}|${bodySig(bodies, scrubbing, ph)}|${sim.params.model}|${sim.params.G}|${sim.params.softening}`;
      let gcache = gridCache.current;
      if (!gcache || gcache.key !== gridKey) {
        gcache = { key: gridKey, samples: sampleFieldGridZ(bodies, sim.params, EXT, density, 0) };
        gridCache.current = gcache;
      }
      const samples = gcache.samples;
      let ref = 1e-6;
      for (const s of samples) if (s.mag > ref && Number.isFinite(s.mag)) ref = Math.max(ref, s.mag);
      for (const s of samples) {
        if (!(s.mag > 0) || !Number.isFinite(s.mag)) continue;
        const u = 1 / s.mag;
        const len = fieldCtl.current.vectorScale * (0.5 + 0.5 * Math.min(1, s.mag / ref));
        const tip: Vec3 = [s.pos[0] + s.g[0] * u * len, s.pos[1] + s.g[1] * u * len, s.pos[2] + s.g[2] * u * len];
        const a = P(s.pos), b = P(tip);
        if (!a || !b) continue;
        const inten = 0.25 + 0.6 * Math.min(1, s.mag / ref);
        ctx.strokeStyle = `rgba(96,165,250,${inten})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.fillStyle = `rgba(96,165,250,${inten})`; ctx.beginPath(); ctx.arc(b.x, b.y, 1.3, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Field lines (§20) — integral curves of g, seeded on a ring, traced inward.
    // Same caching: 20 seeds × 80 integration steps is only worth redoing when
    // the bodies or extent change, not every frame.
    if (gravityMode && vizRef.current.fieldLines) {
      const seeds = 20, R = EXT * 0.75;
      const lineKey = `${seeds}|${R}|${bodySig(bodies, scrubbing, ph)}|${sim.params.model}|${sim.params.G}|${sim.params.softening}`;
      let lcache = lineCache.current;
      if (!lcache || lcache.key !== lineKey) {
        const lines: Vec3[][] = [];
        for (let k = 0; k < seeds; k++) {
          const th = (2 * Math.PI * k) / seeds;
          lines.push(traceFieldLine([Math.cos(th) * R, Math.sin(th) * R, 0], bodies, sim.params, { steps: 80, ds: 0.5, bound: EXT * 2 }));
        }
        lcache = { key: lineKey, lines };
        lineCache.current = lcache;
      }
      ctx.strokeStyle = "rgba(52,211,153,0.5)"; ctx.lineWidth = 1;
      for (const line of lcache.lines) {
        ctx.beginPath();
        let started = false;
        for (const p of line) {
          const s = P(p);
          if (!s) { started = false; continue; }
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
      }
    }

    // Axes X (red) / Y (green) / Z (blue).
    if (vizRef.current.axes) {
      const L = 12;
      axis(ctx, P([0, 0, 0]), P([L, 0, 0]), "#f87171", "X");
      axis(ctx, P([0, 0, 0]), P([0, L, 0]), "#4ade80", "Y");
      axis(ctx, P([0, 0, 0]), P([0, 0, L]), "#60a5fa", "Z");
    }

    // Mathematical Field mode (Phase 2, ADR-003) — sampled arrows + probe streamlines
    // of a user-defined F: R³→R³. Independent of the gravity Simulation. Grid/probes
    // are cached in mfCache, recomputed only when the field or sampling controls
    // change — never re-sampled on a camera-only frame.
    if (mathFieldMode) {
      const sys = mathSysRef.current;
      const ctl = mfCtl.current;
      const gc = mfCache.current;
      const key = `${ctl.extent}|${ctl.res}|${ctl.probeCount}`;
      if (sys && (gc.sys !== sys || gc.key !== key)) {
        const b = ctl.extent;
        gc.grid = sampleMathFieldGrid3D(sys, { min: [-b, -b, -b], max: [b, b, b] }, ctl.res);
        const probes: Vec3[][] = [];
        for (let i = 0; i < ctl.probeCount; i++) {
          const ang = (2 * Math.PI * i) / Math.max(1, ctl.probeCount);
          const seed: Vec3 = [Math.cos(ang) * b * 0.5, Math.sin(ang) * b * 0.5, 0];
          const { points } = traceMathTrajectory3D(sys, seed, {
            dt: Math.max(0.005, b * 0.004), maxSteps: 400,
            bounds: { min: [-b * 3, -b * 3, -b * 3], max: [b * 3, b * 3, b * 3] },
          });
          probes.push(points);
        }
        gc.probes = probes;
        gc.sys = sys; gc.key = key;
      } else if (!sys) {
        gc.sys = null; gc.grid = null; gc.probes = [];
      }

      if (gc.grid) {
        let ref = 1e-6;
        for (const v of gc.grid.vectors) { const m = Math.hypot(v[0], v[1], v[2]); if (Number.isFinite(m)) ref = Math.max(ref, m); }
        for (let i = 0; i < gc.grid.points.length; i++) {
          const p = gc.grid.points[i], v = gc.grid.vectors[i];
          const mag = Math.hypot(v[0], v[1], v[2]);
          if (!(mag > 0) || !Number.isFinite(mag)) continue;
          const len = ctl.arrowScale * (0.5 + 0.5 * Math.min(1, mag / ref));
          const u = 1 / mag;
          const tip: Vec3 = [p[0] + v[0] * u * len, p[1] + v[1] * u * len, p[2] + v[2] * u * len];
          const a = P(p), z = P(tip);
          if (!a || !z) continue;
          const inten = 0.3 + 0.6 * Math.min(1, mag / ref);
          ctx.strokeStyle = `rgba(232,121,249,${inten})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(z.x, z.y); ctx.stroke();
          ctx.fillStyle = `rgba(232,121,249,${inten})`; ctx.beginPath(); ctx.arc(z.x, z.y, 1.3, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.strokeStyle = "rgba(52,211,153,0.6)"; ctx.lineWidth = 1.2;
      for (const line of gc.probes) {
        ctx.beginPath();
        let started = false;
        for (const p of line) {
          const s = P(p);
          if (!s) { started = false; continue; }
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
      }
      if (!sys) {
        ctx.fillStyle = "#ef4444"; ctx.font = "12px ui-monospace, monospace";
        ctx.fillText("⚠ invalid field expression — see sidebar", 12, h - 12);
      }
    }

    // General Relativity mode (Phase 9) — a single test-particle geodesic through
    // an exact metric (relativity/). Recomputed only when the model or controls
    // change (keyed on grCache.key), never per animation frame, mirroring the
    // Mathematical Field probe cache above. Reuses that same trail-drawing loop.
    if (grMode) {
      const model = grModelRef.current;
      const ctl = grCtl.current;
      const key = `${ctl.metricId}|${ctl.M}|${ctl.a}|${ctl.r0}|${ctl.vFrac}|${ctl.x0}|${ctl.y0}|${ctl.z0}|${ctl.vx}|${ctl.vy}|${ctl.vz}|${ctl.tau1}|${ctl.h}`;
      if (grCache.current.key !== key) {
        grCache.current = { key, ...computeGRTrace(model, ctl) };
      }
      const trace = grCache.current;
      ctx.strokeStyle = "rgba(250,204,21,0.75)"; ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (const p of trace.points) {
        const s = P(p);
        if (!s) { started = false; continue; }
        if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
      if (trace.points.length) {
        const start = P(trace.points[0]);
        if (start) { ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.arc(start.x, start.y, 3, 0, Math.PI * 2); ctx.fill(); }
        const end = P(trace.points[trace.points.length - 1]);
        if (end) { ctx.strokeStyle = "#facc15"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(end.x, end.y, 5, 0, Math.PI * 2); ctx.stroke(); }
      }
      if (trace.error) {
        ctx.fillStyle = "#ef4444"; ctx.font = "12px ui-monospace, monospace";
        ctx.fillText(`⚠ no valid timelike velocity — ${trace.error}`, 12, h - 12);
      } else if (trace.termination !== "completed") {
        ctx.fillStyle = "#fb923c"; ctx.font = "12px ui-monospace, monospace";
        ctx.fillText(`⚠ geodesic terminated: ${trace.termination}`, 12, h - 12);
      }
    }

    // Trails (reconstructed from history while scrubbing, so the path matches the frame).
    if (gravityMode && vizRef.current.trails) {
      for (const b of bodies) {
        const t = scrubbing ? historyTrail(sim, b.id, ph, sim.trailLength) : sim.trails.get(b.id);
        if (!t || t.length < 2) continue;
        ctx.strokeStyle = hexA(TYPE_COLOR[b.type], 0.5); ctx.lineWidth = 1.2;
        ctx.beginPath();
        let started = false;
        for (const p of t) {
          const s = P(p);
          if (!s) { started = false; continue; }
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
      }
    }

    // Bodies — visual layer (Minimal vs Celestial), painter's order (far first) so
    // depth reads correctly against trails/field/deformation. Physics is untouched:
    // display size comes from renderRadius, never body.radius (§20/§35).
    const mode = effectiveRenderMode(vc);
    let drawnCount = 0;
    if (gravityMode && vizRef.current.bodies) {
      const activeCount = bodies.reduce((n, b) => n + (b.active ? 1 : 0), 0);
      const pitchAbs = Math.min(1, Math.abs(Math.sin(pitch.current)) + 0.12); // accretion-disk tilt
      const drawn = bodies
        .filter((b) => b.active)
        .map((b) => ({ b, s: P(b.position) }))
        .filter((o): o is { b: Body3D; s: { x: number; y: number; cw: number } } => o.s !== null)
        .sort((a, z) => z.s.cw - a.s.cw);
      for (const { b, s } of drawn) {
        const rWorld = renderRadius(b.radius, vc.scale);
        const r = Math.max(2, Math.min(90, (rWorld * f * h * 0.5) / s.cw));
        const profile = getBodyVisualProfile(b.type);
        if (mode === "minimal") drawBodyMinimal(ctx, profile, s.x, s.y, r);
        else {
          const lod = selectLOD(r, vc.quality, activeCount);
          if (profile.shader === "planet" && (lod === "simple" || lod === "full")) {
            drawPlanet(ctx, s.x, s.y, r, planetPalette(getVariant(b.id)), hashSeed(b.id), vc.showAtmosphere, pitchAbs, lod === "full");
          } else {
            drawBodyCelestial(ctx, profile, s.x, s.y, r, lod, vc, pitchAbs);
          }
        }
        drawnCount++;
        if (b.id === selRef.current) {
          ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(s.x, s.y, r + 5, 0, Math.PI * 2); ctx.stroke();
        }
        if (vc.labels || b.id === selRef.current) {
          ctx.fillStyle = "#e2e8f0"; ctx.font = "11px ui-monospace, monospace";
          ctx.fillText(b.name, s.x + r + 6, s.y - r);
        }
        const vv = vizRef.current.velocity, av = vizRef.current.accel;
        if (vv) vec(ctx, P(b.position), P(add(b.position, scaleV(b.velocity, 0.4))), "#22d3ee");
        if (av) vec(ctx, P(b.position), P(add(b.position, scaleV(b.acceleration, 0.4))), "#fbbf24");
      }
    }
    perf.current.drawn = drawnCount;

    // Status banner if failed/unstable.
    if (gravityMode && (sim.status === "numericalFailure" || sim.status === "unstable")) {
      ctx.fillStyle = sim.status === "numericalFailure" ? "#ef4444" : "#fb923c";
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillText(sim.status === "numericalFailure" ? "⚠ numerical failure — integration halted" : "⚠ unstable (large coordinates/speeds)", 12, h - 12);
    }
  };

  // ── pointer: drag orbit, wheel zoom, click select ──────────────────────────
  const drag = useRef<{ x: number; y: number; moved: boolean; pan: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false, pan: e.button === 1 || e.button === 2 || e.shiftKey };
    canvasRef.current!.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
    if (drag.current.pan) {
      // Pan the target across the camera's screen plane → travel through the space.
      const { right, up } = orbitBasis(yaw.current, pitch.current);
      const s = dist.current * 0.0016, tg = target.current;
      for (let c = 0; c < 3; c++) tg[c] += (-dx * right[c] + dy * up[c]) * s;
    } else {
      yaw.current += dx * 0.008;
      pitch.current = Math.max(-1.5, Math.min(1.5, pitch.current + dy * 0.008));
    }
    drag.current.x = e.clientX; drag.current.y = e.clientY;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (canvasRef.current!.hasPointerCapture(e.pointerId)) canvasRef.current!.releasePointerCapture(e.pointerId);
    if (!d || d.moved) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    // Click-to-place: if armed, spawn at ray ∩ spawn-plane and consume the click (§12).
    // Gravity-only — placeArm can be left armed from before a mode switch, and the
    // Mathematical Field model must never be mutated into the gravity Simulation.
    if (placeRef.current) {
      if (modelModeRef.current === "gravity") {
        const p = screenToPlane(e.clientX - rect.left, e.clientY - rect.top, w, h, spawnZRef.current);
        if (p) spawnBodyAt(placeRef.current.preset, placeRef.current.variant, p);
      }
      setPlaceArm(null);
      return;
    }
    // click select: nearest projected body within 14px (gravity mode only — there
    // are no selectable "bodies" in the Mathematical Field model).
    if (modelMode !== "gravity") return;
    const t = target.current;
    const mvp = multiply(perspective(Math.PI / 4, (w / h) || 1, 0.1, 5000), orbitViewAt(yaw.current, pitch.current, dist.current, t[0], t[1], t[2]));
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const sim = simRef.current, ph = playheadRef.current;
    const list = ph >= 0 && ph < sim.history.length - 1 ? frameToBodies(sim, sim.history[ph]) : sim.bodies;
    let best: string | null = null, bestD = 14;
    for (const b of list) {
      if (!b.active) continue;
      const s = projectP(mvp, b.position[0], b.position[1], b.position[2], w, h);
      if (!s) continue;
      const dd = Math.hypot(s.x - mx, s.y - my);
      if (dd < bestD) { bestD = dd; best = b.id; }
    }
    setSelectedId(best);
  };
  const onWheel = (e: React.WheelEvent) => {
    dist.current = Math.max(3, Math.min(500, dist.current * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
  };

  const camPreset = (y: number, p: number) => { yaw.current = y; pitch.current = p; };

  // Unproject a screen pixel onto the world plane z = zPlane (for click-to-place).
  const screenToPlane = (px: number, py: number, w: number, h: number, zPlane: number): Vec3 | null => {
    const aspect = w / h || 1, tanH = Math.tan(Math.PI / 8); // fov/2 = π/8
    const yv = yaw.current, pv = pitch.current, dv = dist.current, tg = target.current;
    const cy = Math.cos(yv), sy = Math.sin(yv), cp = Math.cos(pv), sp = Math.sin(pv);
    const eye: Vec3 = [tg[0] + dv * cp * cy, tg[1] + dv * cp * sy, tg[2] + dv * sp];
    const fwd: Vec3 = [-cp * cy, -cp * sy, -sp]; // view direction (target − eye, normalised)
    const { right, up } = orbitBasis(yv, pv);
    const nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2;
    const dir: Vec3 = [
      fwd[0] + right[0] * nx * aspect * tanH + up[0] * ny * tanH,
      fwd[1] + right[1] * nx * aspect * tanH + up[1] * ny * tanH,
      fwd[2] + right[2] * nx * aspect * tanH + up[2] * ny * tanH,
    ];
    const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
    if (Math.abs(dir[2]) < 1e-6) return null; // ray parallel to the plane
    const tHit = (zPlane - eye[2]) / dir[2];
    if (tHit <= 0) return null; // plane behind the camera
    return [eye[0] + dir[0] * tHit, eye[1] + dir[1] * tHit, eye[2] + dir[2] * tHit];
  };

  // ── body edits (live) ───────────────────────────────────────────────────────
  const patchBody = (id: string, patch: Partial<Body3D>) => {
    const b = simRef.current.bodies.find((x) => x.id === id);
    if (b) Object.assign(b, patch);
    forceUI((n) => n + 1);
  };
  const removeBody = (id: string) => {
    simRef.current.bodies = simRef.current.bodies.filter((b) => b.id !== id);
    simRef.current.trails.delete(id);
    if (selRef.current === id) setSelectedId(null);
    forceUI((n) => n + 1);
  };
  // Arm click-to-place: the next click in the scene spawns this body (§12). Toggle off
  // if the same preset is clicked again.
  const armPlace = (preset: string) => setPlaceArm((cur) => (cur?.preset === preset ? null : { preset, variant: addVariant }));

  const sim = simRef.current;
  const rep = report(sim);
  // Time-scrubber render state.
  const histEnd = sim.history.length - 1;
  const dispIndex = playheadRef.current === -1 ? histEnd : Math.min(playheadRef.current, histEnd);
  const scrubbingNow = playheadRef.current !== -1 && playheadRef.current < histEnd;
  const dispTime = sim.history[dispIndex]?.t ?? sim.time;
  const dispBodies = scrubbingNow ? frameToBodies(sim, sim.history[dispIndex]) : sim.bodies;
  const selected = dispBodies.find((b) => b.id === selectedId) ?? null;
  const setPlayhead = (i: number) => { playheadRef.current = i >= histEnd ? -1 : Math.max(0, i); forceUI((n) => n + 1); };

  const btn = "rounded px-2 py-1 text-xs";
  const chip = (on: boolean) => `${btn} ${on ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-400 hover:bg-white/10"}`;
  const mfInputCls = "flex-1 rounded bg-slate-800/80 px-2 py-1 font-mono text-sm text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400";

  return (
    <div className="flex min-h-0 flex-1">
      {/* left controls */}
      <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/5 bg-[#080b14] p-3 text-slate-300">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">Space-Time Dynamics 3D</h2>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">
            Effective gravitational-field model — a visual space-time approximation, <b className="text-slate-400">not</b> the Einstein metric.
          </p>
        </div>

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Model</h3>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setModelMode("gravity")} className={`${chip(modelMode === "gravity")} flex-1`}>Gravity (N-Body)</button>
            <button onClick={() => setModelMode("mathfield")} className={`${chip(modelMode === "mathfield")} flex-1`}>Mathematical Field</button>
            <button onClick={() => setModelMode("gr")} className={`${chip(modelMode === "gr")} flex-1`}>General Relativity</button>
          </div>
        </div>

        {modelMode === "mathfield" && (
          <div>
            <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Field (dx/dt, dy/dt, dz/dt)</h3>
            <div className="mb-1 flex items-center gap-1"><span className="w-8 font-mono text-xs text-slate-400">ẋ =</span><input className={mfInputCls} value={mfx} spellCheck={false} onChange={(e) => setMfx(e.target.value)} /></div>
            <div className="mb-1 flex items-center gap-1"><span className="w-8 font-mono text-xs text-slate-400">ẏ =</span><input className={mfInputCls} value={mfy} spellCheck={false} onChange={(e) => setMfy(e.target.value)} /></div>
            <div className="flex items-center gap-1"><span className="w-8 font-mono text-xs text-slate-400">ż =</span><input className={mfInputCls} value={mfz} spellCheck={false} onChange={(e) => setMfz(e.target.value)} /></div>
            {mfError && <p className="mt-1 text-[11px] text-red-300">{mfError}</p>}
            <Range label="extent" value={mfExtent} min={2} max={30} step={1} onChange={setMfExtent} fmt={(v) => String(v)} />
            <Range label="grid" value={mfRes} min={2} max={9} step={1} onChange={setMfRes} fmt={(v) => `${v}³`} />
            <Range label="arrows" value={mfArrowScale} min={0.2} max={4} step={0.2} onChange={setMfArrowScale} fmt={(v) => v.toFixed(1)} />
            <Range label="probes" value={mfProbeCount} min={0} max={24} step={1} onChange={setMfProbeCount} fmt={(v) => String(v)} />
            <p className="mt-1 text-[10px] leading-tight text-slate-500">Arbitrary user-defined R³→R³ field — independent of the gravity model above; sampled on a grid, probes integrated with RK4.</p>
          </div>
        )}

        {modelMode === "gr" && (
          <div>
            <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Metric</h3>
            <select value={grMetricId} onChange={(e) => setGrMetricId(e.target.value as GRMetricId)}
              className="w-full rounded bg-slate-800/80 px-2 py-1 text-xs text-cyan-100 outline-none">
              <option value="minkowski">Minkowski</option>
              <option value="schwarzschild">Schwarzschild</option>
              <option value="kerr">Kerr</option>
            </select>
            <p className="mt-1 text-[10px] leading-tight text-slate-500">{grModel.provenance}.</p>

            {grMetricId !== "minkowski" && <Range label="M" value={grM} min={0.1} max={5} step={0.1} onChange={setGrM} fmt={(v) => v.toFixed(1)} />}
            {grMetricId === "kerr" && <Range label="a" value={grA} min={-grM} max={grM} step={0.05} onChange={setGrA} fmt={(v) => v.toFixed(2)} />}

            {grMetricId === "minkowski" ? (
              <>
                <p className="mb-0.5 mt-2 text-[10px] uppercase tracking-wide text-slate-500">Initial position</p>
                <Range label="x0" value={grX0x} min={-15} max={15} step={0.5} onChange={setGrX0x} fmt={(v) => v.toFixed(1)} />
                <Range label="y0" value={grX0y} min={-15} max={15} step={0.5} onChange={setGrX0y} fmt={(v) => v.toFixed(1)} />
                <Range label="z0" value={grX0z} min={-15} max={15} step={0.5} onChange={setGrX0z} fmt={(v) => v.toFixed(1)} />
                <p className="mb-0.5 mt-2 text-[10px] uppercase tracking-wide text-slate-500">Initial velocity (units c=1)</p>
                <Range label="vx" value={grV0x} min={-0.95} max={0.95} step={0.05} onChange={setGrV0x} fmt={(v) => v.toFixed(2)} />
                <Range label="vy" value={grV0y} min={-0.95} max={0.95} step={0.05} onChange={setGrV0y} fmt={(v) => v.toFixed(2)} />
                <Range label="vz" value={grV0z} min={-0.95} max={0.95} step={0.05} onChange={setGrV0z} fmt={(v) => v.toFixed(2)} />
                <p className="mt-1 text-[10px] leading-tight text-slate-500">Flat spacetime — straight-line motion at constant velocity.</p>
              </>
            ) : (
              <>
                <p className="mb-0.5 mt-2 text-[10px] uppercase tracking-wide text-slate-500">Test-particle orbit (equatorial)</p>
                <Range label="r0" value={grR0} min={1} max={40} step={0.5} onChange={setGrR0} fmt={(v) => v.toFixed(1)} />
                <Range label="v frac" value={grVFrac} min={-2} max={2} step={0.05} onChange={setGrVFrac} fmt={(v) => v.toFixed(2)} />
                <p className="mt-1 text-[10px] leading-tight text-slate-500">
                  "v frac" scales a circular-orbit angular-velocity estimate (≈1 = prograde circular); u<sup>r</sup>=0, θ=π/2 fixed. u<sup>t</sup> is solved from the timelike norm condition. r0 inside the horizon shows as a terminated geodesic below.
                </p>
              </>
            )}

            <h3 className="mb-1 mt-2 text-[10px] uppercase tracking-wide text-slate-500">Integration (affine parameter τ)</h3>
            <Range label="tau1" value={grTau1} min={1} max={300} step={1} onChange={setGrTau1} fmt={(v) => String(v)} />
            <Range label="h" value={grH} min={0.001} max={0.2} step={0.001} onChange={setGrH} fmt={(v) => v.toFixed(3)} />
            <p className="mt-1 text-[10px] leading-tight text-slate-500">Coordinate-position plot of the integrated geodesic (spherical→Cartesian for Schwarzschild/Kerr) — not a literal spacetime embedding.</p>
          </div>
        )}

        {modelMode === "gravity" && (<>
        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Scenario</h3>
          <select value={scenarioId} onChange={(e) => loadScenario(e.target.value as ScenarioId)}
            className="w-full rounded bg-slate-800/80 px-2 py-1 text-xs text-cyan-100 outline-none">
            {SCENARIO_IDS.map((id) => <option key={id} value={id}>{makeScenario(id).name}</option>)}
          </select>
        </div>

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Gravity model</h3>
          <div className="flex gap-1">
            <button onClick={() => setGravityModel("softened")} className={`${chip(gravityModel === "softened")} flex-1`}>Softened</button>
            <button onClick={() => setGravityModel("exact")} className={`${chip(gravityModel === "exact")} flex-1`}>Exact</button>
          </div>
          <p className="mt-1 text-[10px] leading-tight text-slate-500">
            {gravityModel === "exact"
              ? "Unsoftened 1/r² Newton's law — ε (softening) is ignored; clamped near r=0 instead of blowing up."
              : "Plummer-softened 1/r² — finite everywhere, uses per-body/global ε (softening)."}
          </p>
        </div>

        {/* ── Body rendering (visual only — switching never touches physics, §4/§51). ── */}
        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Body rendering</h3>
          <div className="flex gap-1">
            {(["minimal", "celestial"] as BodyRenderMode[]).map((m) => (
              <button key={m} onClick={() => setRenderMode(m)} className={`${chip(renderModeUI === m)} flex-1 capitalize`}>{m}</button>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1">
            <span className="w-12 text-[11px] text-slate-500">quality</span>
            <select value={quality} onChange={(e) => setQuality(e.target.value as CelestialQuality)} className="flex-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px] text-cyan-100 outline-none">
              {(["auto", "low", "medium", "high"] as CelestialQuality[]).map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <Range label="scale" value={bodyScale} min={0.2} max={4} step={0.1} onChange={setBodyScale} fmt={(v) => `${v.toFixed(1)}x`} />
          {renderModeUI === "celestial" && !performanceMode && (
            <div className="mt-0.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
              {([["atmosphere", "Atmosphere"], ["glow", "Star glow"], ["accretionDisk", "Accretion disk"]] as [keyof typeof effects, string][]).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-[10px]">
                  <input type="checkbox" checked={effects[k]} onChange={(e) => setEffects((f) => ({ ...f, [k]: e.target.checked }))} />{label}
                </label>
              ))}
            </div>
          )}
          <label className="mt-1 flex items-center gap-2 text-[11px] text-slate-300">
            <input type="checkbox" checked={performanceMode} onChange={(e) => setPerformanceMode(e.target.checked)} />
            <span>Performance mode <span className="text-slate-500">(forces minimal)</span></span>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-slate-300">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /><span>Body labels</span>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-slate-300">
            <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /><span>Renderer debug</span>
          </label>
        </div>

        <div className="rounded bg-black/30 p-2">
          {/* transport: reverse / forward playback (a recording you can scrub) */}
          <div className="mb-1 flex gap-1">
            <button title="Play backward in time"
              onClick={() => { if (playing && playDir === -1) setPlaying(false); else { setPlayDir(-1); setPlaying(true); } }}
              className={`${btn} flex-1 font-medium ${playing && playDir === -1 ? "bg-fuchsia-500/20 text-fuchsia-200" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>◀ Rev</button>
            <button title="Play forward in time"
              onClick={() => { if (playing && playDir === 1) setPlaying(false); else { setPlayDir(1); setPlaying(true); } }}
              className={`${btn} flex-1 font-medium ${playing && playDir === 1 ? "bg-fuchsia-500/20 text-fuchsia-200" : "bg-cyan-500/15 text-cyan-200"}`}>{playing && playDir === 1 ? "❚❚ Pause" : "▶ Play"}</button>
            <button onClick={() => { resetSimulation(simRef.current); playheadRef.current = -1; setPlaying(false); forceUI((n) => n + 1); }} className={`${btn} bg-white/5 hover:bg-white/10`} title="Restart from initial state">↻</button>
          </div>
          {/* frame stepping + jump to live edge */}
          <div className="mb-1.5 flex gap-1">
            <button onClick={() => { setPlaying(false); setPlayhead(dispIndex - 1); }} className={`${btn} flex-1 bg-white/5 hover:bg-white/10`} title="Step one frame back">⟨ frame</button>
            <button onClick={() => { setPlaying(false); if (dispIndex < histEnd) setPlayhead(dispIndex + 1); else { stepSimulation(simRef.current, 1, true); forceUI((n) => n + 1); } }} className={`${btn} flex-1 bg-white/5 hover:bg-white/10`} title="Step one frame forward">frame ⟩</button>
            <button onClick={() => { playheadRef.current = -1; forceUI((n) => n + 1); }} className={`${btn} bg-white/5 hover:bg-white/10 ${scrubbingNow ? "" : "opacity-40"}`} title="Jump to the live edge">Live ⏭</button>
          </div>
          {/* timeline scrubber */}
          <div className="mb-1.5">
            <input type="range" className="w-full" min={0} max={Math.max(0, histEnd)} step={1} value={dispIndex}
              onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)); }} />
            <div className="flex justify-between font-mono text-[10px] text-slate-500">
              <span>t = {dispTime.toFixed(3)}{scrubbingNow ? " (scrubbing)" : " (live)"}</span>
              <span>frame {dispIndex}/{Math.max(0, histEnd)}</span>
            </div>
          </div>
          <Range label="speed" value={speed} min={0.1} max={10} step={0.1} onChange={setSpeed} fmt={(v) => `${v.toFixed(1)}x`} />
          <Range label="dt" value={dt} min={0.001} max={0.02} step={0.001} onChange={setDt} fmt={(v) => v.toFixed(3)} />
          <Range label="trail" value={trailLength} min={50} max={2000} step={50} onChange={setTrailLength} fmt={(v) => String(v)} />
          <Range label="history" value={historyCap} min={2000} max={120000} step={2000} onChange={setHistoryCap} fmt={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <div className="mt-1 flex items-center gap-1">
            <span className="w-12 text-[11px] text-slate-500">solver</span>
            {(["verlet", "rk4"] as Integrator[]).map((m) => (
              <button key={m} onClick={() => setIntegrator(m)} className={`${chip(integrator === m)} flex-1 uppercase`}>{m}</button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Speed changes playback only — the physics dt is fixed (§5).</p>
        </div>

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Add body — click to place</h3>
          <div className="flex flex-wrap gap-1">
            {Object.keys(BODY_PRESETS).map((k) => (
              <button key={k} onClick={() => armPlace(k)}
                className={`rounded px-1.5 py-0.5 text-[11px] ${placeArm?.preset === k ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-cyan-200"}`}>{k}</button>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1">
            <span className="w-12 text-[11px] text-slate-500">planet</span>
            <select value={addVariant} onChange={(e) => setAddVariant(e.target.value as PlanetVariant)} className="flex-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px] capitalize text-cyan-100 outline-none">
              {PLANET_VARIANTS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <Range label="spawn z" value={spawnZ} min={-15} max={15} step={1} onChange={setSpawnZ} fmt={(v) => String(v)} />
          {placeArm && <p className="text-[10px] text-cyan-300">Click in the scene to place <b>{placeArm.preset}</b> (on z={spawnZ}). Click the button again to cancel.</p>}
        </div>

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Collisions</h3>
          <select value={collisionMode} onChange={(e) => setCollisionMode(e.target.value as CollisionMode)}
            className="w-full rounded bg-slate-800/80 px-2 py-1 text-xs text-cyan-100 outline-none">
            {(["ignore", "elastic", "merge", "absorb"] as CollisionMode[]).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Visualization</h3>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {(Object.keys(viz) as (keyof typeof viz)[]).map((k) => (
              <label key={k} className="flex items-center gap-1.5 text-[11px]">
                <input type="checkbox" checked={viz[k]} onChange={(e) => setViz((v) => ({ ...v, [k]: e.target.checked }))} />{VIZ_LABELS[k]}
              </label>
            ))}
          </div>
          {(viz.gravityField || viz.deformation || viz.fieldLines) && (
            <div className="mt-1.5 space-y-0.5 rounded bg-black/30 p-1.5">
              {(viz.gravityField || viz.fieldLines) && <Range label="density" value={fieldDensity} min={5} max={17} step={2} onChange={setFieldDensity} fmt={(v) => String(v)} />}
              {viz.gravityField && <Range label="vec scale" value={vectorScale} min={0.5} max={5} step={0.5} onChange={setVectorScale} fmt={(v) => v.toFixed(1)} />}
              {viz.deformation && <Range label="grid" value={deformRes} min={8} max={160} step={4} onChange={setDeformRes} fmt={(v) => `${v}²`} />}
              {viz.deformation && <Range label="deform" value={deformScale} min={0.01} max={0.4} step={0.01} onChange={setDeformScale} fmt={(v) => v.toFixed(2)} />}
              <Range label="extent" value={fieldExtent} min={8} max={60} step={2} onChange={setFieldExtent} fmt={(v) => String(v)} />
              <p className="text-[9px] leading-tight text-slate-500">Field/deformation visualise the effective potential — not the Einstein metric.</p>
            </div>
          )}
        </div>
        </>)}

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Camera</h3>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => camPreset(0.9, 0.5)} className={`${btn} bg-white/5 hover:bg-white/10`}>Reset</button>
            <button onClick={() => camPreset(0, 1.55)} className={`${btn} bg-white/5 hover:bg-white/10`}>Top</button>
            <button onClick={() => camPreset(0, 0)} className={`${btn} bg-white/5 hover:bg-white/10`}>Front</button>
            <button onClick={() => camPreset(Math.PI / 2, 0)} className={`${btn} bg-white/5 hover:bg-white/10`}>Side</button>
            <button onClick={() => { if (selected) target.current = [...selected.position] as Vec3; }} className={`${btn} bg-white/5 hover:bg-white/10`} title="Center camera on the selected body">Focus</button>
            <button onClick={() => { target.current = [0, 0, 0]; }} className={`${btn} bg-white/5 hover:bg-white/10`}>Recenter</button>
          </div>
          <p className="mt-1 text-[10px] leading-tight text-slate-500">Move: <b className="text-slate-400">WASD</b> + <b className="text-slate-400">Q/E</b> (up/down). Pan: <b className="text-slate-400">Shift/right-drag</b>. Orbit: drag · zoom: wheel.</p>
        </div>

        {modelMode === "gravity" && (
        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Bodies</h3>
          <div className="space-y-0.5">
            {sim.bodies.map((b) => (
              <button key={b.id} onClick={() => setSelectedId(b.id)}
                className={`flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left text-[11px] ${selectedId === b.id ? "bg-white/10" : "hover:bg-white/5"} ${b.active ? "" : "opacity-40"}`}>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[b.type] }} />{b.name}
                </span>
                <span className="font-mono text-slate-500">{b.mass.toPrecision(3)}</span>
              </button>
            ))}
          </div>
        </div>
        )}
      </aside>

      {/* 3D canvas */}
      <main className="relative min-w-0 flex-1">
        <canvas ref={canvasRef} className="h-full w-full touch-none" style={{ display: "block", cursor: "grab" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} onContextMenu={(e) => e.preventDefault()} />
        {/* system readout */}
        {modelMode === "gravity" ? (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-slate-300">
          t = {rep.time.toFixed(3)} · steps {rep.steps} · dt {sim.dt.toFixed(3)} · bodies {rep.activeBodies}<br />
          E = {rep.total.toExponential(3)} · |p| = {rep.momentumMagnitude.toExponential(2)}<br />
          <span className={rep.energyDrift > 0.05 ? "text-amber-400" : "text-slate-500"}>ΔE {(rep.energyDrift * 100).toFixed(2)}%</span> ·
          {" "}<span className={rep.momentumDrift > 0.05 ? "text-amber-400" : "text-slate-500"}>Δp {(rep.momentumDrift * 100).toFixed(2)}%</span> · {rep.status}
        </div>
        ) : modelMode === "mathfield" ? (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-slate-300">
          Mathematical Field — dx/dt={mfx || "0"}, dy/dt={mfy || "0"}, dz/dt={mfz || "0"}
        </div>
        ) : (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-slate-300">
          General Relativity — {grModel.name} ({grModel.chart})<br />
          {grMetricId !== "minkowski" && <>M={grM.toFixed(2)}{grMetricId === "kerr" ? `, a=${grA.toFixed(2)}` : ""} · </>}
          τ₁={grTau1} · h={grH.toFixed(3)} · points {grCache.current.points.length}<br />
          <span className={grCache.current.error ? "text-red-400" : grCache.current.termination !== "completed" ? "text-amber-400" : "text-slate-500"}>
            {grCache.current.error ? `domainError: ${grCache.current.error}` : `termination: ${grCache.current.termination}`}
          </span>
        </div>
        )}
        <div className="pointer-events-none absolute bottom-2 right-2 text-right text-[10px] text-slate-600">drag orbit · shift/right-drag pan · WASD/QE fly · wheel zoom · click select</div>

        {debug && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-emerald-300">
            {perf.current.fps.toFixed(0)} fps · drawn {perf.current.drawn}/{rep.activeBodies}<br />
            mode {effectiveRenderMode(visualRef.current)} · quality {quality} · scale {bodyScale.toFixed(1)}x
          </div>
        )}

        {/* inspector overlay */}
        {modelMode === "gravity" && selected && (
          <div className="absolute right-2 top-2 w-60 rounded bg-black/70 p-2 text-[11px] text-slate-300 backdrop-blur">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold" style={{ color: TYPE_COLOR[selected.type] }}>{selected.name}</span>
              <button onClick={() => removeBody(selected.id)} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] hover:bg-red-500/20">remove</button>
            </div>
            <p className="font-mono text-[10px] text-slate-400">
              type {selected.type}<br />
              x ({fv(selected.position)})<br />
              v ({fv(selected.velocity)}) |v|={norm(selected.velocity).toPrecision(3)}<br />
              a ({fv(selected.acceleration)}) |a|={norm(selected.acceleration).toPrecision(3)}
            </p>
            <div className="mt-1.5">
              <MassEdit label="mass" value={selected.mass} onChange={(m) => patchBody(selected.id, { mass: m })} />
              <MassEdit label="G-strength ×" value={selected.gravitationalStrength} onChange={(g) => patchBody(selected.id, { gravitationalStrength: g })} step />
              <p className="text-[9px] text-slate-500">effectiveMass = {effectiveMass(selected).toPrecision(4)} (experimental source term)</p>
              {selected.type === "planet" && (
                <div className="mt-1 flex items-center gap-1">
                  <span className="w-16 text-[10px] text-slate-500">variant</span>
                  <select value={getVariant(selected.id)} onChange={(e) => { variants.current.set(selected.id, e.target.value as PlanetVariant); forceUI((n) => n + 1); }}
                    className="flex-1 rounded bg-slate-800/80 px-1 py-0.5 text-[10px] capitalize text-cyan-100 outline-none">
                    {PLANET_VARIANTS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="mt-1.5 border-t border-white/10 pt-1">
              <p className="text-[10px] text-slate-500">Φ at body = {potentialAt(selected.position, dispBodies, sim.params, selected.id).toExponential(3)}</p>
              <p className="text-[10px] text-slate-500">|g| = {norm(fieldAt(selected.position, dispBodies, sim.params, selected.id)).toExponential(3)}</p>
              <p className="mt-1 text-[10px] font-semibold text-slate-400">Acceleration sources</p>
              {accelerationSources(selected, dispBodies, sim.params).slice(0, 4).map((s) => (
                <div key={s.id} className="flex justify-between font-mono text-[10px]"><span className="text-slate-400">{s.name}</span><span>{(s.share * 100).toFixed(1)}%</span></div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── small presentational helpers ─────────────────────────────────────────────
function Range({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-400">
      <span className="w-10">{label}</span>
      <input type="range" className="flex-1" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-10 text-right font-mono">{fmt(value)}</span>
    </label>
  );
}

function MassEdit({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: boolean }) {
  const mult = step ? [0, 0.25, 0.5, 1, 2, 5, 10] : null;
  return (
    <div className="mb-1 flex items-center gap-1">
      <span className="w-16 text-[10px] text-slate-500">{label}</span>
      {mult ? (
        <div className="flex flex-1 flex-wrap gap-0.5">
          {mult.map((m) => (
            <button key={m} onClick={() => onChange(m)} className={`rounded px-1 py-0.5 text-[9px] ${Math.abs(value - m) < 1e-9 ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>{m}x</button>
          ))}
        </div>
      ) : (
        <>
          <button onClick={() => onChange(Math.max(0, value / 1.5))} className="rounded bg-white/5 px-1.5 text-[11px] hover:bg-white/10">−</button>
          <span className="flex-1 text-center font-mono text-[10px]">{value.toPrecision(4)}</span>
          <button onClick={() => onChange(value * 1.5)} className="rounded bg-white/5 px-1.5 text-[11px] hover:bg-white/10">+</button>
        </>
      )}
    </div>
  );
}

// ── canvas draw helpers ──────────────────────────────────────────────────────
type Pt = { x: number; y: number } | null;
function seg(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) { if (!a || !b) return; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
function axis(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string, label: string) {
  if (!a || !b) return;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.fillStyle = color; ctx.font = "11px ui-monospace, monospace"; ctx.fillText(label, b.x + 3, b.y);
}
function vec(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string) {
  if (!a || !b) return;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
function hexA(hex: string, a: number): string { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function mix(hex: string, target: number, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c: number) => Math.round(c + (target - c) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
const lighten = (hex: string, t: number) => mix(hex, 255, t);
const darken = (hex: string, t: number) => mix(hex, 0, t);
const disc = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
const ring = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); };

// ── Minimal-mode markers (cheap; scale to thousands of bodies, §5/§6). ───────
function drawBodyMinimal(ctx: CanvasRenderingContext2D, p: { shader: string; baseColor: string }, x: number, y: number, r: number) {
  const rr = Math.min(r, 6);
  switch (p.shader) {
    case "point": ctx.fillStyle = p.baseColor; disc(ctx, x, y, Math.max(1.5, rr * 0.6)); break;
    case "star": ctx.fillStyle = p.baseColor; disc(ctx, x, y, rr); ctx.strokeStyle = hexA(p.baseColor, 0.6); ctx.lineWidth = 1; ring(ctx, x, y, rr + 2); break;
    case "black-hole": ctx.strokeStyle = p.baseColor; ctx.lineWidth = 1.5; ring(ctx, x, y, rr + 1); ctx.fillStyle = "#0a0a12"; disc(ctx, x, y, rr * 0.55); break;
    case "singularity":
      ctx.fillStyle = p.baseColor; disc(ctx, x, y, rr * 0.5);
      ctx.strokeStyle = hexA(p.baseColor, 0.8); ctx.lineWidth = 1;
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) { ctx.beginPath(); ctx.moveTo(x - dx * (rr + 3), y - dy * (rr + 3)); ctx.lineTo(x + dx * (rr + 3), y + dy * (rr + 3)); ctx.stroke(); }
      break;
    default: ctx.fillStyle = p.baseColor; disc(ctx, x, y, rr); // planet
  }
}

// ── Celestial-mode procedural bodies (light canvas gradients; a WebGL renderer
//    could replace this consuming the same profile). Fake screen-space lighting. ─
const LX = -0.42, LY = -0.5; // screen-space light direction (upper-left highlight)
function drawBodyCelestial(
  ctx: CanvasRenderingContext2D,
  p: { shader: string; baseColor: string; emissive: boolean },
  x: number, y: number, r: number, lod: string,
  vc: { showAtmosphere: boolean; showGlow: boolean; showAccretionDisk: boolean },
  pitchAbs: number,
) {
  const base = p.baseColor;
  if (lod === "point") { ctx.fillStyle = base; disc(ctx, x, y, Math.max(1.5, r * 0.7)); return; }
  if (lod === "billboard") {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    g.addColorStop(0, hexA(base, 0.9)); g.addColorStop(1, hexA(base, 0));
    ctx.fillStyle = g; disc(ctx, x, y, r * 1.6);
    ctx.fillStyle = base; disc(ctx, x, y, r * 0.6);
    return;
  }
  const full = lod === "full";
  switch (p.shader) {
    case "star": {
      if (vc.showGlow) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
        g.addColorStop(0, hexA(base, 0.55)); g.addColorStop(0.4, hexA(base, 0.22)); g.addColorStop(1, hexA(base, 0));
        ctx.fillStyle = g; disc(ctx, x, y, r * 3.2);
      }
      const core = ctx.createRadialGradient(x, y, 0, x, y, r);
      core.addColorStop(0, "#fffdf5"); core.addColorStop(0.5, lighten(base, 0.4)); core.addColorStop(1, base);
      ctx.fillStyle = core; disc(ctx, x, y, r);
      break;
    }
    case "black-hole": {
      if (vc.showAccretionDisk) {
        const dR = r * 2.6, ry = Math.max(0.12, pitchAbs);
        ctx.save(); ctx.translate(x, y); ctx.scale(1, ry);
        const g = ctx.createRadialGradient(0, 0, r * 1.02, 0, 0, dR);
        g.addColorStop(0, hexA("#fb923c", 0)); g.addColorStop(0.45, hexA("#fdba74", 0.55));
        g.addColorStop(0.75, hexA("#f97316", 0.35)); g.addColorStop(1, hexA("#7c2d12", 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, dR, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      const glow = ctx.createRadialGradient(x, y, r * 0.85, x, y, r * 1.7);
      glow.addColorStop(0, hexA("#a78bfa", 0.28)); glow.addColorStop(1, hexA("#a78bfa", 0));
      ctx.fillStyle = glow; disc(ctx, x, y, r * 1.7);
      const core = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      core.addColorStop(0, "#04040a"); core.addColorStop(0.85, "#0a0a14"); core.addColorStop(1, hexA("#a78bfa", 0.5));
      ctx.fillStyle = core; disc(ctx, x, y, r);
      break;
    }
    case "singularity": {
      if (vc.showGlow) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.3);
        g.addColorStop(0, hexA(base, 0.4)); g.addColorStop(1, hexA(base, 0));
        ctx.fillStyle = g; disc(ctx, x, y, r * 2.3);
      }
      ctx.strokeStyle = hexA(base, 0.5); ctx.lineWidth = 1;
      for (const k of [1.4, 1.9, 2.4]) ring(ctx, x, y, r * k);
      const core = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      core.addColorStop(0, "#120a16"); core.addColorStop(0.7, "#1e1030"); core.addColorStop(1, hexA(base, 0.9));
      ctx.fillStyle = core; disc(ctx, x, y, r);
      break;
    }
    case "point": {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.5);
      g.addColorStop(0, hexA(base, 0.95)); g.addColorStop(1, hexA(base, 0));
      ctx.fillStyle = g; disc(ctx, x, y, r * 1.5);
      ctx.fillStyle = lighten(base, 0.3); disc(ctx, x, y, r * 0.6);
      break;
    }
    default: { // planet — shaded sphere + optional atmosphere
      if (vc.showAtmosphere && full) {
        const atmo = ctx.createRadialGradient(x, y, r * 0.92, x, y, r * 1.28);
        atmo.addColorStop(0, hexA(lighten(base, 0.5), 0)); atmo.addColorStop(0.6, hexA(lighten(base, 0.5), 0.28)); atmo.addColorStop(1, hexA(lighten(base, 0.5), 0));
        ctx.fillStyle = atmo; disc(ctx, x, y, r * 1.28);
      }
      const g = ctx.createRadialGradient(x + LX * r * 0.55, y + LY * r * 0.55, r * 0.05, x, y, r);
      g.addColorStop(0, lighten(base, 0.55)); g.addColorStop(0.55, base); g.addColorStop(1, darken(base, 0.72));
      ctx.fillStyle = g; disc(ctx, x, y, r);
      break;
    }
  }
}

// Deterministic seed from an id, and a tiny LCG so a planet's procedural surface
// is STABLE across frames (doesn't shimmer) while differing between bodies.
function hashSeed(id: string): number { let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return h >>> 0; }
function lcg(seed: number): () => number { let s = seed >>> 0 || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

/** Tilted ring system (Saturn-style), squashed by camera pitch. */
function drawRingSystem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pitchAbs: number, color: string) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, Math.max(0.1, pitchAbs));
  ctx.lineWidth = Math.max(1, r * 0.12);
  for (const [k, a] of [[1.5, 0.55], [1.9, 0.4], [2.25, 0.25]] as const) {
    ctx.strokeStyle = hexA(color, a); ctx.beginPath(); ctx.arc(0, 0, r * k, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** Procedural planet: shaded sphere + variant surface (continents/bands/craters/
 *  cracks) + optional atmosphere + optional rings. Light canvas ops, no assets. */
function drawPlanet(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  pal: PlanetPalette, seed: number, showAtmo: boolean, pitchAbs: number, full: boolean,
) {
  if (pal.rings) drawRingSystem(ctx, x, y, r, pitchAbs, pal.land);
  if (pal.atmosphere && showAtmo && full) {
    const atmo = ctx.createRadialGradient(x, y, r * 0.92, x, y, r * 1.3);
    atmo.addColorStop(0, hexA(pal.atmo, 0)); atmo.addColorStop(0.6, hexA(pal.atmo, 0.3)); atmo.addColorStop(1, hexA(pal.atmo, 0));
    ctx.fillStyle = atmo; disc(ctx, x, y, r * 1.3);
  }
  // Shaded sphere (base = ocean), light from upper-left.
  const g = ctx.createRadialGradient(x + LX * r * 0.55, y + LY * r * 0.55, r * 0.05, x, y, r);
  g.addColorStop(0, lighten(pal.ocean, 0.5)); g.addColorStop(0.55, pal.ocean); g.addColorStop(1, darken(pal.ocean, 0.72));
  ctx.fillStyle = g; disc(ctx, x, y, r);

  if (full) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    const rnd = lcg(seed);
    if (pal.bands) {
      for (let k = 0; k < 5; k++) {
        const yy = y - r + ((k + 0.5) * 2 * r) / 5 + (rnd() - 0.5) * r * 0.1;
        ctx.fillStyle = hexA(k % 2 ? lighten(pal.land, 0.3) : darken(pal.land, 0.2), 0.5);
        ctx.fillRect(x - r, yy - r * 0.12, 2 * r, r * 0.2);
      }
    }
    if (pal.continents) {
      for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2, rad = rnd() * r * 0.62;
        ctx.fillStyle = hexA(pal.land, 0.9); disc(ctx, x + Math.cos(a) * rad, y + Math.sin(a) * rad, r * (0.18 + rnd() * 0.28));
      }
    }
    if (pal.craters) {
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2, rad = rnd() * r * 0.7, cs = r * (0.07 + rnd() * 0.12);
        ctx.fillStyle = hexA("#000000", 0.18); disc(ctx, x + Math.cos(a) * rad, y + Math.sin(a) * rad, cs);
        ctx.strokeStyle = hexA(pal.land, 0.7); ctx.lineWidth = 1; ring(ctx, x + Math.cos(a) * rad, y + Math.sin(a) * rad, cs);
      }
    }
    if (pal.cracks) {
      ctx.strokeStyle = hexA(pal.land, 0.95); ctx.lineWidth = Math.max(1, r * 0.05);
      for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2, a2 = a + (rnd() - 0.5);
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2); ctx.lineTo(x + Math.cos(a2) * r * 0.9, y + Math.sin(a2) * r * 0.9); ctx.stroke();
      }
    }
    ctx.restore();
    // limb darkening overlay for depth
    const limb = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
    limb.addColorStop(0, "rgba(0,0,0,0)"); limb.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = limb; disc(ctx, x, y, r);
  }
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scaleV = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const fv = (v: Vec3) => `${v[0].toFixed(2)}, ${v[1].toFixed(2)}, ${v[2].toFixed(2)}`;
