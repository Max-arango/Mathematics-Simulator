import { useEffect, useMemo, useRef, useState } from "react";
import { compile2, compile3 } from "../../mathlab/core/eval.ts";
import { derivative } from "../../mathlab/calculus/derivative.ts";
import { print } from "../../mathlab/core/print.ts";
import { perspective, multiply, orbitView, project, type Mat4 } from "./mat4.ts";
import { buildRefLines, vertexCount, niceIntStep } from "./refLines.ts";
import { marchingTets } from "./marchingTets.ts";
import { useGraph } from "../../graph/graphStore.ts";
import type { Scene } from "../../mathlab/graph/scene.ts";

const RES = 96;      // surface grid resolution per axis (explicit z=f(x,y))
const IMPLICIT_RES = 48; // volume grid resolution for implicit surfaces
const RANGE = 6;     // domain [-RANGE, RANGE] in x and y

const SURF_VS = `
attribute vec3 aPos; attribute vec3 aNormal;
uniform mat4 uMVP; varying float vZ; varying vec3 vN;
void main() { vZ = aPos.z; vN = aNormal; gl_Position = uMVP * vec4(aPos, 1.0); }
`;
// Each surface is tinted by its expression color (uColor), shaded low→high and
// by surface normal so several surfaces stay distinguishable on one plane.
const SURF_FS = `
precision highp float; varying float vZ; varying vec3 vN;
uniform vec3 uColor; uniform float uZExtent;
void main() {
  vec3 n = normalize(vN);
  float diff = 0.45 + 0.55 * abs(dot(n, normalize(vec3(0.4, 0.5, 0.8))));
  float t = clamp(vZ / (2.0 * uZExtent) + 0.5, 0.0, 1.0);
  vec3 base = mix(uColor * 0.55, mix(uColor, vec3(1.0), 0.35), t);
  gl_FragColor = vec4(base * diff, 1.0);
}
`;
const LINE_VS = `
attribute vec3 aPos; attribute vec3 aColor;
uniform mat4 uMVP; varying vec3 vColor;
void main() { vColor = aColor; gl_Position = uMVP * vec4(aPos, 1.0); }
`;
const LINE_FS = `precision highp float; varying vec3 vColor; void main() { gl_FragColor = vec4(vColor, 1.0); }`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
  return s;
}
function program(gl: WebGLRenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  return p;
}

// Build interleaved [x,y,z, nx,ny,nz] vertices + indices for z=f(x,y).
// Heights clamped to the box's vertical extent so the surface stays inside it.
function buildMesh(f: (x: number, y: number) => number, zClamp: number) {
  const n = RES;
  const zs = new Float32Array((n + 1) * (n + 1));
  const at = (i: number) => (RANGE * 2 * i) / n - RANGE;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const z = f(at(i), at(j));
      zs[j * (n + 1) + i] = Number.isFinite(z) ? Math.max(-zClamp, Math.min(zClamp, z)) : 0;
    }
  const verts = new Float32Array((n + 1) * (n + 1) * 6);
  const d = (RANGE * 2) / n;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i;
      const zL = zs[j * (n + 1) + Math.max(0, i - 1)], zR = zs[j * (n + 1) + Math.min(n, i + 1)];
      const zD = zs[Math.max(0, j - 1) * (n + 1) + i], zU = zs[Math.min(n, j + 1) * (n + 1) + i];
      let nx = -(zR - zL) / (2 * d), ny = -(zU - zD) / (2 * d), nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      verts.set([at(i), at(j), zs[k], nx, ny, nz], k * 6);
    }
  const idx: number[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + (n + 1), dd = c + 1;
      idx.push(a, b, c, b, dd, c);
    }
  return { verts, idx: new Uint32Array(idx) };
}

interface Surface { vbo: WebGLBuffer; ibo: WebGLBuffer | null; count: number; color: [number, number, number]; indexed: boolean }

interface GL {
  gl: WebGLRenderingContext;
  surf: WebGLProgram; surfMVP: WebGLUniformLocation; surfColor: WebGLUniformLocation; surfZ: WebGLUniformLocation;
  ln: WebGLProgram; lnMVP: WebGLUniformLocation;
  lvbo: WebGLBuffer;
  surfaces: Surface[];
  ext: OES_element_index_uint | null;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0.4, 0.8, 0.9];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

