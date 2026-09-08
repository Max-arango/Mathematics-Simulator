// Dynamics 3D — General Relativity model (renderer + controls).
//
// Integrates real GEODESICS of an analytic metric (Minkowski / Schwarzschild) with the
// SHARED ODE solver and renders them through the orbit camera. This is NOT the
// gravity view's rubber-sheet proxy: the trajectories are solutions of
//   d²x^μ/dτ² + Γ^μ_{αβ} u^α u^β = 0
// where Γ comes from the generic geometry engine (mathlab/relativity). Horizon and
// photon sphere are drawn at their exact radii (rs = 2M, 3M). Provenance is shown.
import { useEffect, useRef, useState } from "react";
import { perspective, multiply, orbitViewAt, orbitBasis, project } from "../graph/mat4.ts";
import { geodesic } from "../../mathlab/relativity/geodesic.ts";
import { minkowski } from "../../mathlab/relativity/models/minkowski.ts";
import { makeSchwarzschild, schwarzschildRadius, photonSphereRadius, iscoRadius, equatorialState } from "../../mathlab/relativity/models/schwarzschild.ts";
import type { Coord, MetricModel, GeodesicResult } from "../../mathlab/relativity/types.ts";

type Vec3 = [number, number, number];

interface Geo { x0: Coord; u0: Coord; tauEnd: number; steps: number; label: string; kind: "timelike" | "null" }
interface Scenario {
  id: string; label: string; description: string;
  build: (m: MetricModel) => Geo[];
  camera: { yaw: number; pitch: number; dist: number; target: Vec3 };
}

const COLORS = ["#f472b6", "#38bdf8", "#4ade80", "#fbbf24", "#a78bfa", "#22d3ee", "#fb923c", "#f87171", "#e879f9"];

// ── scenarios ─────────────────────────────────────────────────────────────────
const MINKOWSKI_SCENARIOS: Scenario[] = [
  {
    id: "straight", label: "Straight geodesics (flat)",
    description: "In flat spacetime the geodesic equation has zero Christoffel symbols — every free particle / light ray is a straight line. The same integrator that curves orbits around a black hole leaves these dead straight.",
    build: () => {
      const g: Geo[] = [];
      for (let i = 0; i < 5; i++) g.push({ x0: [0, -22, -8 + i * 4, 0], u0: [1, 1, 0, 0], tauEnd: 44, steps: 300, label: `ray ${i + 1}`, kind: "null" });
      g.push({ x0: [0, -18, -18, 6], u0: [1, 1, 1, -0.3], tauEnd: 40, steps: 300, label: "diagonal", kind: "timelike" });
      return g;
    },
    camera: { yaw: 0.9, pitch: 0.45, dist: 70, target: [0, 0, 0] },
  },
];

function schwScenarios(): Scenario[] {
  const E_turn = (m: MetricModel, ra: number, L: number) => { const rs = 2 * m.params.M; return Math.sqrt((1 - rs / ra) * (1 + (L * L) / (ra * ra))); };
  return [
    {
      id: "precession", label: "Perihelion precession (bound orbit)",
      description: "An eccentric timelike orbit. Unlike Newton's closed ellipse, GR makes the perihelion advance each revolution — the orbit traces a rosette. This is the effect that explains Mercury.",
      build: (m) => { const L = 2.294, ra = 15; const { x0, u0 } = equatorialState(m, ra, E_turn(m, ra, L), L, "timelike", -1); return [{ x0, u0, tauEnd: 1600, steps: 16000, label: "precessing orbit", kind: "timelike" }]; },
      camera: { yaw: 0.6, pitch: 1.15, dist: 42, target: [0, 0, 0] },
    },
    {
      id: "bending", label: "Gravitational light bending",
      description: "Null geodesics (light) coming in with a range of impact parameters b = L/E. Rays with b above the critical value 3√3·M bend and escape; smaller b are captured. This is gravitational lensing from first principles.",
      build: (m) => [2.8, 3.4, 4.2, 5.5, 7.5, 11].map((b) => ({ ...equatorialState(m, 45, 1, b, "null", -1), tauEnd: 110, steps: 3500, label: `b = ${b}`, kind: "null" as const })),
      camera: { yaw: 0.9, pitch: 1.2, dist: 90, target: [0, 0, 0] },
    },
    {
      id: "ring", label: "Photon sphere winding",
      description: "Light with b just above critical winds several times near the photon sphere (r = 3M = 1.5 rs) before flying off — the mechanism behind the bright photon ring in black-hole images.",
      build: (m) => [2.62, 2.66, 2.75].map((b) => ({ ...equatorialState(m, 25, 1, b, "null", -1), tauEnd: 70, steps: 4000, label: `b = ${b}`, kind: "null" as const })),
      camera: { yaw: 0.9, pitch: 1.3, dist: 22, target: [0, 0, 0] },
    },
    {
      id: "capture", label: "Plunge / capture",
      description: "Low angular momentum: the effective-potential barrier is too small to hold the orbit, so the trajectory spirals through the event horizon and is captured. Integration halts cleanly at the horizon (the chart ends there).",
      build: (m) => [
        { ...equatorialState(m, 9, 0.97, 1.2, "timelike", -1), tauEnd: 120, steps: 5000, label: "timelike plunge", kind: "timelike" as const },
        { ...equatorialState(m, 30, 1, 2.3, "null", -1), tauEnd: 90, steps: 4000, label: "captured photon", kind: "null" as const },
      ],
      camera: { yaw: 0.9, pitch: 1.15, dist: 30, target: [0, 0, 0] },
    },
  ];
}

