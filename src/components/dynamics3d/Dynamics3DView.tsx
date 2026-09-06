// Dynamics 3D — Space-Time Dynamics Laboratory (Layer 3: renderer + controls).
//
// Pure React + 2D-canvas over the mathlab/dynamics3d engine. The PHYSICS lives in a
// Simulation held in a ref and is stepped in the animation loop (§27) — never in
// React state. Rendering reuses the project's own 4×4 camera (components/graph/mat4)
// exactly like the 4D view: true (x,y,z) positions projected through an orbit camera,
// NOT a 2D fake (§6). This is an EFFECTIVE gravitational-field model — a visual
// space-time approximation, NOT the Einstein metric (§2, §37).
import { useEffect, useRef, useState } from "react";
import { perspective, multiply, orbitViewAt, orbitBasis, type Mat4 } from "../graph/mat4.ts";
import { norm } from "../../mathlab/linear/vector.ts";
import {
  createSimulation, stepSimulation, resetSimulation, report,
  type Simulation,
} from "../../mathlab/dynamics3d/simulation.ts";
import { makeScenario, SCENARIO_IDS, type ScenarioId } from "../../mathlab/dynamics3d/scenarios.ts";
import { fieldAt, accelerationSources } from "../../mathlab/dynamics3d/field.ts";
import { potentialAt, effectiveMass } from "../../mathlab/dynamics3d/potential.ts";
import { sampleFieldGridZ, potentialSurfaceZ, traceFieldLine, type SurfaceVertex } from "../../mathlab/dynamics3d/fieldViz.ts";
import type { Body3D, BodyType, Vec3 } from "../../mathlab/dynamics3d/types.ts";
import type { Integrator } from "../../mathlab/dynamics3d/integrators.ts";
import type { CollisionMode } from "../../mathlab/dynamics3d/types.ts";

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

  // System / controls (React state → drives sim settings + sidebar).
  const [scenarioId, setScenarioId] = useState<ScenarioId>("planetary");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [dt, setDt] = useState(0.005);
  const [integrator, setIntegrator] = useState<Integrator>("verlet");
  const [collisionMode, setCollisionMode] = useState<CollisionMode>("ignore");
  const [trailLength, setTrailLength] = useState(400);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viz, setViz] = useState({
    bodies: true, trails: true, axes: true, grid: true,
    velocity: false, accel: false, gravityField: false, deformation: false, fieldLines: false,
  });
  const [fieldDensity, setFieldDensity] = useState(9);
  const [deformScale, setDeformScale] = useState(0.05);
  const [vectorScale, setVectorScale] = useState(1.5);
  const [deformRes, setDeformRes] = useState(24);   // space-time sheet grid resolution
  const [fieldExtent, setFieldExtent] = useState(22); // sheet / field half-size
  const [, forceUI] = useState(0);

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
  const speedRef = useRef(speed); speedRef.current = speed;
  const vizRef = useRef(viz); vizRef.current = viz;
  const selRef = useRef(selectedId); selRef.current = selectedId;
  const fieldCtl = useRef({ density: fieldDensity, deformScale, vectorScale, deformRes, extent: fieldExtent });
  fieldCtl.current = { density: fieldDensity, deformScale, vectorScale, deformRes, extent: fieldExtent };
  // Cache the deformation sheet — recompute only when bodies/controls change, so a
  // high-resolution grid stays smooth while orbiting a paused scene.
  const surfCache = useRef<{ key: string; surf: SurfaceVertex[][]; minZ: number } | null>(null);

  // Load a scenario (also on dt change we just mutate sim.dt live).
  const loadScenario = (id: ScenarioId) => {
    const sc = makeScenario(id);
    simRef.current = createSimulation(sc.bodies, { dt: sc.dt, integrator, collisionMode, trailLength });
    setScenarioId(id);
    setDt(sc.dt);
    setPlaying(false);
    setSelectedId(null);
    forceUI((n) => n + 1);
  };

  // Keep sim settings synced when the user changes them.
  useEffect(() => { simRef.current.dt = dt; }, [dt]);
  useEffect(() => { simRef.current.integrator = integrator; }, [integrator]);
  useEffect(() => { simRef.current.collisionMode = collisionMode; }, [collisionMode]);
  useEffect(() => { simRef.current.trailLength = trailLength; }, [trailLength]);

  // ── animation + physics loop ───────────────────────────────────────────────
  useEffect(() => {
    let raf = 0, acc = 0, lastUI = 0;
    const loop = (now: number) => {
      const sim = simRef.current;
      if (playRef.current && sim.status !== "numericalFailure" && sim.status !== "completed") {
        acc += speedRef.current * SUBSTEPS_PER_UNIT;
        const n = Math.floor(acc);
        acc -= n;
        if (n > 0) stepSimulation(sim, n, true);
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

    // Grid on the z=0 plane.
    if (vizRef.current.grid) {
      const G = 20, stepG = 4;
      ctx.strokeStyle = "rgba(80,100,140,0.18)"; ctx.lineWidth = 1;
      for (let i = -G; i <= G; i += stepG) {
        seg(ctx, P([i, -G, 0]), P([i, G, 0]));
        seg(ctx, P([-G, i, 0]), P([G, i, 0]));
      }
    }
    // Space-time DEFORMATION PROXY (§7) — rubber sheet of the effective potential.
    if (vizRef.current.deformation) {
      const n = fieldCtl.current.deformRes;
      // Bodies signature: recompute the sheet only when a source actually changes
      // (moved / mass / strength edited), not on every camera-only frame.
      let sig = 0;
      for (const b of sim.bodies) if (b.active) sig += b.position[0] + 2.1 * b.position[1] + 3.7 * b.mass + 5.3 * b.gravitationalStrength + (b.softening ?? 0);
      const key = `${n}|${EXT}|${fieldCtl.current.deformScale}|${sig}`;
      let cache = surfCache.current;
      if (!cache || cache.key !== key) {
        const surf = potentialSurfaceZ(sim.bodies, sim.params, EXT, n, fieldCtl.current.deformScale, EXT);
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
    if (vizRef.current.gravityField) {
      const samples = sampleFieldGridZ(sim.bodies, sim.params, EXT, fieldCtl.current.density, 0);
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
    if (vizRef.current.fieldLines) {
      const seeds = 20, R = EXT * 0.75;
      ctx.strokeStyle = "rgba(52,211,153,0.5)"; ctx.lineWidth = 1;
      for (let k = 0; k < seeds; k++) {
        const th = (2 * Math.PI * k) / seeds;
        const line = traceFieldLine([Math.cos(th) * R, Math.sin(th) * R, 0], sim.bodies, sim.params, { steps: 80, ds: 0.5, bound: EXT * 2 });
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

    // Trails.
    if (vizRef.current.trails) {
      for (const b of sim.bodies) {
        const t = sim.trails.get(b.id);
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

    // Bodies — painter's order (far first). cw larger = farther.
    if (vizRef.current.bodies) {
      const drawn = sim.bodies
        .filter((b) => b.active)
        .map((b) => ({ b, s: P(b.position) }))
        .filter((o): o is { b: Body3D; s: { x: number; y: number; cw: number } } => o.s !== null)
        .sort((a, z) => z.s.cw - a.s.cw);
      for (const { b, s } of drawn) {
        const r = Math.max(2.5, Math.min(60, (b.radius * f * h * 0.5) / s.cw));
        const color = TYPE_COLOR[b.type];
        // glow for compact objects
        if (b.type === "black-hole" || b.type === "singularity") {
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 3);
          g.addColorStop(0, hexA(color, 0.5)); g.addColorStop(1, hexA(color, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, r * 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
        if (b.id === selRef.current) {
          ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = "#e2e8f0"; ctx.font = "11px ui-monospace, monospace";
          ctx.fillText(b.name, s.x + r + 6, s.y - r);
        }
        // velocity / acceleration vectors
        const vv = vizRef.current.velocity, av = vizRef.current.accel;
        if (vv) vec(ctx, P(b.position), P(add(b.position, scaleV(b.velocity, 0.4))), "#22d3ee");
        if (av) vec(ctx, P(b.position), P(add(b.position, scaleV(b.acceleration, 0.4))), "#fbbf24");
      }
    }

    // Status banner if failed/unstable.
    if (sim.status === "numericalFailure" || sim.status === "unstable") {
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
    // click select: nearest projected body within 14px.
    const rect = canvasRef.current!.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const t = target.current;
    const mvp = multiply(perspective(Math.PI / 4, (w / h) || 1, 0.1, 5000), orbitViewAt(yaw.current, pitch.current, dist.current, t[0], t[1], t[2]));
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best: string | null = null, bestD = 14;
    for (const b of simRef.current.bodies) {
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
  const addBody = (preset: string) => {
    const p = BODY_PRESETS[preset];
    const n = ++addCounter;
    const angle = n * 1.3;
    const rr = 6 + (n % 4) * 3;
    const body: Body3D = {
      id: `add-${n}`, name: `${preset} ${n}`, type: p.type,
      position: [Math.cos(angle) * rr, Math.sin(angle) * rr, 0],
      velocity: [0, 0, 0], acceleration: [0, 0, 0],
      mass: p.mass ?? 1, radius: p.radius ?? 0.3, gravitationalStrength: 1, active: true,
      softening: p.softening, absorptionRadius: p.absorptionRadius,
    };
    simRef.current.bodies.push(body);
    simRef.current.trails.set(body.id, [[...body.position] as Vec3]);
    setSelectedId(body.id);
    forceUI((n2) => n2 + 1);
  };

  const sim = simRef.current;
  const rep = report(sim);
  const selected = sim.bodies.find((b) => b.id === selectedId) ?? null;

  const btn = "rounded px-2 py-1 text-xs";
  const chip = (on: boolean) => `${btn} ${on ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-400 hover:bg-white/10"}`;

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
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Scenario</h3>
          <select value={scenarioId} onChange={(e) => loadScenario(e.target.value as ScenarioId)}
            className="w-full rounded bg-slate-800/80 px-2 py-1 text-xs text-cyan-100 outline-none">
            {SCENARIO_IDS.map((id) => <option key={id} value={id}>{makeScenario(id).name}</option>)}
          </select>
        </div>

        <div className="rounded bg-black/30 p-2">
          <div className="mb-1.5 flex gap-1">
            <button onClick={() => setPlaying((p) => !p)} className={`${btn} flex-1 font-medium ${playing ? "bg-fuchsia-500/20 text-fuchsia-200" : "bg-cyan-500/15 text-cyan-200"}`}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
            <button onClick={() => { stepSimulation(simRef.current, 1, true); forceUI((n) => n + 1); }} className={`${btn} bg-white/5 hover:bg-white/10`} title="Single physics step">⏭ Step</button>
            <button onClick={() => { resetSimulation(simRef.current); setPlaying(false); forceUI((n) => n + 1); }} className={`${btn} bg-white/5 hover:bg-white/10`}>↻ Reset</button>
          </div>
          <Range label="speed" value={speed} min={0.1} max={10} step={0.1} onChange={setSpeed} fmt={(v) => `${v.toFixed(1)}x`} />
          <Range label="dt" value={dt} min={0.001} max={0.02} step={0.001} onChange={setDt} fmt={(v) => v.toFixed(3)} />
          <Range label="trail" value={trailLength} min={50} max={2000} step={50} onChange={setTrailLength} fmt={(v) => String(v)} />
          <div className="mt-1 flex items-center gap-1">
            <span className="w-12 text-[11px] text-slate-500">solver</span>
            {(["verlet", "rk4"] as Integrator[]).map((m) => (
              <button key={m} onClick={() => setIntegrator(m)} className={`${chip(integrator === m)} flex-1 uppercase`}>{m}</button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Speed changes playback only — the physics dt is fixed (§5).</p>
        </div>

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Add body</h3>
          <div className="flex flex-wrap gap-1">
            {Object.keys(BODY_PRESETS).map((k) => (
              <button key={k} onClick={() => addBody(k)} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-cyan-200">{k}</button>
            ))}
          </div>
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
      </aside>

      {/* 3D canvas */}
      <main className="relative min-w-0 flex-1">
        <canvas ref={canvasRef} className="h-full w-full touch-none" style={{ display: "block", cursor: "grab" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} onContextMenu={(e) => e.preventDefault()} />
        {/* system readout */}
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-slate-300">
          t = {rep.time.toFixed(3)} · steps {rep.steps} · dt {sim.dt.toFixed(3)} · bodies {rep.activeBodies}<br />
          E = {rep.total.toExponential(3)} · |p| = {rep.momentumMagnitude.toExponential(2)}<br />
          <span className={rep.energyDrift > 0.05 ? "text-amber-400" : "text-slate-500"}>ΔE {(rep.energyDrift * 100).toFixed(2)}%</span> ·
          {" "}<span className={rep.momentumDrift > 0.05 ? "text-amber-400" : "text-slate-500"}>Δp {(rep.momentumDrift * 100).toFixed(2)}%</span> · {rep.status}
        </div>
        <div className="pointer-events-none absolute bottom-2 right-2 text-right text-[10px] text-slate-600">drag orbit · shift/right-drag pan · WASD/QE fly · wheel zoom · click select</div>

        {/* inspector overlay */}
        {selected && (
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
            </div>
            <div className="mt-1.5 border-t border-white/10 pt-1">
              <p className="text-[10px] text-slate-500">Φ at body = {potentialAt(selected.position, sim.bodies, sim.params, selected.id).toExponential(3)}</p>
              <p className="text-[10px] text-slate-500">|g| = {norm(fieldAt(selected.position, sim.bodies, sim.params, selected.id)).toExponential(3)}</p>
              <p className="mt-1 text-[10px] font-semibold text-slate-400">Acceleration sources</p>
              {accelerationSources(selected, sim.bodies, sim.params).slice(0, 4).map((s) => (
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
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scaleV = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const fv = (v: Vec3) => `${v[0].toFixed(2)}, ${v[1].toFixed(2)}, ${v[2].toFixed(2)}`;
