// Dynamics 3D — Mathematical Vector Field model (renderer + controls).
//
// The user defines an arbitrary field  x' = F(x):  dx/dt, dy/dt, dz/dt over x,y,z
// (+ named params). We integrate one trajectory per seed with the SHARED ODE solver
// and render the streamlines through the project's own orbit camera (graph/mat4) —
// true (x,y,z) projection, same camera feel as the gravity view. No bodies, no
// gravity: this is pure phase-space flow. All math lives in mathlab/dynamics3d/
// vectorField.ts (which reuses mathlab/dynamics + mathlab/ode); this file only draws.
import { useEffect, useRef, useState } from "react";
import { perspective, multiply, orbitViewAt, orbitBasis, project } from "../graph/mat4.ts";
import {
  buildFieldSystem, integrateStreamlines, streamlineBounds, sampleFieldArrows,
  FIELD_PRESETS, type Vec3, type Streamline, type FieldArrow, type FieldPreset,
} from "../../mathlab/dynamics3d/vectorField.ts";

const SEED_COLORS = ["#f472b6", "#38bdf8", "#4ade80", "#fbbf24", "#a78bfa", "#22d3ee", "#fb923c", "#f87171"];

const AXIS_LABELS: [string, string, string] = ["dx/dt", "dy/dt", "dz/dt"];