type MetricId = "minkowski" | "schwarzschild";

export function RelativityView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const yaw = useRef(0.9), pitch = useRef(1.15), dist = useRef(42);
  const target = useRef<Vec3>([0, 0, 0]);
  const yawD = useRef(0.9), pitchD = useRef(1.15), distD = useRef(42);
  const targetD = useRef<Vec3>([0, 0, 0]);
  const phase = useRef(0);

  const geosRef = useRef<GeodesicResult[]>([]);
  const modelRef = useRef<MetricModel>(makeSchwarzschild(0.5));

  const [metricId, setMetricId] = useState<MetricId>("schwarzschild");
  const [mass, setMass] = useState(0.5);
  const [scenarioId, setScenarioId] = useState("precession");
  const [viz, setViz] = useState({ geodesics: true, probes: true, horizon: true, spheres: true, axes: false, grid: true });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.2);
  const vizRef = useRef(viz); vizRef.current = viz;
  const playRef = useRef(playing); playRef.current = playing;
  const speedRef = useRef(speed); speedRef.current = speed;
  const [, forceUI] = useState(0);

  const scenarios = metricId === "minkowski" ? MINKOWSKI_SCENARIOS : schwScenarios();
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];

  const recompute = (mId: MetricId, M: number, scId: string, refit: boolean) => {
    const model = mId === "minkowski" ? minkowski : makeSchwarzschild(M);
    modelRef.current = model;
    const list = mId === "minkowski" ? MINKOWSKI_SCENARIOS : schwScenarios();
    const sc = list.find((s) => s.id === scId) ?? list[0];
    geosRef.current = sc.build(model).map((g) => geodesic(model, g.x0, g.u0, g.tauEnd, g.steps));
    phase.current = 0;
    if (refit) { yawD.current = sc.camera.yaw; pitchD.current = sc.camera.pitch; distD.current = sc.camera.dist; targetD.current = [...sc.camera.target]; }
    forceUI((n) => n + 1);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { recompute("schwarzschild", 0.5, "precession", true); }, []);

  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const D = 0.25;
      yaw.current += (yawD.current - yaw.current) * D;
      pitch.current += (pitchD.current - pitch.current) * D;
      dist.current += (distD.current - dist.current) * D;
      for (let c = 0; c < 3; c++) target.current[c] += (targetD.current[c] - target.current[c]) * D;
      if (playRef.current) { phase.current += speedRef.current * dt; if (phase.current > 1) phase.current -= 1; }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const t = target.current;
    const mvp = multiply(perspective(Math.PI / 4, aspect, 0.05, 8000), orbitViewAt(yaw.current, pitch.current, dist.current, t[0], t[1], t[2]));
    const P = (p: Vec3) => project(mvp, p[0], p[1], p[2], w, h);
    const v = vizRef.current;
    const M = modelRef.current.params.M ?? 0;
    const isSchw = metricId === "schwarzschild";

    if (v.grid) {
      const G = 24, step = 4;
      ctx.strokeStyle = "rgba(80,100,140,0.14)"; ctx.lineWidth = 1;
      for (let i = -G; i <= G; i += step) { seg(ctx, P([i, -G, 0]), P([i, G, 0])); seg(ctx, P([-G, i, 0]), P([G, i, 0])); }
    }
    if (v.axes) {
      const L = 14;
      axis(ctx, P([0, 0, 0]), P([L, 0, 0]), "#f87171", "x");
      axis(ctx, P([0, 0, 0]), P([0, L, 0]), "#4ade80", "y");
      axis(ctx, P([0, 0, 0]), P([0, 0, L]), "#60a5fa", "z");
    }

    // Event horizon + photon sphere + ISCO (Schwarzschild only, exact radii).
    if (isSchw && M > 0) {
      const rs = schwarzschildRadius(M);
      if (v.horizon) {
        // filled equatorial disk + wire sphere.
        equatorialDisk(ctx, P, rs, "rgba(8,10,20,0.92)");
        wireSphere(ctx, P, rs, "rgba(120,140,180,0.35)");
      }
      if (v.spheres) {
        equatorialCircle(ctx, P, photonSphereRadius(M), "rgba(250,204,21,0.55)", true, "photon sphere 3M");
        equatorialCircle(ctx, P, iscoRadius(M), "rgba(148,163,184,0.35)", true, "ISCO 6M");
      }
    }

    const geos = geosRef.current;
    if (v.geodesics) {
      for (let gi = 0; gi < geos.length; gi++) {
        const pts = geos[gi].cartesian; if (pts.length < 2) continue;
        ctx.strokeStyle = hexA(COLORS[gi % COLORS.length], 0.55); ctx.lineWidth = 1.4;
        ctx.beginPath(); let started = false;
        for (const p of pts) { const s = P(p); if (!s) { started = false; continue; } if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y); }
        ctx.stroke();
        // captured/plunged marker at the end.
        if (geos[gi].termination === "left-domain") { const s = P(pts[pts.length - 1]); if (s) { ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2); ctx.fill(); } }
      }
    }
    if (v.probes) {
      for (let gi = 0; gi < geos.length; gi++) {
        const pts = geos[gi].cartesian; const n = pts.length; if (n < 2) continue;
        const head = Math.min(n - 1, Math.floor(phase.current * (n - 1)));
        const col = COLORS[gi % COLORS.length];
        const tail = Math.max(0, head - Math.floor(n * 0.05));
        ctx.strokeStyle = hexA(col, 0.95); ctx.lineWidth = 2.2;
        ctx.beginPath(); let started = false;
        for (let i = tail; i <= head; i++) { const s = P(pts[i]); if (!s) { started = false; continue; } if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y); }
        ctx.stroke();
        const sh = P(pts[head]); if (sh) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sh.x, sh.y, 3, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  };

  // pointer (orbit / pan / zoom), damped.
  const drag = useRef<{ x: number; y: number; pan: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.button === 2 || e.shiftKey }; canvasRef.current!.setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (drag.current.pan) { const { right, up } = orbitBasis(yaw.current, pitch.current); const s = dist.current * 0.0016, tg = targetD.current; for (let c = 0; c < 3; c++) tg[c] += (-dx * right[c] + dy * up[c]) * s; }
    else { yawD.current -= dx * 0.006; pitchD.current = Math.max(-1.45, Math.min(1.45, pitchD.current - dy * 0.006)); }
    drag.current.x = e.clientX; drag.current.y = e.clientY;
  };
  const onUp = (e: React.PointerEvent) => { drag.current = null; if (canvasRef.current!.hasPointerCapture(e.pointerId)) canvasRef.current!.releasePointerCapture(e.pointerId); };
  const onWheel = (e: React.WheelEvent) => { const step = e.deltaY > 0 ? 1.08 : 1 / 1.08; distD.current = Math.max(3, Math.min(1000, distD.current * step)); };

  const geos = geosRef.current;
  const captured = geos.filter((g) => g.termination === "left-domain").length;
  const M = mass;

  return (
    <div className="flex min-h-0 flex-1 bg-[#05070d] text-slate-200">
      <aside className="w-72 shrink-0 space-y-3 overflow-y-auto border-r border-white/5 p-3 text-xs">
        <div>
          <div className="mb-1 font-semibold tracking-wide text-cyan-300">MODEL · General Relativity</div>
          <p className="text-[11px] leading-snug text-slate-400">Geodesics of an analytic metric, integrated by the shared ODE solver. Real curved-spacetime motion — not the gravity view's potential proxy.</p>
        </div>

        <label className="block">
          <span className="mb-1 block text-slate-400">Metric</span>
          <select value={metricId} onChange={(e) => { const id = e.target.value as MetricId; setMetricId(id); const first = id === "minkowski" ? "straight" : "precession"; setScenarioId(first); recompute(id, mass, first, true); }} className="w-full rounded bg-white/5 px-2 py-1.5 outline-none ring-1 ring-white/10">
            <option value="schwarzschild">Schwarzschild (non-rotating BH)</option>
            <option value="minkowski">Minkowski (flat)</option>
          </select>
        </label>

        {metricId === "schwarzschild" && (
          <label className="block">
            <span className="mb-1 flex justify-between text-slate-400"><span>Mass M</span><span className="font-mono text-slate-500">rs=2M={(2 * M).toFixed(2)}</span></span>
            <input type="range" min={0.2} max={1.5} step={0.05} value={mass} onChange={(e) => { const m = Number(e.target.value); setMass(m); recompute("schwarzschild", m, scenarioId, false); }} className="w-full" />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-slate-400">Scenario</span>
          <select value={scenarioId} onChange={(e) => { setScenarioId(e.target.value); recompute(metricId, mass, e.target.value, true); }} className="w-full rounded bg-white/5 px-2 py-1.5 outline-none ring-1 ring-white/10">
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <p className="mt-1 text-[10.5px] leading-snug text-slate-500">{scenario.description}</p>
        </label>

        <div className="space-y-1">
          <div className="text-slate-400">Layers</div>
          {(["geodesics", "probes", "horizon", "spheres", "axes", "grid"] as const).map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 capitalize">
              <input type="checkbox" checked={viz[k]} onChange={(e) => { const next = { ...viz, [k]: e.target.checked }; setViz(next); vizRef.current = next; }} />
              {k === "spheres" ? "Photon sphere / ISCO" : k}
            </label>
          ))}
        </div>

        <div className="space-y-1.5">
          <button onClick={() => setPlaying((p) => !p)} className="rounded bg-white/5 px-2 py-1 ring-1 ring-white/10 hover:bg-white/10">{playing ? "⏸ Pause" : "▶ Play"} probes</button>
          <label className="flex items-center gap-2"><span className="w-12 shrink-0 text-slate-400">Speed</span><input type="range" min={0.02} max={0.8} step={0.01} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1" /></label>
          <button onClick={() => { yawD.current = scenario.camera.yaw; pitchD.current = scenario.camera.pitch; distD.current = scenario.camera.dist; targetD.current = [...scenario.camera.target]; }} className="rounded bg-white/5 px-2 py-1 ring-1 ring-white/10 hover:bg-white/10">Reset camera</button>
        </div>

        {captured > 0 && <div className="rounded bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300 ring-1 ring-red-400/30">{captured} trajectory{captured > 1 ? "ies" : ""} captured — halted at the event horizon.</div>}

        <div className="border-t border-white/5 pt-2 text-[10px] leading-snug text-slate-500">
          <span className="text-slate-400">Provenance</span> · {modelRef.current.provenance}
        </div>
      </aside>

      <div className="relative min-w-0 flex-1">
        <canvas ref={canvasRef} className="h-full w-full touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} onContextMenu={(e) => e.preventDefault()} />
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/40 px-2 py-1 text-[11px] text-slate-300 ring-1 ring-white/10">{modelRef.current.label} · numerical geodesics of g<sub>μν</sub></div>
      </div>
    </div>
  );
}

