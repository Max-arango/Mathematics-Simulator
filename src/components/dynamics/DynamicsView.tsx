import { useEffect, useMemo, useRef, useState } from "react";
import { makeSystem, evalField, type DynamicalSystem } from "../../mathlab/dynamics/system.ts";
import { findEquilibria } from "../../mathlab/dynamics/equilibria.ts";
import { classifyEquilibrium, type Classification } from "../../mathlab/dynamics/stability.ts";
import { simulate } from "../../mathlab/dynamics/trajectory.ts";

const R = 6; // view half-extent
const PRESETS: { name: string; fx: string; fy: string }[] = [
  { name: "Rotation (center)", fx: "y", fy: "-x" },
  { name: "Damped oscillator", fx: "y", fy: "-x - 0.3*y" },
  { name: "Saddle", fx: "x", fy: "-y" },
  { name: "Van der Pol", fx: "y", fy: "2*(1 - x^2)*y - x" },
  { name: "Pendulum", fx: "y", fy: "-sin(x) - 0.2*y" },
  { name: "Unstable node", fx: "x + 0.5*y", fy: "0.5*x + y" },
];
const STAB_COLOR: Record<Classification, string> = {
  "stable-node": "#34d399", "stable-spiral": "#a78bfa",
  "unstable-node": "#f87171", "unstable-spiral": "#fb7185",
  saddle: "#fbbf24", center: "#38bdf8", inconclusive: "#94a3b8",
};

export function DynamicsView() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fx, setFx] = useState("y");
  const [fy, setFy] = useState("-x - 0.3*y");
  const [trajectories, setTrajectories] = useState<[number, number][][]>([]);
  const [error, setError] = useState<string | null>(null);

  const sys = useMemo<DynamicalSystem | null>(() => {
    try { setError(null); return makeSystem(["x", "y"], [fx, fy]); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
  }, [fx, fy]);

  const equilibriaInfo = useMemo(() => {
    if (!sys) return [];
    try {
      return findEquilibria(sys, { range: [-R, R], gridPoints: 9 }).points.map((p) => ({ p, cls: classifyEquilibrium(sys, p).type }));
    } catch { return []; }
  }, [sys]);

  const toPx = (x: number, y: number, w: number, h: number): [number, number] => [((x + R) / (2 * R)) * w, h - ((y + R) / (2 * R)) * h];
  const toWorld = (px: number, py: number, w: number, h: number): [number, number] => [(px / w) * 2 * R - R, ((h - py) / h) * 2 * R - R];

  const draw = () => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "#141b28"; ctx.lineWidth = 1;
    for (let i = -R; i <= R; i++) {
      const [gx] = toPx(i, 0, w, h), [, gy] = toPx(0, i, w, h);
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }
    ctx.strokeStyle = "#41506e"; const [ax] = toPx(0, 0, w, h), [, ay] = toPx(0, 0, w, h);
    ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, h); ctx.moveTo(0, ay); ctx.lineTo(w, ay); ctx.stroke();

    if (!sys) return;

    // vector field
    const N = 21, len = (w / N) * 0.42;
    ctx.strokeStyle = "#3a4d6e";
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = -R + (i + 0.5) * (2 * R / N), y = -R + (j + 0.5) * (2 * R / N);
      let v: number[]; try { v = evalField(sys, [x, y]); } catch { continue; }
      const m = Math.hypot(v[0], v[1]); if (!m || !Number.isFinite(m)) continue;
      const [px, py] = toPx(x, y, w, h);
      const dx = (v[0] / m) * len, dy = -(v[1] / m) * len;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + dx, py + dy); ctx.stroke();
      const a = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(px + dx, py + dy); ctx.lineTo(px + dx - 4 * Math.cos(a - 0.4), py + dy - 4 * Math.sin(a - 0.4));
      ctx.moveTo(px + dx, py + dy); ctx.lineTo(px + dx - 4 * Math.cos(a + 0.4), py + dy - 4 * Math.sin(a + 0.4)); ctx.stroke();
    }

    ctx.strokeStyle = "#38e0c8"; ctx.lineWidth = 1.6;
    for (const traj of trajectories) {
      ctx.beginPath();
      traj.forEach(([x, y], k) => { const [px, py] = toPx(x, y, w, h); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    }

    for (const { p, cls } of equilibriaInfo) {
      const [px, py] = toPx(p[0], p[1], w, h);
      ctx.fillStyle = STAB_COLOR[cls]; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#0008"; ctx.lineWidth = 1; ctx.stroke();
    }
  };

  useEffect(draw);
  useEffect(() => { const ro = new ResizeObserver(draw); if (ref.current) ro.observe(ref.current); return () => ro.disconnect(); }, []); // eslint-disable-line

  const addTrajectory = (e: React.PointerEvent) => {
    if (!sys) return;
    const r = ref.current!.getBoundingClientRect();
    const [x0, y0] = toWorld(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    const clip = (pts: number[][]) => pts.map((p) => [p[0], p[1]] as [number, number]).filter((p) => Math.abs(p[0]) < R * 1.5 && Math.abs(p[1]) < R * 1.5);
    try {
      const fwd = simulate(sys, [x0, y0], { t1: 12, steps: 600 }).states;
      const back = simulate(makeSystem(["x", "y"], [`-(${fx})`, `-(${fy})`]), [x0, y0], { t1: 12, steps: 600 }).states;
      setTrajectories((t) => [...t, [...clip(back).reverse(), ...clip(fwd)]]);
    } catch { /* ignore bad system */ }
  };

  const inputCls = "flex-1 rounded bg-slate-800/80 px-2 py-1 font-mono text-sm text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400";
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/5 bg-[#080b14] p-3">
        <div>
          <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">System ẋ = f(x,y)</h2>
          <div className="mb-1 flex items-center gap-1"><span className="w-8 font-mono text-xs text-slate-400">ẋ =</span><input className={inputCls} value={fx} spellCheck={false} onChange={(e) => setFx(e.target.value)} /></div>
          <div className="flex items-center gap-1"><span className="w-8 font-mono text-xs text-slate-400">ẏ =</span><input className={inputCls} value={fy} spellCheck={false} onChange={(e) => setFy(e.target.value)} /></div>
          {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
        </div>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => <button key={p.name} onClick={() => { setFx(p.fx); setFy(p.fy); setTrajectories([]); }} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-cyan-200">{p.name}</button>)}
        </div>
        <button onClick={() => setTrajectories([])} className="rounded bg-white/5 py-1.5 text-xs text-slate-300 hover:bg-white/10">Clear trajectories</button>
        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Equilibria + stability</h3>
          {equilibriaInfo.length ? equilibriaInfo.map(({ p, cls }, i) => (
            <div key={i} className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-slate-400">({p[0].toFixed(2)}, {p[1].toFixed(2)})</span>
              <span style={{ color: STAB_COLOR[cls] }}>{cls}</span>
            </div>
          )) : <span className="text-[11px] text-slate-500">none found in view</span>}
        </div>
        <p className="text-[10px] text-slate-600">Click the phase plane to trace a trajectory (RK4, both directions). Equilibria classified numerically via the Jacobian spectrum.</p>
      </aside>
      <main className="relative min-w-0 flex-1">
        <canvas ref={ref} className="h-full w-full touch-none" style={{ display: "block", cursor: "crosshair" }} onPointerDown={addTrajectory} />
      </main>
    </div>
  );
}
