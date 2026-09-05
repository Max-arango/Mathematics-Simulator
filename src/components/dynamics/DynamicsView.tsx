import { useEffect, useMemo, useRef, useState } from "react";
import { makeSystem, evalField, type DynamicalSystem } from "../../mathlab/dynamics/system.ts";
import { findEquilibria } from "../../mathlab/dynamics/equilibria.ts";
import { classifyEquilibrium, type Classification } from "../../mathlab/dynamics/stability.ts";

const PRESETS: { name: string; fx: string; fy: string }[] = [
  { name: "Rotation (center)", fx: "y", fy: "-x" },
  { name: "Damped oscillator", fx: "y", fy: "-x - 0.3*y" },
  { name: "Saddle", fx: "x", fy: "-y" },
  { name: "Van der Pol", fx: "y", fy: "2*(1 - x^2)*y - x" },
  { name: "Pendulum", fx: "y", fy: "-sin(x) - 0.2*y" },
  { name: "Spiral sink", fx: "-x - 2*y", fy: "2*x - y" },
];
const STAB_COLOR: Record<Classification, string> = {
  "stable-node": "#34d399", "stable-spiral": "#a78bfa",
  "unstable-node": "#f87171", "unstable-spiral": "#fb7185",
  saddle: "#fbbf24", center: "#38bdf8", inconclusive: "#94a3b8",
};

interface View { cx: number; cy: number; span: number } // span = world height in view
interface Particle { start: [number, number]; pos: [number, number]; trail: [number, number][]; done: boolean; end: [number, number] | null; escaped: boolean }