// ── canvas helpers ──
type Pt = { x: number; y: number } | null;
function seg(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) { if (!a || !b) return; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
function axis(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string, label: string) {
  if (!a || !b) return;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.fillStyle = color; ctx.font = "11px ui-monospace, monospace"; ctx.fillText(label, b.x + 3, b.y);
}
function hexA(hex: string, a: number): string { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

function equatorialCircle(ctx: CanvasRenderingContext2D, P: (p: Vec3) => Pt, r: number, color: string, dashed: boolean, label?: string) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.2; if (dashed) ctx.setLineDash([4, 4]);
  ctx.beginPath(); let started = false; let lastPt: Pt = null;
  for (let i = 0; i <= 96; i++) { const th = (2 * Math.PI * i) / 96; const s = P([r * Math.cos(th), r * Math.sin(th), 0]); if (!s) { started = false; continue; } if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y); lastPt = s; }
  ctx.stroke(); ctx.setLineDash([]);
  if (label && lastPt) { ctx.fillStyle = color; ctx.font = "10px ui-monospace, monospace"; ctx.fillText(label, lastPt.x + 3, lastPt.y); }
}
function equatorialDisk(ctx: CanvasRenderingContext2D, P: (p: Vec3) => Pt, r: number, fill: string) {
  ctx.fillStyle = fill; ctx.beginPath(); let started = false;
  for (let i = 0; i <= 64; i++) { const th = (2 * Math.PI * i) / 64; const s = P([r * Math.cos(th), r * Math.sin(th), 0]); if (!s) continue; if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y); }
  ctx.closePath(); ctx.fill();
}
function wireSphere(ctx: CanvasRenderingContext2D, P: (p: Vec3) => Pt, r: number, color: string) {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  // latitude rings
  for (let li = 1; li < 4; li++) {
    const th = (Math.PI * li) / 4, z = r * Math.cos(th), rr = r * Math.sin(th);
    ctx.beginPath(); let started = false;
    for (let i = 0; i <= 48; i++) { const ph = (2 * Math.PI * i) / 48; const s = P([rr * Math.cos(ph), rr * Math.sin(ph), z]); if (!s) { started = false; continue; } if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y); }
    ctx.stroke();
  }
  // meridians
  for (let mi = 0; mi < 4; mi++) {
    const ph = (Math.PI * mi) / 4;
    ctx.beginPath(); let started = false;
    for (let i = 0; i <= 48; i++) { const th = (2 * Math.PI * i) / 48; const s = P([r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)]); if (!s) { started = false; continue; } if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y); }
    ctx.stroke();
  }
}
