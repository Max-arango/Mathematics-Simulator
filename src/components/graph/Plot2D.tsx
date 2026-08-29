import { useEffect, useRef, useState } from "react";
import { compile1 } from "../../mathlab/core/eval.ts";
import { derivative } from "../../mathlab/calculus/derivative.ts";
import { useGraph } from "../../graph/graphStore.ts";
import type { Scene } from "../../mathlab/graph/scene.ts";

interface View { cx: number; cy: number; scale: number } // scale = pixels per unit

// "Nice" grid step near a target pixel spacing (1·2·5 × 10^k).
function niceStep(unitsPerTarget: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(unitsPerTarget)));
  const f = unitsPerTarget / p;
  return (f < 2 ? 1 : f < 5 ? 2 : 5) * p;
}

const HANDLE_PX = 9; // grab radius for the a/b handles

export function Plot2D({ scene, onTrace }: { scene: Scene; onTrace: (t: { x: number; y: number } | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ cx: 0, cy: 0, scale: 60 });
  // drag target: pan, or one of the analysis handles.
  const drag = useRef<{ mode: "pan" | "a" | "b"; x: number; y: number } | null>(null);

  const tool = useGraph((s) => s.tool);
  const a = useGraph((s) => s.a);
  const b = useGraph((s) => s.b);
  const setA = useGraph((s) => s.setA);
  const setB = useGraph((s) => s.setB);

  // First visible curve → f and f' (for locator / tangent / integral).
  const firstBody = scene.plots[0]?.body ?? null;
  const funcs = (() => {
    if (!firstBody) return null;
    try {
      const f = compile1(firstBody, "x", scene.env);
      const df = compile1(derivative(firstBody, "x"), "x", scene.env);
      return { f, df };
    } catch {
      return null;
    }
  })();

  const draw = () => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { cx, cy, scale } = view;
    const toPxX = (x: number) => (x - cx) * scale + w / 2;
    const toPxY = (y: number) => h / 2 - (y - cy) * scale;
    const toX = (px: number) => (px - w / 2) / scale + cx;

    const step = niceStep(80 / scale);
    const xMin = toX(0), xMax = toX(w);
    const yTop = cy + (h / 2) / scale, yBot = cy - (h / 2) / scale;
    const axisY = toPxY(0), axisX = toPxX(0);

    // Grid.
    ctx.lineWidth = 1;
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "#5a6b8a";
    for (let gx = Math.ceil(xMin / step) * step; gx <= xMax; gx += step) {
      const px = toPxX(gx);
      ctx.strokeStyle = Math.abs(gx) < step / 2 ? "#41506e" : "#141b28";
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      if (Math.abs(gx) > step / 2) ctx.fillText(fmt(gx), px + 2, axisY - 3);
    }
    for (let gy = Math.ceil(yBot / step) * step; gy <= yTop; gy += step) {
      const py = toPxY(gy);
      ctx.strokeStyle = Math.abs(gy) < step / 2 ? "#41506e" : "#141b28";
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      if (Math.abs(gy) > step / 2) ctx.fillText(fmt(gy), axisX + 3, py - 2);
    }

    // Emphasised x-axis "number line" with tick marks.
    const clampedAxisY = Math.max(0, Math.min(h, axisY));
    ctx.strokeStyle = "#5b6f96";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, clampedAxisY); ctx.lineTo(w, clampedAxisY); ctx.stroke();
    ctx.strokeStyle = "#7d92bd";
    ctx.lineWidth = 1;
    for (let gx = Math.ceil(xMin / step) * step; gx <= xMax; gx += step) {
      const px = toPxX(gx);
      ctx.beginPath(); ctx.moveTo(px, clampedAxisY - 4); ctx.lineTo(px, clampedAxisY + 4); ctx.stroke();
    }

    // Curves — one point per pixel column, break on NaN / large jumps.
    const maxJump = h * 2;
    for (const plot of scene.plots) {
      let f: (x: number) => number;
      try { f = compile1(plot.body, "x", scene.env); } catch { continue; }
      ctx.strokeStyle = plot.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let pen = false;
      for (let px = 0; px <= w; px++) {
        const y = f(toX(px));
        if (!Number.isFinite(y)) { pen = false; continue; }
        const py = toPxY(y);
        if (!pen) { ctx.moveTo(px, py); pen = true; }
        else {
          const prevPy = toPxY(f(toX(px - 1)));
          if (Number.isFinite(prevPy) && Math.abs(py - prevPy) > maxJump) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }

    // ---- Analysis overlay on the first curve ------------------------------
    if (funcs) drawAnalysis(ctx, { w, h, toPxX, toPxY, toX, axisY: clampedAxisY, f: funcs.f, df: funcs.df });
  };

  const drawAnalysis = (
    ctx: CanvasRenderingContext2D,
    p: { w: number; h: number; toPxX: (x: number) => number; toPxY: (y: number) => number; toX: (px: number) => number; axisY: number; f: (x: number) => number; df: (x: number) => number },
  ) => {
    const { w, h, toPxX, toPxY, axisY, f, df } = p;

    // Integral: shaded area between the curve and the x-axis over [a, b].
    if (tool === "integral") {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const pxLo = toPxX(lo), pxHi = toPxX(hi);
      ctx.beginPath();
      ctx.moveTo(pxLo, axisY);
      for (let px = Math.max(0, pxLo); px <= Math.min(w, pxHi); px++) {
        const y = f(p.toX(px));
        ctx.lineTo(px, Number.isFinite(y) ? toPxY(y) : axisY);
      }
      ctx.lineTo(Math.min(w, pxHi), axisY);
      ctx.closePath();
      ctx.fillStyle = "rgba(56,224,200,0.22)";
      ctx.fill();
      for (const bx of [lo, hi]) drawVBar(ctx, toPxX(bx), h, "#38e0c8");
    }

    // Tangent line at x=a on the first curve.
    if (tool === "derivative") {
      const fa = f(a), m = df(a);
      if (Number.isFinite(fa) && Number.isFinite(m)) {
        ctx.strokeStyle = "#6fcf97";
        ctx.lineWidth = 1.75;
        ctx.setLineDash([]);
        const yL = fa + m * (p.toX(0) - a);
        const yR = fa + m * (p.toX(w) - a);
        ctx.beginPath();
        ctx.moveTo(0, toPxY(yL));
        ctx.lineTo(w, toPxY(yR));
        ctx.stroke();
        dot(ctx, toPxX(a), toPxY(fa), "#6fcf97");
      }
      drawVBar(ctx, toPxX(a), h, "#6fcf97");
    }

    // Locator: draggable point on the x-axis + guide to the curve.
    if (tool === "locate") {
      const fa = f(a);
      drawVBar(ctx, toPxX(a), h, "#f2c94c");
      if (Number.isFinite(fa)) {
        ctx.strokeStyle = "rgba(242,201,76,0.5)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(toPxX(a), axisY); ctx.lineTo(toPxX(a), toPxY(fa)); ctx.stroke();
        ctx.setLineDash([]);
        dot(ctx, toPxX(a), toPxY(fa), "#f2c94c");
      }
      dot(ctx, toPxX(a), axisY, "#f2c94c");
    }
  };

  useEffect(draw);
  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pxToX = (px: number, r: DOMRect) => (px - r.width / 2) / view.scale + view.cx;

  const onWheel = (e: React.WheelEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setView((v) => {
      const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
      const wx = (mx - r.width / 2) / v.scale + v.cx;
      const wy = v.cy - (my - r.height / 2) / v.scale;
      const scale = v.scale * factor;
      return { scale, cx: wx - (mx - r.width / 2) / scale, cy: wy + (my - r.height / 2) / scale };
    });
  };

  const onDown = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const toPx = (x: number) => (x - view.cx) * view.scale + r.width / 2;
    // Grab an analysis handle if the cursor is near its vertical bar.
    let mode: "pan" | "a" | "b" = "pan";
    if (tool === "integral") {
      if (Math.abs(mx - toPx(a)) < HANDLE_PX) mode = "a";
      else if (Math.abs(mx - toPx(b)) < HANDLE_PX) mode = "b";
    } else if ((tool === "locate" || tool === "derivative") && Math.abs(mx - toPx(a)) < HANDLE_PX) {
      mode = "a";
    }
    drag.current = { mode, x: e.clientX, y: e.clientY };
    ref.current!.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const d = drag.current;
    if (d) {
      if (d.mode === "pan") {
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        d.x = e.clientX; d.y = e.clientY;
        setView((v) => ({ ...v, cx: v.cx - dx / v.scale, cy: v.cy + dy / v.scale }));
      } else {
        const x = pxToX(e.clientX - r.left, r);
        d.mode === "a" ? setA(x) : setB(x);
      }
    } else {
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      onTrace({ x: (mx - r.width / 2) / view.scale + view.cx, y: view.cy - (my - r.height / 2) / view.scale });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    drag.current = null;
    if (ref.current!.hasPointerCapture(e.pointerId)) ref.current!.releasePointerCapture(e.pointerId);
  };

  return (
    <canvas
      ref={ref}
      className="h-full w-full touch-none"
      style={{ display: "block", cursor: drag.current?.mode === "pan" ? "grabbing" : "crosshair" }}
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => onTrace(null)}
    />
  );
}

function drawVBar(ctx: CanvasRenderingContext2D, px: number, h: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
  ctx.globalAlpha = 1;
}

function dot(ctx: CanvasRenderingContext2D, px: number, py: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
}

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(0);
  return String(Number(v.toFixed(4)));
}