const VIEWS: Record<string, { yaw: number; pitch: number }> = {
  Iso: { yaw: 0.9, pitch: 0.5 },
  Top: { yaw: 0, pitch: 1.5533 },
  Front: { yaw: -Math.PI / 2, pitch: 0.02 },
  Side: { yaw: 0, pitch: 0.02 },
};

export function Plot3D({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ yaw: 0.9, pitch: 0.5, dist: 22 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const glRef = useRef<GL | null>(null);
  const [probe, setProbe] = useState({ x: 1, y: 1 });
  const [disp, setDisp] = useState({ yaw: 0.9, pitch: 0.5, dist: 22 });
  const [show, setShow] = useState({ grid: true, axes: true, box: true });
  const showRef = useRef(show);
  showRef.current = show;
  const zRange = useGraph((s) => s.zRange);
  const setZRange = useGraph((s) => s.setZRange);
  const zRef = useRef(zRange);
  zRef.current = zRange;

  const body = scene.plots[0]?.body ?? null;

  // Probe evaluation: z and partial derivatives at (probe.x, probe.y).
  const probeInfo = useMemo(() => {
    if (!body) return null;
    try {
      const f = compile2(body, "x", "y", scene.env);
      const dxB = derivative(body, "x"), dyB = derivative(body, "y");
      const fx = compile2(dxB, "x", "y", scene.env), fy = compile2(dyB, "x", "y", scene.env);
      const z = f(probe.x, probe.y);
      const gx = fx(probe.x, probe.y), gy = fy(probe.x, probe.y);
      return { z, gx, gy, dxExpr: print(dxB), dyExpr: print(dyB) };
    } catch {
      return null;
    }
  }, [body, scene.env, probe]);

  // Init GL once (both programs).
  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) return;
    const surf = program(gl, SURF_VS, SURF_FS);
    const ln = program(gl, LINE_VS, LINE_FS);
    gl.enable(gl.DEPTH_TEST);
    glRef.current = {
      gl, surf, surfMVP: gl.getUniformLocation(surf, "uMVP")!,
      surfColor: gl.getUniformLocation(surf, "uColor")!, surfZ: gl.getUniformLocation(surf, "uZExtent")!,
      ln, lnMVP: gl.getUniformLocation(ln, "uMVP")!,
      lvbo: gl.createBuffer()!, surfaces: [],
      ext: gl.getExtension("OES_element_index_uint"),
    };
    // No loseContext cleanup: StrictMode reuses the canvas.
  }, []);

  // Rebuild meshes when any plotted expression / implicit / env / z-range changes.
  const plotKey = scene.plots.map((p) => p.id).join(",") + "|" + scene.implicits.map((p) => p.id).join(",");
  useEffect(() => {
    const g = glRef.current;
    if (!g) return;
    const { gl } = g;
    // Dispose previous surface buffers.
    for (const s of g.surfaces) { gl.deleteBuffer(s.vbo); if (s.ibo) gl.deleteBuffer(s.ibo); }
    g.surfaces = [];

    // Explicit surfaces z = f(x,y) — indexed grid mesh.
    for (const plot of scene.plots) {
      let f: (x: number, y: number) => number;
      try { f = compile2(plot.body, "x", "y", scene.env); } catch { continue; }
      const { verts, idx } = buildMesh(f, zRef.current);
      const vbo = gl.createBuffer()!, ibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      g.surfaces.push({ vbo, ibo, count: g.ext ? idx.length : Math.min(idx.length, 65535), color: hexToRgb(plot.color), indexed: true });
    }

    // Implicit surfaces g(x,y,z)=0 — marching tetrahedra, raw triangles.
    const Z = zRef.current;
    for (const im of scene.implicits) {
      const gfn = compile3(im.g, scene.env);
      const tris = marchingTets(gfn, { xmin: -RANGE, xmax: RANGE, ymin: -RANGE, ymax: RANGE, zmin: -Z, zmax: Z }, IMPLICIT_RES);
      if (!tris.length) continue;
      const vbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, tris, gl.STATIC_DRAW);
      g.surfaces.push({ vbo, ibo: null, count: tris.length / 6, color: hexToRgb(im.color), indexed: false });
    }
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotKey, scene.env, zRange]);

  // Re-render on probe / camera / visibility / z-range changes.
  useEffect(render, [probe, disp, probeInfo, show, zRange]); // eslint-disable-line react-hooks/exhaustive-deps

  function render() {
    const g = glRef.current;
    if (!g) return;
    const { gl } = g;
    const canvas = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.03, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const proj = perspective(Math.PI / 4, w / h || 1, 0.1, 200);
    const mvp = multiply(proj, orbitView(cam.current.yaw, cam.current.pitch, cam.current.dist));

    // Reference lines (cartesian plane + axes + bounding box + probe).
    const z = probeInfo?.z;
    const lines = buildRefLines(RANGE, { x: probe.x, y: probe.y, z: z ?? NaN }, showRef.current, zRef.current);
    gl.useProgram(g.ln);
    gl.uniformMatrix4fv(g.lnMVP, false, mvp);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.lvbo);
    gl.bufferData(gl.ARRAY_BUFFER, lines, gl.DYNAMIC_DRAW);
    const lPos = gl.getAttribLocation(g.ln, "aPos"), lCol = gl.getAttribLocation(g.ln, "aColor");
    gl.enableVertexAttribArray(lPos); gl.vertexAttribPointer(lPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(lCol); gl.vertexAttribPointer(lCol, 3, gl.FLOAT, false, 24, 12);
    gl.drawArrays(gl.LINES, 0, vertexCount(lines));

    // Surfaces (one per expression, tinted by its color).
    if (g.surfaces.length) {
      gl.useProgram(g.surf);
      gl.uniformMatrix4fv(g.surfMVP, false, mvp);
      gl.uniform1f(g.surfZ, zRef.current);
      const aPos = gl.getAttribLocation(g.surf, "aPos"), aN = gl.getAttribLocation(g.surf, "aNormal");
      for (const s of g.surfaces) {
        gl.uniform3f(g.surfColor, s.color[0], s.color[1], s.color[2]);
        gl.bindBuffer(gl.ARRAY_BUFFER, s.vbo);
        gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 24, 12);
        if (s.indexed && s.ibo) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ibo);
          gl.drawElements(gl.TRIANGLES, s.count, g.ext ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
        } else {
          gl.drawArrays(gl.TRIANGLES, 0, s.count);
        }
      }
    }

    drawLabels(mvp, canvas.clientWidth, canvas.clientHeight, dpr);
  }

  // Axis numbers + X/Y/Z letters, projected to a 2D overlay canvas.
  function drawLabels(mvp: Mat4, w: number, h: number, dpr: number) {
    const lc = labelRef.current;
    if (!lc) return;
    const ctx = lc.getContext("2d")!;
    if (lc.width !== w * dpr || lc.height !== h * dpr) { lc.width = w * dpr; lc.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!showRef.current.axes) return;
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = (wx: number, wy: number, wz: number, text: string, color: string) => {
      const p = project(mvp, wx, wy, wz, w, h);
      if (!p) return;
      ctx.fillStyle = color;
      ctx.fillText(text, p.x, p.y);
    };
    ctx.fillStyle = "#8695b3";
    for (let i = -RANGE; i <= RANGE; i += 2) {
      if (i === 0) continue;
      label(i, -0.5, 0, `${i}`, "#8695b3");
      label(-0.5, i, 0, `${i}`, "#8695b3");
    }
    const Z = zRef.current, zStep = niceIntStep(Z);
    for (let i = -Math.floor(Z / zStep) * zStep; i <= Z; i += zStep) {
      if (Math.abs(i) < 1e-9) continue;
      label(0, -0.5, i, `${Number(i.toPrecision(4))}`, "#8695b3");
    }
    label(RANGE + 0.7, 0, 0, "x", "#f26b6b");
    label(0, RANGE + 0.7, 0, "y", "#73e58c");
    label(0, 0, Z + Z * 0.08 + 0.5, "z", "#809eff");
  }

  useEffect(() => {
    const ro = new ResizeObserver(render);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setView = (v: { yaw: number; pitch: number }) => {
    cam.current.yaw = v.yaw; cam.current.pitch = v.pitch;
    setDisp({ ...cam.current });
  };
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; ref.current!.setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    cam.current.yaw -= dx * 0.01;
    cam.current.pitch = Math.max(-1.55, Math.min(1.55, cam.current.pitch + dy * 0.01));
    render();
  };
  const onUp = () => { drag.current = null; setDisp({ ...cam.current }); };
  const onWheel = (e: React.WheelEvent) => {
    cam.current.dist = Math.max(4, Math.min(80, cam.current.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
    setDisp({ ...cam.current });
  };

  const deg = (r: number) => Math.round((r * 180) / Math.PI);
  const clampR = (n: number) => Math.max(-RANGE, Math.min(RANGE, n));
  const numCls = "w-16 rounded bg-slate-800/80 px-1.5 py-0.5 text-right font-mono text-cyan-100 tabular-nums outline-none focus:ring-1 focus:ring-cyan-400";
  const btn = "rounded bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white";

  const toggle = (k: "grid" | "axes" | "box") => setShow((s) => ({ ...s, [k]: !s[k] }));
  const tglCls = (on: boolean) => `rounded px-2 py-1 text-[11px] ${on ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "bg-white/5 text-slate-500 hover:text-slate-300"}`;

  return (
    <>
      <canvas
        ref={ref}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: "block", cursor: "grab" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel}
      />
      <canvas ref={labelRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* Rotation + visibility tools */}
      <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
        <div className="flex gap-1">
          {Object.keys(VIEWS).map((name) => (
            <button key={name} className={btn} onClick={() => setView(VIEWS[name])}>{name}</button>
          ))}
        </div>
        <div className="flex gap-1">
          <button className={tglCls(show.box)} onClick={() => toggle("box")}>Box</button>
          <button className={tglCls(show.grid)} onClick={() => toggle("grid")}>Grid</button>
          <button className={tglCls(show.axes)} onClick={() => toggle("axes")}>Axes</button>
        </div>
        <label className="flex items-center gap-1 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-slate-400">
          z ∈ ±<input type="number" min={1} step={1} className="w-12 rounded bg-slate-800/80 px-1 py-0.5 text-right text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400" value={zRange} onChange={(e) => setZRange(Number(e.target.value))} />
        </label>
        <div className="rounded bg-black/60 px-2 py-1 text-right font-mono text-[10px] tabular-nums text-slate-400">
          yaw {deg(disp.yaw)}° · pitch {deg(disp.pitch)}° · dist {disp.dist.toFixed(1)}
        </div>
      </div>

      {/* Probe + value analysis */}
      <div className="absolute left-2 top-2 rounded bg-black/60 px-3 py-2 font-mono text-[11px] text-slate-300">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-slate-500">probe</span>
          x <input type="number" step={0.25} className={numCls} value={Number(probe.x.toFixed(3))} onChange={(e) => setProbe((p) => ({ ...p, x: clampR(Number(e.target.value)) }))} />
          y <input type="number" step={0.25} className={numCls} value={Number(probe.y.toFixed(3))} onChange={(e) => setProbe((p) => ({ ...p, y: clampR(Number(e.target.value)) }))} />
        </div>
        {probeInfo ? (
          <div className="space-y-0.5">
            <div>f(x,y) = <span className="text-cyan-300">{fmt(probeInfo.z)}</span></div>
            <div>∂f/∂x = <span className="text-emerald-300">{fmt(probeInfo.gx)}</span> <span className="text-slate-600">= {probeInfo.dxExpr}</span></div>
            <div>∂f/∂y = <span className="text-emerald-300">{fmt(probeInfo.gy)}</span> <span className="text-slate-600">= {probeInfo.dyExpr}</span></div>
            <div>‖∇f‖ = <span className="text-amber-300">{fmt(Math.hypot(probeInfo.gx, probeInfo.gy))}</span></div>
          </div>
        ) : (
          <div className="text-slate-500">no surface — add z = f(x,y)</div>
        )}
      </div>

      {/* Axis legend */}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-3 py-1.5 font-mono text-[11px] text-slate-400">
        <span className="text-[#f26b6b]">■</span> X&nbsp; <span className="text-[#73e58c]">■</span> Y&nbsp; <span className="text-[#809eff]">■</span> Z&nbsp;·&nbsp;z = f(x,y) or F(x,y,z) = 0 · drag rotate · wheel zoom
      </div>
    </>
  );
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "undefined";
  return String(Number(v.toFixed(4)));
}
