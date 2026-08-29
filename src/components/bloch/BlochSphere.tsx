import { useEffect, useRef } from "react";
import { perspective, multiply, orbitView, project, type Mat4 } from "../graph/mat4.ts";
import { buildBlochGeo, buildDynamic, buildPreview } from "./blochGeo.ts";
import { useBloch } from "../../bloch/blochStore.ts";
import { blochVector, arc, type Vec3 } from "../../bloch/qubit.ts";

const VS = `
attribute vec3 aPos; attribute vec3 aColor;
uniform mat4 uMVP; varying vec3 vColor;
void main() { vColor = aColor; gl_Position = uMVP * vec4(aPos, 1.0); gl_PointSize = 7.0; }
`;
const FS = `precision highp float; varying vec3 vColor; void main() { gl_FragColor = vec4(vColor, 1.0); }`;

const LABELS: { p: Vec3; t: string; c: string }[] = [
  { p: [0, 0, 1.3], t: "|0⟩", c: "#cfe0ff" },
  { p: [0, 0, -1.3], t: "|1⟩", c: "#cfe0ff" },
  { p: [1.32, 0, 0], t: "|+⟩", c: "#f2a6a6" },
  { p: [-1.34, 0, 0], t: "|−⟩", c: "#f2a6a6" },
  { p: [0, 1.32, 0], t: "|i⟩", c: "#a6e8b8" },
  { p: [0, -1.4, 0], t: "|−i⟩", c: "#a6e8b8" },
];

function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

export function BlochSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ yaw: -0.7, pitch: 0.45, dist: 3.4 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const glRef = useRef<{
    gl: WebGLRenderingContext; prog: WebGLProgram; uMVP: WebGLUniformLocation;
    geo: WebGLBuffer; geoCount: number; dyn: WebGLBuffer; pt: WebGLBuffer; prev: WebGLBuffer;
  } | null>(null);

  const state = useBloch((s) => s.state);
  const trajectory = useBloch((s) => s.trajectory);
  const lastArc = useBloch((s) => s.lastArc);
  const animSeq = useBloch((s) => s.animSeq);
  const preview = useBloch((s) => s.preview);
  const showTrail = useBloch((s) => s.showTrail);

  // Latest data for the imperative renderer.
  const data = useRef({ vec: blochVector(state), traj: trajectory, state, preview, showTrail });
  data.current = { vec: blochVector(state), traj: trajectory, state, preview, showTrail };

  // Init GL once.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.enable(gl.DEPTH_TEST);
    const geoData = buildBlochGeo();
    const geo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, geo); gl.bufferData(gl.ARRAY_BUFFER, geoData, gl.STATIC_DRAW);
    glRef.current = {
      gl, prog, uMVP: gl.getUniformLocation(prog, "uMVP")!,
      geo, geoCount: geoData.length / 6, dyn: gl.createBuffer()!, pt: gl.createBuffer()!, prev: gl.createBuffer()!,
    };
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function render(vecOverride?: Vec3) {
    const g = glRef.current;
    if (!g) return;
    const { gl, prog } = g;
    const canvas = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.03, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);

    const proj = perspective(Math.PI / 4, w / h || 1, 0.1, 100);
    const mvp = multiply(proj, orbitView(cam.current.yaw, cam.current.pitch, cam.current.dist));
    gl.uniformMatrix4fv(g.uMVP, false, mvp);

    const aPos = gl.getAttribLocation(prog, "aPos"), aCol = gl.getAttribLocation(prog, "aColor");
    const bind = (buf: WebGLBuffer) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 24, 12);
    };

    // Static wireframe.
    bind(g.geo);
    gl.drawArrays(gl.LINES, 0, g.geoCount);

    // Live pulse preview: rotation axis + ghost arc from the current state.
    const pv = data.current.preview;
    if (pv) {
      const ghost = pv.angle ? arc(data.current.state, pv.axis, pv.angle) : [];
      const pbuf = buildPreview(pv.axis, [data.current.vec, ...ghost]);
      if (pbuf.length) {
        gl.bindBuffer(gl.ARRAY_BUFFER, g.prev); gl.bufferData(gl.ARRAY_BUFFER, pbuf, gl.DYNAMIC_DRAW);
        bind(g.prev);
        gl.drawArrays(gl.LINES, 0, pbuf.length / 6);
      }
    }

    // Trajectory + state vector.
    const vec = vecOverride ?? data.current.vec;
    const dyn = buildDynamic(vec, data.current.traj, data.current.showTrail);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.dyn); gl.bufferData(gl.ARRAY_BUFFER, dyn, gl.DYNAMIC_DRAW);
    bind(g.dyn);
    gl.drawArrays(gl.LINES, 0, dyn.length / 6);

    // Bright tip marker.
    const pt = new Float32Array([vec[0], vec[1], vec[2], 1.0, 0.9, 0.35]);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.pt); gl.bufferData(gl.ARRAY_BUFFER, pt, gl.DYNAMIC_DRAW);
    bind(g.pt);
    gl.drawArrays(gl.POINTS, 0, 1);

    drawLabels(mvp, canvas.clientWidth, canvas.clientHeight, dpr);
  }

  function drawLabels(mvp: Mat4, w: number, h: number, dpr: number) {
    const lc = labelRef.current;
    if (!lc) return;
    const ctx = lc.getContext("2d")!;
    if (lc.width !== w * dpr || lc.height !== h * dpr) { lc.width = w * dpr; lc.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = "13px ui-monospace, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const l of LABELS) {
      const p = project(mvp, l.p[0], l.p[1], l.p[2], w, h);
      if (!p) continue;
      ctx.fillStyle = l.c;
      ctx.fillText(l.t, p.x, p.y);
    }
  }

  // Animate the arrow along the most recent arc whenever an op happens.
  useEffect(() => {
    let raf = 0;
    if (lastArc.length > 1) {
      const start = performance.now();
      const dur = 450;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const idx = Math.min(lastArc.length - 1, Math.floor(t * (lastArc.length - 1)));
        render(lastArc[idx]);
        if (t < 1) raf = requestAnimationFrame(step);
        else render();
      };
      raf = requestAnimationFrame(step);
    } else {
      render();
    }
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animSeq, state, trajectory]);

  // Live redraw as the pulse preview / trail toggle updates.
  useEffect(() => { render(); }, [preview, showTrail]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ro = new ResizeObserver(() => render());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; canvasRef.current!.setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    cam.current.yaw -= dx * 0.01;
    cam.current.pitch = Math.max(-1.5, Math.min(1.5, cam.current.pitch + dy * 0.01));
    render();
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    cam.current.dist = Math.max(2, Math.min(8, cam.current.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
    render();
  };

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" style={{ display: "block", cursor: "grab" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} />
      <canvas ref={labelRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </>
  );
}