// One RK4 step of the autonomous field ẏ = f(y).
function rk4Step(sys: DynamicalSystem, y: [number, number], dt: number): [number, number] {
  const f = (p: [number, number]) => evalField(sys, p) as [number, number];
  const add = (a: number[], b: number[], s: number): [number, number] => [a[0] + b[0] * s, a[1] + b[1] * s];
  const k1 = f(y), k2 = f(add(y, k1, dt / 2)), k3 = f(add(y, k2, dt / 2)), k4 = f(add(y, k3, dt));
  return [y[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), y[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
}

export function DynamicsView() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fx, setFx] = useState("y");
  const [fy, setFy] = useState("-x - 0.3*y");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ cx: 0, cy: 0, span: 12 });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(3);
  const [, force] = useState(0);

  const sys = useMemo<DynamicalSystem | null>(() => {
    try { setError(null); return makeSystem(["x", "y"], [fx, fy]); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
  }, [fx, fy]);

  const equilibria = useMemo(() => {
    if (!sys) return [];
    try { return findEquilibria(sys, { range: [-14, 14], gridPoints: 13 }).points.map((p) => ({ p, cls: classifyEquilibrium(sys, p).type })); }
    catch { return []; }
  }, [sys]);

  // Refs so the rAF loop reads live values without re-subscribing.
  const sysRef = useRef(sys); sysRef.current = sys;
  const viewRef = useRef(view); viewRef.current = view;
  const eqRef = useRef(equilibria); eqRef.current = equilibria;
  const playRef = useRef(playing); playRef.current = playing;
  const speedRef = useRef(speed); speedRef.current = speed;
  const particles = useRef<Particle[]>([]);

  const px = (x: number, y: number, w: number, h: number, v: View): [number, number] => {
    const aspect = w / h;
    return [((x - v.cx) / (v.span * aspect) + 0.5) * w, (0.5 - (y - v.cy) / v.span) * h];
  };
  const world = (pxx: number, pyy: number, w: number, h: number, v: View): [number, number] => {
    const aspect = w / h;
    return [v.cx + (pxx / w - 0.5) * v.span * aspect, v.cy + (0.5 - pyy / h) * v.span];
  };

  const draw = () => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const v = viewRef.current, s = sysRef.current;
    const aspect = w / h;

    // grid + axes at integer world coords
    const step = niceStep(v.span / 10);
    ctx.font = "10px ui-monospace, monospace"; ctx.fillStyle = "#4a5a7a";
    const x0 = v.cx - v.span * aspect / 2, x1 = v.cx + v.span * aspect / 2, y0 = v.cy - v.span / 2, y1 = v.cy + v.span / 2;
    ctx.lineWidth = 1;
    for (let gx = Math.ceil(x0 / step) * step; gx <= x1; gx += step) { const [sx] = px(gx, 0, w, h, v); ctx.strokeStyle = Math.abs(gx) < step / 2 ? "#41506e" : "#141b28"; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke(); }
    for (let gy = Math.ceil(y0 / step) * step; gy <= y1; gy += step) { const [, sy] = px(0, gy, w, h, v); ctx.strokeStyle = Math.abs(gy) < step / 2 ? "#41506e" : "#141b28"; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke(); }

    if (!s) return;

    // vector field
    const N = 22, len = (w / N) * 0.4;
    ctx.strokeStyle = "#3a4d6e";
    for (let i = 0; i < N; i++) for (let j = 0; j < Math.round(N / aspect); j++) {
      const wx = x0 + (i + 0.5) * (x1 - x0) / N, wy = y0 + (j + 0.5) * (y1 - y0) / Math.round(N / aspect);
      let f: number[]; try { f = evalField(s, [wx, wy]); } catch { continue; }
      const m = Math.hypot(f[0], f[1]); if (!m || !Number.isFinite(m)) continue;
      const [ax, ay] = px(wx, wy, w, h, v);
      const dx = (f[0] / m) * len, dy = -(f[1] / m) * len, ang = Math.atan2(dy, dx);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + dx, ay + dy);
      ctx.moveTo(ax + dx, ay + dy); ctx.lineTo(ax + dx - 4 * Math.cos(ang - 0.4), ay + dy - 4 * Math.sin(ang - 0.4));
      ctx.moveTo(ax + dx, ay + dy); ctx.lineTo(ax + dx - 4 * Math.cos(ang + 0.4), ay + dy - 4 * Math.sin(ang + 0.4)); ctx.stroke();
    }

    // particle trails + moving dots + start/end markers
    for (const p of particles.current) {
      ctx.strokeStyle = "#38e0c8"; ctx.lineWidth = 1.8; ctx.beginPath();
      p.trail.forEach((pt, k) => { const [sx, sy] = px(pt[0], pt[1], w, h, v); k ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
      ctx.stroke();
      const [stx, sty] = px(p.start[0], p.start[1], w, h, v);
      ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.arc(stx, sty, 3, 0, 7); ctx.fill(); // start
      if (!p.done) { const [hx, hy] = px(p.pos[0], p.pos[1], w, h, v); ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(hx, hy, 5, 0, 7); ctx.fill(); }
      if (p.end) { const [ex, ey] = px(p.end[0], p.end[1], w, h, v); ctx.strokeStyle = "#f472b6"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ex, ey, 7, 0, 7); ctx.stroke(); }
    }

    // equilibria
    for (const { p, cls } of eqRef.current) {
      const [sx, sy] = px(p[0], p[1], w, h, v);
      if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
      ctx.fillStyle = STAB_COLOR[cls]; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = "#000a"; ctx.lineWidth = 1; ctx.stroke();
    }
  };

  // Animation + render loop.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const s = sysRef.current;
      if (s && playRef.current) {
        const dt = 0.02, sub = Math.max(1, Math.round(speedRef.current));
        for (const p of particles.current) {
          if (p.done) continue;
          for (let k = 0; k < sub; k++) {
            let next: [number, number]; try { next = rk4Step(s, p.pos, dt); } catch { p.done = true; break; }
            if (!Number.isFinite(next[0]) || !Number.isFinite(next[1]) || Math.hypot(next[0], next[1]) > 1e4) { p.done = true; p.escaped = true; break; }
            let vel: number; try { vel = Math.hypot(...(evalField(s, next) as [number, number])); } catch { vel = 1; }
            p.pos = next; p.trail.push(next); if (p.trail.length > 4000) p.trail.shift();
            if (vel < 2e-3) { p.done = true; p.end = next; break; } // reached an equilibrium / singularity
          }
        }
        force((n) => n + 1); // refresh sidebar readout
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pointer: drag = pan, click (no drag) = launch a particle from that world point.
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; ref.current!.setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
    if (!drag.current.moved) return;
    const r = ref.current!.getBoundingClientRect(); const v = viewRef.current, aspect = r.width / r.height;
    setView({ cx: v.cx - (e.clientX - (drag.current.x)) / r.width * v.span * aspect, cy: v.cy + (e.clientY - drag.current.y) / r.height * v.span, span: v.span });
    drag.current.x = e.clientX; drag.current.y = e.clientY;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (ref.current!.hasPointerCapture(e.pointerId)) ref.current!.releasePointerCapture(e.pointerId);
    if (!d || d.moved || !sysRef.current) return;
    const r = ref.current!.getBoundingClientRect();
    const start = world(e.clientX - r.left, e.clientY - r.top, r.width, r.height, viewRef.current);
    particles.current.push({ start, pos: [...start], trail: [start], done: false, end: null, escaped: false });
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = ref.current!.getBoundingClientRect(); const v = viewRef.current;
    const [wx, wy] = world(e.clientX - r.left, e.clientY - r.top, r.width, r.height, v);
    const span = Math.max(0.2, Math.min(200, v.span * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
    const aspect = r.width / r.height;
    // keep cursor world point fixed
    const fxp = (e.clientX - r.left) / r.width - 0.5, fyp = 0.5 - (e.clientY - r.top) / r.height;
    setView({ span, cx: wx - fxp * span * aspect, cy: wy - fyp * span });
  };

  const active = particles.current.filter((p) => !p.done).length;
  const inputCls = "flex-1 rounded bg-slate-800/80 px-2 py-1 font-mono text-sm text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400";
  const btn = "rounded px-2 py-1 text-xs";
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
          {PRESETS.map((p) => <button key={p.name} onClick={() => { setFx(p.fx); setFy(p.fy); particles.current = []; }} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-cyan-200">{p.name}</button>)}
        </div>

        <div className="rounded bg-black/30 p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <button onClick={() => setPlaying((p) => !p)} className={`${btn} flex-1 font-medium ${playing ? "bg-fuchsia-500/20 text-fuchsia-200" : "bg-cyan-500/15 text-cyan-200"}`}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
            <button onClick={() => { particles.current = []; }} className={`${btn} bg-white/5 text-slate-300 hover:bg-white/10`}>Clear</button>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-400"><span>speed</span><input type="range" className="flex-1" min={1} max={10} step={1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
          <p className="mt-1 text-[10px] text-slate-500">{active} moving · {particles.current.length} total</p>
        </div>

        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Equilibria (end / singular points)</h3>
          {equilibria.length ? equilibria.map(({ p, cls }, i) => (
            <div key={i} className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-slate-400">({p[0].toFixed(2)}, {p[1].toFixed(2)})</span>
              <span style={{ color: STAB_COLOR[cls] }}>{cls}</span>
            </div>
          )) : <span className="text-[11px] text-slate-500">none found</span>}
        </div>

        <div className="mt-auto space-y-1 text-[10px] text-slate-500">
          <p><b className="text-slate-300">Click</b> the plane → launch a particle from that start point; it flows to its end (a singular/equilibrium point).</p>
          <p><b className="text-slate-300">Drag</b> to pan · <b className="text-slate-300">wheel</b> to zoom.</p>
          <p>● white = start · ● yellow = moving · ○ pink = end (singularity)</p>
        </div>
      </aside>
      <main className="relative min-w-0 flex-1">
        <canvas ref={ref} className="h-full w-full touch-none" style={{ display: "block", cursor: "crosshair" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} />
      </main>
    </div>
  );
}

function niceStep(u: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(u))), f = u / p;
  return (f < 2 ? 1 : f < 5 ? 2 : 5) * p;
}
