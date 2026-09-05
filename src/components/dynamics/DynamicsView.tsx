// Dynamics workspace: a small interactive phase-plane lab for 2-D autonomous
// systems ẋ=f(x,y), ẏ=g(x,y). The view is a pure React + canvas layer over
// mathlab/dynamics/*; no parsing, evaluation, integration or eigensolving
// happens here — those are the math core's job.
import { useEffect, useMemo, useRef, useState } from "react";
import { makeSystem, evalField, jacobianField, type DynamicalSystem } from "../../mathlab/dynamics/system.ts";
import { findEquilibria } from "../../mathlab/dynamics/equilibria.ts";
import { classifyEquilibrium, type Classification, type StabilityResult } from "../../mathlab/dynamics/stability.ts";
import { nullclines } from "../../mathlab/dynamics/nullclines.ts";
import {
  createTrajectory, stepTrajectory, trimTrail,
  type TrajectoryState, type SimulationLimits,
} from "../../mathlab/dynamics/lifecycle.ts";
import {
  viewBounds, worldToScreen, screenToWorld, tickInterval, fieldGrid, magnitudeIntensity, type View,
} from "../../mathlab/dynamics/geometry.ts";
import { norm } from "../../mathlab/linear/vector.ts";

// ── presets: each carries a brief WHY-this-is-instructive. ───────────────────
interface Preset {
  name: string;
  fx: string;
  fy: string;
  note: string;
}
const PRESETS: Preset[] = [
  { name: "Rotation (center)", fx: "y", fy: "-x",
    note: "ẋ=y, ẏ=−x. Eigenvalues ±i ⇒ LINEAR center. Trajectories are exact orbits (no attractor)." },
  { name: "Damped oscillator", fx: "y", fy: "-x - 0.3*y",
    note: "ẍ+0.3ẋ+x=0. Stable spiral at origin: every trajectory winds inward." },
  { name: "Saddle", fx: "x", fy: "-y",
    note: "Linear saddle. Stable manifold along y-axis, unstable along x-axis. Initial condition decides the fate." },
  { name: "Van der Pol", fx: "y", fy: "2*(1 - x^2)*y - x",
    note: "Nonlinear oscillator with a limit cycle. The origin is an unstable spiral for |μ|>0." },
  { name: "Pendulum", fx: "y", fy: "-sin(x) - 0.2*y",
    note: "Damped pendulum. Equilibria at (nπ,0): stable at even n, unstable (saddle) at odd n." },
  { name: "Spiral sink", fx: "-x - 2*y", fy: "2*x - y",
    note: "λ = −1±2i. Strong rotation + decay: every trajectory spirals into the origin." },
];

// ── stability colour palette (single source of truth, used in legend + dots) ─
const STAB_COLOR: Record<Classification, string> = {
  "stable-node": "#34d399",
  "stable-spiral": "#a78bfa",
  "unstable-node": "#f87171",
  "unstable-spiral": "#fb7185",
  "saddle": "#fbbf24",
  "center": "#38bdf8",
  "inconclusive": "#94a3b8",
};

// ── per-trajectory status → colour. distinct so the eye picks destinations. ──
const STATUS_COLOR: Record<TrajectoryState["status"], string> = {
  running: "#fde047",      // current dot
  equilibrium: "#f472b6",  // pink end-marker
  escaped: "#94a3b8",      // slate: left the visible region
  timeout: "#fb923c",      // amber: ran out of budget
  numericalFailure: "#ef4444", // red: integrator blew up
  paused: "#cbd5e1",       // neutral: user paused
};

// Layer toggles (cheap state, recomputed once per render).
interface Layers { field: boolean; trails: boolean; nullclines: boolean; equilibria: boolean; }

// Mode of the cursor: "launch" (click→particle, drag→pan) or "probe" (no launch, shows F(x,y)).
type Mode = "launch" | "probe";

