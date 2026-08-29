import { useEffect, useRef, useState } from "react";
import { Renderer } from "../webgl/Renderer.ts";
import { buildCustomShader } from "../webgl/customShader.ts";
import { useStore } from "../store.ts";
import { FRACTAL_BY_ID } from "../fractals/registry.ts";

export interface Stats {
  fps: number;
  ms: number;
  width: number;
  height: number;
}

const MAX_DPR = 2;

/** Convert a pointer event to a fraction (0..1) of the canvas, y flipped to math orientation. */
function eventFrac(e: { clientX: number; clientY: number }, el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return {
    fx: (e.clientX - r.left) / r.width,
    fy: 1 - (e.clientY - r.top) / r.height,
    aspect: r.width / r.height,
  };
}

export function FractalCanvas({ onStats }: { onStats: (s: Stats) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const dirty = useRef(true);
  const [error, setError] = useState<string | null>(null);

  // Set up renderer + resize + render loop once.
  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    rendererRef.current = renderer;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        dirty.current = true;
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const unsub = useStore.subscribe(() => (dirty.current = true));

    let raf = 0;
    let last = performance.now();
    let fps = 0;
    let acc = 0;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      fps = fps * 0.9 + (1000 / Math.max(dt, 1)) * 0.1;
      if (dirty.current) {
        dirty.current = false;
        const s = useStore.getState();
        const f = FRACTAL_BY_ID[s.activeId];
        const t0 = performance.now();
        renderer.render({
          width: canvas.width,
          height: canvas.height,
          centerRe: s.view.centerRe,
          centerIm: s.view.centerIm,
          span: s.view.span,
          maxIter: s.params.iterations,
          escapeRadius: s.params.escapeRadius ?? 8,
          exponent: s.params.exponent ?? 2,
          shaderType: f.shaderType,
          juliaCRe: s.params.cRe ?? 0,
          juliaCIm: s.params.cIm ?? 0,
          palette: s.palette,
          colorOffset: s.colorOffset,
          colorScale: s.colorScale,
          invert: s.invert,
          custom: !!f.custom,
        });
        const ms = performance.now() - t0;
        onStats({ fps: Math.round(fps), ms: Math.round(ms * 10) / 10, width: canvas.width, height: canvas.height });
      }
      acc += dt;
      if (acc > 250) {
        acc = 0;
        onStats({ fps: Math.round(fps), ms: -1, width: canvas.width, height: canvas.height });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      unsub();
    };
    // onStats is stable enough; deliberately run-once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pointer interaction.
  useEffect(() => {
    const canvas = canvasRef.current!;
    let dragging = false;
    let lastRe = 0;
    let lastIm = 0;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { fx, fy, aspect } = eventFrac(e, canvas);
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      useStore.getState().zoomAt(fx, fy, aspect, factor);
    };
    const onDown = (e: PointerEvent) => {
      const st = useStore.getState();
      const { fx, fy, aspect } = eventFrac(e, canvas);
      const v = st.view;
      if (st.pickMode && !FRACTAL_BY_ID[st.activeId].usesJuliaC) {
        const re = v.centerRe + (fx - 0.5) * v.span * aspect;
        const im = v.centerIm + (fy - 0.5) * v.span;
        st.juliaFromPoint(re, im);
        return;
      }
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      lastRe = e.clientX;
      lastIm = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const r = canvas.getBoundingClientRect();
      const st = useStore.getState();
      const aspect = r.width / r.height;
      const dxFrac = (e.clientX - lastRe) / r.width;
      const dyFrac = (e.clientY - lastIm) / r.height;
      lastRe = e.clientX;
      lastIm = e.clientY;
      // Drag moves the plane with the cursor (invert x, keep y since screen y is flipped).
      st.panBy(-dxFrac * st.view.span * aspect, dyFrac * st.view.span);
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, []);

  // Recompile the custom-expression program whenever the active expression changes.
  const activeId = useStore((s) => s.activeId);
  const customExpr = useStore((s) => s.customExpr);
  const complexExpr = useStore((s) => s.complexExpr);
  useEffect(() => {
    const f = FRACTAL_BY_ID[activeId];
    const renderer = rendererRef.current;
    if (!f.custom || !renderer) return;
    const src = f.domain ? complexExpr : customExpr;
    const { fragment, error } = buildCustomShader(src);
    if (error || !fragment) {
      useStore.getState().setExprError(error ?? "Compile error");
      return;
    }
    useStore.getState().setExprError(renderer.setCustomFragment(fragment));
    dirty.current = true;
  }, [activeId, customExpr, complexExpr]);

  const pickMode = useStore((s) => s.pickMode);
  const usesC = useStore((s) => FRACTAL_BY_ID[s.activeId].usesJuliaC);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-red-300">
        <div>
          <p className="mb-2 font-semibold">WebGL error</p>
          <p className="text-sm text-red-200/70">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none"
      style={{ cursor: pickMode && !usesC ? "crosshair" : "grab", display: "block" }}
    />
  );
}