export function VectorField3DView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── camera: orbit around target, OrbitControls-style damping (actual ⟵ desired) ──
  const yaw = useRef(0.9), pitch = useRef(0.35), dist = useRef(95);
  const target = useRef<Vec3>([0, 0, 25]);
  const yawD = useRef(0.9), pitchD = useRef(0.35), distD = useRef(95);
  const targetD = useRef<Vec3>([0, 0, 25]);

  // ── integration state (out of React — recomputed only on Apply/preset) ──
  const linesRef = useRef<Streamline[]>([]);
  const arrowsRef = useRef<FieldArrow[]>([]);
  const seedsRef = useRef<Vec3[]>(FIELD_PRESETS[0].seeds);
  const tEndRef = useRef(FIELD_PRESETS[0].tEnd);
  const stepsRef = useRef(FIELD_PRESETS[0].steps);
  const boundsRef = useRef({ center: [0, 0, 25] as Vec3, radius: 30 });
  const phase = useRef(0); // probe animation head, 0..1

  // ── UI state ──
  const [presetId, setPresetId] = useState(FIELD_PRESETS[0].id);
  const [fields, setFields] = useState<[string, string, string]>(FIELD_PRESETS[0].field);
  const [params, setParams] = useState<Record<string, number>>({ ...FIELD_PRESETS[0].params });
  const [error, setError] = useState<string | null>(null);
  const [viz, setViz] = useState({ streamlines: true, arrows: false, probes: true, axes: true, grid: true });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.25);
  const vizRef = useRef(viz); vizRef.current = viz;
  const playRef = useRef(playing); playRef.current = playing;
  const speedRef = useRef(speed); speedRef.current = speed;
  const paramsRef = useRef(params); paramsRef.current = params;
  const [, forceUI] = useState(0);

  // Integrate the current field. Any parse/eval error is caught and shown — never
  // allowed to crash the render loop (the field is re-parsed here, on demand only).
  const recompute = (fld: [string, string, string], prm: Record<string, number>, refit: boolean) => {
    try {
      const sys = buildFieldSystem({ field: fld, params: prm });
      const lines = integrateStreamlines(sys, seedsRef.current, tEndRef.current, stepsRef.current);
      linesRef.current = lines;
      const b = streamlineBounds(lines);
      boundsRef.current = b;
      arrowsRef.current = vizRef.current.arrows ? sampleFieldArrows(sys, b.center, b.radius, 5) : [];
      setError(null);
      if (refit) fitCamera(b.center, b.radius);
    } catch (e) {
      linesRef.current = [];
      arrowsRef.current = [];
      setError((e as Error).message);
    }
  };

  const fitCamera = (center: Vec3, radius: number) => {
    targetD.current = [...center];
    distD.current = Math.max(6, radius * 2.6);
  };

  const loadPreset = (p: FieldPreset) => {
    seedsRef.current = p.seeds;
    tEndRef.current = p.tEnd;
    stepsRef.current = p.steps;
    yawD.current = p.view.yaw; pitchD.current = p.view.pitch; distD.current = p.view.dist;
    targetD.current = [...p.view.target];
    setPresetId(p.id);
    setFields(p.field);
    setParams({ ...p.params });
    paramsRef.current = { ...p.params };
    phase.current = 0;
    recompute(p.field, p.params, false);
    forceUI((n) => n + 1);
  };

  // Initial integration (once).
  useEffect(() => { recompute(FIELD_PRESETS[0].field, FIELD_PRESETS[0].params, false); /* eslint-disable-next-line */ }, []);

  // ── render loop: damping + probe advance + draw ──
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
    const mvp = multiply(perspective(Math.PI / 4, aspect, 0.1, 8000), orbitViewAt(yaw.current, pitch.current, dist.current, t[0], t[1], t[2]));
    const P = (p: Vec3) => project(mvp, p[0], p[1], p[2], w, h);
    const v = vizRef.current;
    const b = boundsRef.current;
    const L = Math.max(10, b.radius * 1.2); // axis length scales to the flow

    // Grid on z = 0.
    if (v.grid) {
      const G = Math.ceil(Math.max(12, b.radius) / 4) * 4, step = G / 5;
      ctx.strokeStyle = "rgba(80,100,140,0.16)"; ctx.lineWidth = 1;
      for (let i = -G; i <= G + 1e-6; i += step) {
        seg(ctx, P([b.center[0] + i, b.center[1] - G, 0]), P([b.center[0] + i, b.center[1] + G, 0]));
        seg(ctx, P([b.center[0] - G, b.center[1] + i, 0]), P([b.center[0] + G, b.center[1] + i, 0]));
      }
    }

    // Axes.
    if (v.axes) {
      axis(ctx, P([0, 0, 0]), P([L, 0, 0]), "#f87171", "x");
      axis(ctx, P([0, 0, 0]), P([0, L, 0]), "#4ade80", "y");
      axis(ctx, P([0, 0, 0]), P([0, 0, L]), "#60a5fa", "z");
    }

    // Field arrows (direction of F on a coarse grid).
    if (v.arrows) {
      const alen = b.radius * 0.14;
      for (const a of arrowsRef.current) {
        const tip: Vec3 = [a.pos[0] + a.dir[0] * alen, a.pos[1] + a.dir[1] * alen, a.pos[2] + a.dir[2] * alen];
        const s0 = P(a.pos), s1 = P(tip);
        if (!s0 || !s1) continue;
        ctx.strokeStyle = "rgba(96,165,250,0.4)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
        ctx.fillStyle = "rgba(147,197,253,0.7)"; ctx.beginPath(); ctx.arc(s1.x, s1.y, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Streamlines (one integral curve per seed).
    const lines = linesRef.current;
    if (v.streamlines) {
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (line.points.length < 2) continue;
        ctx.strokeStyle = hexA(SEED_COLORS[li % SEED_COLORS.length], 0.5);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        let started = false;
        for (const p of line.points) {
          const s = P(p);
          if (!s) { started = false; continue; }
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
      }
    }

    // Probes — a lit head sweeping each trajectory to reveal flow direction/speed.
    if (v.probes) {
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const n = line.points.length; if (n < 2) continue;
        const head = Math.min(n - 1, Math.floor(phase.current * (n - 1)));
        const col = SEED_COLORS[li % SEED_COLORS.length];
        const tail = Math.max(0, head - Math.floor(n * 0.06));
        ctx.strokeStyle = hexA(col, 0.95); ctx.lineWidth = 2.2;
        ctx.beginPath();
        let started = false;
        for (let i = tail; i <= head; i++) {
          const s = P(line.points[i]);
          if (!s) { started = false; continue; }
          if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
        const sh = P(line.points[head]);
        if (sh) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sh.x, sh.y, 3, 0, Math.PI * 2); ctx.fill(); }
      }
    }

    // Seed markers.
    for (let li = 0; li < lines.length; li++) {
      const s = P(lines[li].seed);
      if (!s) continue;
      ctx.strokeStyle = hexA(SEED_COLORS[li % SEED_COLORS.length], 0.9); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 3.2, 0, Math.PI * 2); ctx.stroke();
    }

    // Divergence banner.
    const diverged = lines.some((l) => l.diverged);
    if (diverged) {
      ctx.fillStyle = "#fb923c"; ctx.font = "12px ui-monospace, monospace";
      ctx.fillText("⚠ a trajectory diverged (non-finite) — truncated at last finite state", 12, h - 12);
    }
  };

  // ── pointer: orbit / pan / zoom (same feel as the gravity view) ──
  const drag = useRef<{ x: number; y: number; pan: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.button === 2 || e.shiftKey };
    canvasRef.current!.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (drag.current.pan) {
      const { right, up } = orbitBasis(yaw.current, pitch.current);
      const s = dist.current * 0.0016, tg = targetD.current;
      for (let c = 0; c < 3; c++) tg[c] += (-dx * right[c] + dy * up[c]) * s;
    } else {
      yawD.current -= dx * 0.006;
      pitchD.current = Math.max(-1.45, Math.min(1.45, pitchD.current - dy * 0.006));
    }
    drag.current.x = e.clientX; drag.current.y = e.clientY;
  };
  const onUp = (e: React.PointerEvent) => {
    drag.current = null;
    if (canvasRef.current!.hasPointerCapture(e.pointerId)) canvasRef.current!.releasePointerCapture(e.pointerId);
  };
  const onWheel = (e: React.WheelEvent) => {
    const step = e.deltaY > 0 ? 1.08 : 1 / 1.08;
    distD.current = Math.max(4, Math.min(1000, distD.current * step));
  };
  const camPreset = (y: number, p: number) => { yawD.current = y; pitchD.current = p; };

  const apply = () => { paramsRef.current = params; recompute(fields, params, false); };
  const setParam = (k: string, val: number) => {
    const next = { ...paramsRef.current, [k]: val };
    setParams(next); paramsRef.current = next;
    recompute(fields, next, false);
  };
  const setField = (i: number, val: string) => {
    const next = [...fields] as [string, string, string]; next[i] = val; setFields(next);
  };

  const preset = FIELD_PRESETS.find((p) => p.id === presetId) ?? FIELD_PRESETS[0];
  const totalPts = linesRef.current.reduce((n, l) => n + l.points.length, 0);
  const dtStep = tEndRef.current / stepsRef.current;

  return (
    <div className="flex min-h-0 flex-1 bg-[#05070d] text-slate-200">
      {/* controls */}
      <aside className="w-72 shrink-0 space-y-3 overflow-y-auto border-r border-white/5 p-3 text-xs">
        <div>
          <div className="mb-1 font-semibold tracking-wide text-cyan-300">MODEL · Vector field x′ = F(x)</div>
          <p className="text-[11px] leading-snug text-slate-400">
            Define a 3D field. Trajectories are integrated by the shared ODE solver (RK4) — no eval, same core as the 2D lab.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-slate-400">Preset</span>
          <select
            value={presetId}
            onChange={(e) => { const p = FIELD_PRESETS.find((x) => x.id === e.target.value)!; loadPreset(p); }}
            className="w-full rounded bg-white/5 px-2 py-1.5 outline-none ring-1 ring-white/10"
          >
            {FIELD_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <p className="mt-1 text-[10.5px] leading-snug text-slate-500">{preset.description}</p>
        </label>

        <div className="space-y-1.5">
          {([0, 1, 2] as const).map((i) => (
            <label key={i} className="flex items-center gap-2">
              <span className="w-12 shrink-0 font-mono text-slate-400">{AXIS_LABELS[i]}</span>
              <input
                value={fields[i]}
                onChange={(e) => setField(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
                spellCheck={false}
                className="min-w-0 flex-1 rounded bg-white/5 px-2 py-1 font-mono outline-none ring-1 ring-white/10 focus:ring-cyan-400/40"
              />
            </label>
          ))}
          <button onClick={apply} className="w-full rounded bg-cyan-500/15 px-2 py-1.5 font-medium text-cyan-200 ring-1 ring-cyan-400/30 hover:bg-cyan-500/25">
            Apply field (⏎)
          </button>
        </div>

        {Object.keys(params).length > 0 && (
          <div className="space-y-1.5">
            <div className="text-slate-400">Parameters</div>
            {Object.entries(params).map(([k, val]) => (
              <label key={k} className="flex items-center gap-2">
                <span className="w-12 shrink-0 font-mono text-slate-400">{k}</span>
                <input
                  type="number" value={val} step="0.1"
                  onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setParam(k, n); }}
                  className="min-w-0 flex-1 rounded bg-white/5 px-2 py-1 font-mono outline-none ring-1 ring-white/10"
                />
              </label>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300 ring-1 ring-red-400/30">⚠ {error}</div>
        )}

        <div className="space-y-1">
          <div className="text-slate-400">Layers</div>
          {(["streamlines", "probes", "arrows", "axes", "grid"] as const).map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 capitalize">
              <input
                type="checkbox" checked={viz[k]}
                onChange={(e) => {
                  const next = { ...viz, [k]: e.target.checked }; setViz(next); vizRef.current = next;
                  if (k === "arrows") recompute(fields, paramsRef.current, false); // (re)build arrow grid
                }}
              />
              {k === "arrows" ? "Field arrows" : k}
            </label>
          ))}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <button onClick={() => setPlaying((p) => !p)} className="rounded bg-white/5 px-2 py-1 ring-1 ring-white/10 hover:bg-white/10">
              {playing ? "⏸ Pause" : "▶ Play"} probes
            </button>
          </div>
          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-slate-400">Speed</span>
            <input type="range" min={0.02} max={1} step={0.01} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1" />
          </label>
        </div>

        <div className="space-y-1">
          <div className="text-slate-400">Camera</div>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => fitCamera(boundsRef.current.center, boundsRef.current.radius)} className="rounded bg-white/5 px-2 py-1 ring-1 ring-white/10 hover:bg-white/10">Fit</button>
            <button onClick={() => camPreset(0.9, 1.45)} className="rounded bg-white/5 px-2 py-1 ring-1 ring-white/10 hover:bg-white/10">Top</button>
            <button onClick={() => camPreset(0, 0)} className="rounded bg-white/5 px-2 py-1 ring-1 ring-white/10 hover:bg-white/10">Front</button>
            <button onClick={() => camPreset(Math.PI / 2, 0)} className="rounded bg-white/5 px-2 py-1 ring-1 ring-white/10 hover:bg-white/10">Side</button>
          </div>
          <p className="text-[10px] leading-snug text-slate-500">Drag = orbit · wheel = zoom · Shift/right-drag = pan. Smoothed.</p>
        </div>

        <div className="border-t border-white/5 pt-2 text-[10px] leading-snug text-slate-500">
          <span className="text-slate-400">Numerical</span> · RK4 fixed-step · dt = {dtStep.toFixed(4)} · {stepsRef.current} steps · {totalPts.toLocaleString()} pts · {linesRef.current.length} seeds.
        </div>
      </aside>

      {/* canvas */}
      <div className="relative min-w-0 flex-1">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          onWheel={onWheel} onContextMenu={(e) => e.preventDefault()}
        />
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/40 px-2 py-1 text-[11px] text-slate-300 ring-1 ring-white/10">
          {preset.label} · numerical trajectory (not a closed form)
        </div>
      </div>
    </div>
  );
}

// ── tiny 2D-canvas helpers ──
type Pt = { x: number; y: number } | null;
function seg(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) { if (!a || !b) return; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
function axis(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string, label: string) {
  if (!a || !b) return;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.fillStyle = color; ctx.font = "11px ui-monospace, monospace"; ctx.fillText(label, b.x + 3, b.y);
}
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