// ─── component ────────────────────────────────────────────────────────────────
export function DynamicsView() {
  const ref = useRef<HTMLCanvasElement>(null);

  // System definition.
  const [fx, setFx] = useState("y");
  const [fy, setFy] = useState("-x - 0.3*y");
  const [error, setError] = useState<string | null>(null);

  // Camera.
  const [view, setView] = useState<View>({ cx: 0, cy: 0, span: 12 });

  // Simulation controls.
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(3);             // 1..10 sub-steps per frame
  const [trailLen, setTrailLen] = useState(800);     // samples retained per trajectory
  const [showTrails, _setShowTrails] = useState(true);

  // Display layers.
  const [layers, setLayers] = useState<Layers>({ field: true, trails: true, nullclines: false, equilibria: true });
  const [mode, setMode] = useState<Mode>("launch");
  const [selectedEq, setSelectedEq] = useState<number | null>(null);

  // Probe readout.
  const [probe, setProbe] = useState<{ x: number; y: number; F: [number, number]; mag: number } | null>(null);

  // Track the latest frame's render side-info to feed the sidebar without
  // re-rendering on every animation tick (sampled at a low cadence).
  const [, forceSidebar] = useState(0);

  // Parse + classify the system. Memoized on (fx,fy) — a separate cached layer
  // from the animation state.
  const sys = useMemo<DynamicalSystem | null>(() => {
    try { setError(null); return makeSystem(["x", "y"], [fx, fy]); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
  }, [fx, fy]);

  const equilibria = useMemo(() => {
    if (!sys) return [];
    try {
      const { points } = findEquilibria(sys, { range: [-14, 14], gridPoints: 11 });
      return points.map((p) => ({ point: p, stab: classifyEquilibrium(sys, p) }));
    } catch { return []; }
  }, [sys]);

  const nullclinesData = useMemo(() => {
    if (!sys || !layers.nullclines) return null;
    try {
      const span = view.span;
      return nullclines(sys, {
        xMin: view.cx - span, xMax: view.cx + span, // wider than viewport to give margin
        yMin: view.cy - span, yMax: view.cy + span,
        rows: 28, cols: 56,
      });
    } catch { return null; }
  }, [sys, layers.nullclines, view.cx, view.cy, view.span]);

  // Refs so the rAF loop reads live values without re-subscribing.
  const sysRef = useRef(sys); sysRef.current = sys;
  const eqRef = useRef(equilibria); eqRef.current = equilibria;
  const viewRef = useRef(view); viewRef.current = view;
  const playRef = useRef(playing); playRef.current = playing;
  const speedRef = useRef(speed); speedRef.current = speed;
  const trailLenRef = useRef(trailLen); trailLenRef.current = trailLen;
  const showTrailsRef = useRef(showTrails); showTrailsRef.current = showTrails;
  const layersRef = useRef(layers); layersRef.current = layers;
  const nullclinesRef = useRef(nullclinesData); nullclinesRef.current = nullclinesData;
  const probeRef = useRef(probe); probeRef.current = probe;
  const modeRef = useRef(mode); modeRef.current = mode;
  const trajectories = useRef<TrajectoryState[]>([]);

  // Reset camera / simulation. Keep these distinct so they never get conflated.
  const resetView = () => setView({ cx: 0, cy: 0, span: 12 });
  const resetSimulation = () => { trajectories.current = []; };

  // ── draw + animation loop. ────────────────────────────────────────────────
  const draw = () => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const v = viewRef.current;
    const bounds = viewBounds(v, w, h);

    // Adaptive grid step (in world units). Fewer labels when zoomed out.
    const step = tickInterval(v.span, 10);
    ctx.font = "10px ui-monospace, monospace"; ctx.fillStyle = "#4a5a7a"; ctx.lineWidth = 1;
    for (let gx = Math.ceil(bounds.xMin / step) * step; gx <= bounds.xMax; gx += step) {
      const [sx] = worldToScreen(gx, 0, w, h, v);
      ctx.strokeStyle = Math.abs(gx) < step / 2 ? "#41506e" : "#141b28";
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
    }
    for (let gy = Math.ceil(bounds.yMin / step) * step; gy <= bounds.yMax; gy += step) {
      const [, sy] = worldToScreen(0, gy, w, h, v);
      ctx.strokeStyle = Math.abs(gy) < step / 2 ? "#41506e" : "#141b28";
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();
    }
    // Axis labels at the origin (or near it if it's offscreen).
    const labelAnchor = worldToScreen(0, 0, w, h, v);
    const labelVisible = (px: number, py: number) =>
      px >= 12 && px <= w - 30 && py >= 0 && py <= h - 12;
    if (labelVisible(labelAnchor[0], labelAnchor[1])) {
      ctx.fillStyle = "#6c7a96";
      for (let gx = Math.ceil(bounds.xMin / step) * step; gx <= bounds.xMax; gx += step) {
        if (Math.abs(gx) < step / 2) continue;
        const [sx] = worldToScreen(gx, 0, w, h, v);
        ctx.fillText(fmtTick(gx), sx + 2, labelAnchor[1] - 2);
      }
      for (let gy = Math.ceil(bounds.yMin / step) * step; gy <= bounds.yMax; gy += step) {
        if (Math.abs(gy) < step / 2) continue;
        const [, sy] = worldToScreen(0, gy, w, h, v);
        ctx.fillText(fmtTick(gy), labelAnchor[0] + 4, sy - 2);
      }
    }

    const s = sysRef.current;
    if (!s) return;

    // Vector field — adaptive density, magnitude via colour (arrows encode direction only).
    if (layersRef.current.field) {
      const { rows, cols } = fieldGrid(v.span);
      const gridW = (bounds.xMax - bounds.xMin);
      const gridH = (bounds.yMax - bounds.yMin);
      const dx = gridW / cols, dy = gridH / rows;
      // Arrow length is FIXED in pixels (visual stability) — independent of |F|.
      const len = Math.max(6, Math.min((w / cols) * 0.42, (h / rows) * 0.42));

      // One pass to compute reference magnitude (robust percentile-like ref).
      let refMag = 1;
      {
        let mags: number[] = [];
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const wx = bounds.xMin + (i + 0.5) * dx, wy = bounds.yMin + (j + 0.5) * dy;
          let f: number[]; try { f = evalField(s, [wx, wy]); } catch { continue; }
          const m = Math.hypot(f[0], f[1]);
          if (Number.isFinite(m) && m > 0) mags.push(m);
        }
        mags.sort((a, b) => a - b);
        // Use the 75th percentile as ref so a handful of huge vectors don't dominate the colour.
        refMag = mags.length ? mags[Math.floor(mags.length * 0.75)] : 1;
      }

      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const wx = bounds.xMin + (i + 0.5) * dx, wy = bounds.yMin + (j + 0.5) * dy;
        let f: number[]; try { f = evalField(s, [wx, wy]); } catch { continue; }
        const m = Math.hypot(f[0], f[1]);
        if (!Number.isFinite(m) || m === 0) continue;
        const [ax, ay] = worldToScreen(wx, wy, w, h, v);
        const nx = f[0] / m, ny = f[1] / m;
        const ex = ax + nx * len, ey = ay - ny * len;
        const alpha = magnitudeIntensity(m, refMag);
        ctx.strokeStyle = `rgba(140,170,210,${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(ex, ey);
        const ang = Math.atan2(ey - ay, ex - ax);
        ctx.moveTo(ex, ey); ctx.lineTo(ex - 4 * Math.cos(ang - 0.4), ey - 4 * Math.sin(ang - 0.4));
        ctx.moveTo(ex, ey); ctx.lineTo(ex - 4 * Math.cos(ang + 0.4), ey - 4 * Math.sin(ang + 0.4));
        ctx.stroke();
      }
    }

    // Nullclines — drawn AFTER the field so they read as "structure on top of arrows".
    if (layersRef.current.nullclines) {
      const nc = nullclinesRef.current;
      if (nc) {
        drawPolyline(ctx, nc.xNullcline.samples, "#22d3ee", bounds, w, h, v); // cyan
        drawPolyline(ctx, nc.yNullcline.samples, "#f472b6", bounds, w, h, v); // pink
      }
    }

    // Trails + status markers.
    if (showTrailsRef.current) {
      for (const tr of trajectories.current) {
        const pts = tr.trail;
        if (pts.length < 2) continue;
        ctx.strokeStyle = "rgba(56,224,200,0.85)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
          const [sx, sy] = worldToScreen(pts[k][0], pts[k][1], w, h, v);
          if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
    }

    for (const tr of trajectories.current) {
      const [ix, iy] = worldToScreen(tr.initialPosition[0], tr.initialPosition[1], w, h, v);
      // initial dot — small white square, always visible.
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(ix - 2, iy - 2, 4, 4);

      if (tr.status === "running" || tr.status === "paused") {
        const [hx, hy] = worldToScreen(tr.currentPosition[0], tr.currentPosition[1], w, h, v);
        ctx.fillStyle = STATUS_COLOR[tr.status];
        ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill();
        // Velocity tick (a short tick in the F direction) — makes the live state legible.
        if (norm(tr.direction) > 0) {
          ctx.strokeStyle = STATUS_COLOR[tr.status];
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx + tr.direction[0] * 10, hy - tr.direction[1] * 10);
          ctx.stroke();
        }
      } else if (tr.termination) {
        const [ex, ey] = worldToScreen(tr.termination.at[0], tr.termination.at[1], w, h, v);
        ctx.strokeStyle = STATUS_COLOR[tr.status];
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.stroke();

        // Visual link to the destination equilibrium (when status === "equilibrium")
        // — a thin dashed segment from the trajectory end to the equilibrium dot.
        if (tr.status === "equilibrium" && tr.termination.destinationEquilibrium !== undefined) {
          const eq = eqRef.current[tr.termination.destinationEquilibrium];
          if (eq) {
            const [qx, qy] = worldToScreen(eq.point[0], eq.point[1], w, h, v);
            ctx.strokeStyle = "rgba(244,114,182,0.6)";
            ctx.setLineDash([3, 3]);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(qx, qy); ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
    }

    // Equilibria — always drawn last; the ring around the selected one.
    if (layersRef.current.equilibria) {
      for (let i = 0; i < eqRef.current.length; i++) {
        const { point, stab } = eqRef.current[i];
        const [sx, sy] = worldToScreen(point[0], point[1], w, h, v);
        if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
        ctx.fillStyle = STAB_COLOR[stab.type];
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        ctx.lineWidth = 1;
        ctx.stroke();
        if (selectedEq === i) {
          ctx.strokeStyle = "#f8fafc";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    // Probe readout overlay.
    const p = probeRef.current;
    if (p) {
      const [sx, sy] = worldToScreen(p.x, p.y, w, h, v);
      ctx.strokeStyle = "#fde047"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy); ctx.lineTo(sx + 6, sy);
      ctx.moveTo(sx, sy - 6); ctx.lineTo(sx, sy + 6);
      ctx.stroke();
      // Readout chip.
      const lines = [
        `(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
        `F = (${p.F[0].toExponential(2)}, ${p.F[1].toExponential(2)})`,
        `‖F‖ = ${p.mag.toExponential(2)}`,
      ];
      ctx.font = "11px ui-monospace, monospace";
      const chipW = 160, chipH = lines.length * 14 + 8;
      const cx = Math.min(w - chipW - 4, sx + 12);
      const cy = Math.min(h - chipH - 4, sy + 12);
      ctx.fillStyle = "rgba(8,11,20,0.85)";
      ctx.fillRect(cx, cy, chipW, chipH);
      ctx.strokeStyle = "#fde047"; ctx.strokeRect(cx, cy, chipW, chipH);
      ctx.fillStyle = "#fde047";
      lines.forEach((line, k) => ctx.fillText(line, cx + 6, cy + 14 + k * 14));
    }
  };

  // Animation/integration loop.
  useEffect(() => {
    let raf = 0;
    let lastSidebar = 0;
    const loop = (now: number) => {
      const s = sysRef.current;
      if (s && playRef.current) {
        const dt = 0.02, sub = Math.max(1, Math.round(speedRef.current));
        const vp = viewBounds(viewRef.current, 1, 1); // aspect doesn't matter for bounds here
        const limits: SimulationLimits = {
          viewport: { xMin: vp.xMin, xMax: vp.xMax, yMin: vp.yMin, yMax: vp.yMax },
          tMax: 200,
          equilibria: eqRef.current.map((e) => e.point),
        };
        for (const tr of trajectories.current) {
          if (tr.status !== "running") continue;
          for (let k = 0; k < sub; k++) stepTrajectory(s, tr, dt, limits);
          trimTrail(tr.trail, trailLenRef.current);
        }
        // Sidebar readout throttled to ~10 Hz to avoid thrash.
        if (now - lastSidebar > 100) { forceSidebar((n) => n + 1); lastSidebar = now; }
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── input: drag = pan, click = launch; wheel = zoom (cursor-anchored). ────
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    ref.current!.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const w = r.width, h = r.height;

    // Probe mode: track the cursor even when not dragging.
    if (modeRef.current === "probe") {
      const [wx, wy] = screenToWorld(e.clientX - r.left, e.clientY - r.top, w, h, viewRef.current);
      const s = sysRef.current;
      if (s) {
        try {
          const F = evalField(s, [wx, wy]) as [number, number];
          if (F.every(Number.isFinite)) setProbe({ x: wx, y: wy, F, mag: Math.hypot(F[0], F[1]) });
          else setProbe(null);
        } catch { setProbe(null); }
      }
    }

    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
    if (!drag.current.moved) return;
    const v = viewRef.current, aspect = w / h;
    // pan: world shifts OPPOSITE to cursor motion.
    const dWx = -(dx / w) * v.span * aspect;
    const dWy = (dy / h) * v.span;
    setView({ cx: v.cx + dWx, cy: v.cy + dWy, span: v.span });
    drag.current.x = e.clientX; drag.current.y = e.clientY;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (ref.current!.hasPointerCapture(e.pointerId)) ref.current!.releasePointerCapture(e.pointerId);
    if (!d || d.moved || !sysRef.current || modeRef.current !== "launch") return;
    const r = ref.current!.getBoundingClientRect();
    const start = screenToWorld(e.clientX - r.left, e.clientY - r.top, r.width, r.height, viewRef.current);
    // Click-to-equilibrium selection: if the cursor is within snap radius of a known eq, select it.
    let bestEq = -1, bestD = 0.4;
    for (let i = 0; i < eqRef.current.length; i++) {
      const D = Math.hypot(eqRef.current[i].point[0] - start[0], eqRef.current[i].point[1] - start[1]);
      if (D < bestD) { bestD = D; bestEq = i; }
    }
    if (bestEq !== -1) { setSelectedEq(bestEq); return; }
    // Otherwise launch a trajectory from this point.
    const tr = createTrajectory(sysRef.current, start, 0.02);
    trajectories.current.push(tr);
  };
  const onPointerLeave = () => { if (modeRef.current === "probe") setProbe(null); };

  // Cursor-anchored zoom: the world point under the cursor must STAY under it.
  const onWheel = (e: React.WheelEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const v = viewRef.current;
    const w = r.width, h = r.height;
    const [wx, wy] = screenToWorld(e.clientX - r.left, e.clientY - r.top, w, h, v);
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const span = Math.max(0.2, Math.min(200, v.span * factor));
    const aspect = w / h;
    const fxp = (e.clientX - r.left) / w - 0.5;
    const fyp = 0.5 - (e.clientY - r.top) / h;
    setView({ span, cx: wx - fxp * span * aspect, cy: wy - fyp * span });
  };

  // ── stats for the sidebar readout. ─────────────────────────────────────────
  const running = trajectories.current.filter((t) => t.status === "running").length;
  const ended = trajectories.current.length - running;
  const lastTerminated = [...trajectories.current].reverse().find((t) => t.status !== "running" && t.status !== "paused");

  // ── render ────────────────────────────────────────────────────────────────
  const inputCls = "flex-1 rounded bg-slate-800/80 px-2 py-1 font-mono text-sm text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400";
  const btn = "rounded px-2 py-1 text-xs";
  const selectedEqInfo: { point: number[]; stab: StabilityResult } | null =
    selectedEq !== null && equilibria[selectedEq] ? equilibria[selectedEq] : null;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/5 bg-[#080b14] p-3">
        <div>
          <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">System ẋ = f(x,y)</h2>
          <div className="mb-1 flex items-center gap-1"><span className="w-8 font-mono text-xs text-slate-400">ẋ =</span><input className={inputCls} value={fx} spellCheck={false} onChange={(e) => setFx(e.target.value)} /></div>
          <div className="flex items-center gap-1"><span className="w-8 font-mono text-xs text-slate-400">ẏ =</span><input className={inputCls} value={fy} spellCheck={false} onChange={(e) => setFy(e.target.value)} /></div>
          {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
        </div>

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Presets</h3>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => { setFx(p.fx); setFy(p.fy); trajectories.current = []; setSelectedEq(null); }}
                className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-cyan-200">
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded bg-black/30 p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <button onClick={() => setPlaying((p) => !p)} className={`${btn} flex-1 font-medium ${playing ? "bg-fuchsia-500/20 text-fuchsia-200" : "bg-cyan-500/15 text-cyan-200"}`}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
            <button onClick={resetSimulation} className={`${btn} bg-white/5 text-slate-300 hover:bg-white/10`} title="Remove all particles">Clear</button>
          </div>
          <div className="mb-1.5 flex gap-1">
            <button onClick={resetView} className={`${btn} flex-1 bg-white/5 text-slate-300 hover:bg-white/10`} title="Restore camera">Reset view</button>
            <button onClick={() => { resetSimulation(); resetView(); }} className={`${btn} flex-1 bg-white/5 text-slate-300 hover:bg-white/10`} title="Clear + restore camera">Reset all</button>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-12">speed</span>
            <input type="range" className="flex-1" min={1} max={10} step={1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            <span className="w-4 text-right font-mono">{speed}</span>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-12">trail</span>
            <input type="range" className="flex-1" min={50} max={4000} step={50} value={trailLen} onChange={(e) => setTrailLen(Number(e.target.value))} />
            <span className="w-10 text-right font-mono">{trailLen}</span>
          </label>
          <p className="mt-1 text-[10px] text-slate-500">
            {running} running · {ended} ended · {trajectories.current.length} total
          </p>
        </div>

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Layers</h3>
          {([
            ["field", "Vector field"],
            ["trails", "Trajectories"],
            ["nullclines", "Nullclines (f=0, g=0)"],
            ["equilibria", "Equilibria"],
          ] as [keyof Layers, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Mode</h3>
          <div className="flex gap-1">
            {(["launch", "probe"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`${btn} flex-1 ${mode === m ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
                {m === "launch" ? "Click → launch" : "Probe"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Equilibria</h3>
          {equilibria.length === 0 && <span className="text-[11px] text-slate-500">none found</span>}
          <div className="space-y-0.5">
            {equilibria.map(({ point, stab }, i) => (
              <button key={i} onClick={() => setSelectedEq(i)}
                className={`flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left font-mono text-[11px] ${selectedEq === i ? "bg-white/10" : "hover:bg-white/5"}`}>
                <span className="text-slate-300">({point[0].toFixed(2)}, {point[1].toFixed(2)})</span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: STAB_COLOR[stab.type] }} />
                  <span style={{ color: STAB_COLOR[stab.type] }}>{stab.type}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {selectedEqInfo && (
          <EquilibriumPanel info={selectedEqInfo} sys={sys} />
        )}

        <div className="mt-auto space-y-1 text-[10px] text-slate-500">
          <p><b className="text-slate-300">Click</b> plane → launch. <b className="text-slate-300">Drag</b> → pan. <b className="text-slate-300">Wheel</b> → zoom.</p>
          <p><b className="text-slate-300">Probe</b> → inspect F(x,y) locally.</p>
          <p><b className="text-slate-300">Click</b> near an equilibrium → select it.</p>
          <p>Legend — white=initial · yellow=running · dashed=pink link=arrived at eq · slate=escaped · amber=timeout · red=numerical failure.</p>
        </div>
      </aside>
      <main className="relative min-w-0 flex-1">
        <canvas
          ref={ref}
          className="h-full w-full touch-none"
          style={{ display: "block", cursor: mode === "probe" ? "crosshair" : "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onWheel={onWheel}
        />
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 font-mono text-[10px] text-slate-400">
          t = {(lastTerminated?.elapsedTime ?? trajectories.current[0]?.elapsedTime ?? 0).toFixed(2)} ·
          {" "}dt = 0.02 · span = {view.span.toFixed(2)}
        </div>
      </main>
    </div>
  );
}

// ── Equilibrium inspection panel. Pure presentational; reads a StabilityResult ──
function EquilibriumPanel({ info, sys }: { info: { point: number[]; stab: StabilityResult }; sys: DynamicalSystem | null }) {
  const { point, stab } = info;
  const J = sys ? jacobianField(sys, point) : null;
  const round = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(4)) : v);
  return (
    <div className="rounded bg-black/30 p-2 text-[11px] text-slate-300">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-cyan-200">Equilibrium</span>
        <span style={{ color: STAB_COLOR[stab.type] }}>{stab.type}</span>
      </div>
      <div className="font-mono text-slate-400">
        ({point[0].toFixed(3)}, {point[1].toFixed(3)})
      </div>
      {J && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono">
          <span className="text-slate-500">J</span>
          <span className="font-mono">
            [{J[0][0].toFixed(3)}, {J[0][1].toFixed(3)}<br />
            <span className="ml-3">{J[1][0].toFixed(3)}, {J[1][1].toFixed(3)}]</span>]
          </span>
          <span className="text-slate-500">λ</span>
          <span className="font-mono">
            {stab.eigenvalues.map((z, i) => (
              <span key={i}>
                {round(z.re)} {z.im >= 0 ? "+" : "−"} {Math.abs(round(z.im))}i
                {i < stab.eigenvalues.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
        </div>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{stab.reason}</p>
    </div>
  );
}

// ── helpers (private to the component file) ──────────────────────────────────
function drawPolyline(
  ctx: CanvasRenderingContext2D,
  pts: number[][],
  color: string,
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  w: number, h: number, v: View,
) {
  if (pts.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (let k = 0; k < pts.length; k++) {
    const [x, y] = pts[k];
    if (x < bounds.xMin || x > bounds.xMax || y < bounds.yMin || y > bounds.yMax) {
      // Lift the pen: jump to next segment.
      ctx.stroke();
      ctx.beginPath();
      continue;
    }
    const [sx, sy] = worldToScreen(x, y, w, h, v);
    if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function fmtTick(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 100 || a < 0.01) return v.toExponential(1);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}