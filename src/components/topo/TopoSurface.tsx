import { useEffect, useMemo, useRef } from "react";
import { perspective, multiply, orbitView, project, type Mat4 } from "../graph/mat4.ts";
import { buildTopoMesh } from "../../topo/mesh.ts";
import { useTopo } from "../../topo/topoStore.ts";
import { SURFACE_BY_ID } from "../../topo/surfaces.ts";

const VS = `
attribute vec3 aPos; attribute vec3 aNormal;
uniform mat4 uMVP; varying vec3 vN; varying vec3 vPos;
void main() { vN = aNormal; vPos = aPos; gl_Position = uMVP * vec4(aPos, 1.0); }
`;
const FS = `
precision highp float; varying vec3 vN; varying vec3 vPos; uniform vec3 uColor; uniform int uMode;
vec3 palette(float t) { return 0.5 + 0.5 * cos(6.28318 * (vec3(1.0) * t + vec3(0.0, 0.33, 0.67))); }
void main() {
  vec3 n = normalize(vN);
  vec3 L1 = normalize(vec3(0.5, 0.65, 0.8));
  vec3 L2 = normalize(vec3(-0.5, -0.2, 0.4));
  // two-sided soft lighting (surfaces have no consistent facing) + ambient
  float lit = 0.30 + 0.55 * abs(dot(n, L1)) + 0.18 * abs(dot(n, L2));
  vec3 base;
  if (uMode == 1) base = 0.5 + 0.5 * n;                     // normal → RGB
  else if (uMode == 2) base = palette(vPos.z * 0.25 + 0.5); // height
  else base = uColor;                                       // solid
  gl_FragColor = vec4(base * lit, 1.0);
}
`;
const LINE_FS = `precision highp float; void main() { gl_FragColor = vec4(0.55, 0.75, 0.95, 1.0); }`;

function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}
function makeProgram(gl: WebGLRenderingContext, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  return p;
}

// Model spin (tumble about Z and X) so the object rotates in space.
function spinModel(a: number): Mat4 {
  const cz = Math.cos(a), sz = Math.sin(a), cx = Math.cos(a * 0.6), sx = Math.sin(a * 0.6);
  const rz: Mat4 = new Float32Array([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const rx: Mat4 = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
  return multiply(rz, rx);
}

// Grid wireframe line indices (n = cells per side).
function lineIndices(n: number): Uint32Array {
  const w = n + 1, idx: number[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const a = j * w + i;
      if (i < n) idx.push(a, a + 1);
      if (j < n) idx.push(a, a + w);
    }
  return new Uint32Array(idx);
}

export function TopoSurface() {
  const ref = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ yaw: 0.7, pitch: 0.4, dist: 6 });
  const drag = useRef<{ x: number; y: number; startY: number; deform: boolean } | null>(null);
  const spinAngle = useRef(0);
  const glRef = useRef<{
    gl: WebGLRenderingContext; solid: WebGLProgram; line: WebGLProgram; uMVP: WebGLUniformLocation; uColor: WebGLUniformLocation; uMode: WebGLUniformLocation; uMVPl: WebGLUniformLocation;
    vbo: WebGLBuffer; ibo: WebGLBuffer; lbo: WebGLBuffer; count: number; lcount: number; ext: OES_element_index_uint | null;
  } | null>(null);

  const sourceId = useTopo((s) => s.sourceId);
  const targetId = useTopo((s) => s.targetId);
  const t = useTopo((s) => s.t);
  const bumps = useTopo((s) => s.bumps);
  const res = useTopo((s) => s.res);
  const mode = useTopo((s) => s.mode);
  const wireframe = useTopo((s) => s.wireframe);
  const playing = useTopo((s) => s.playing);
  const speed = useTopo((s) => s.speed);
  const inflate = useTopo((s) => s.inflate);
  const twist = useTopo((s) => s.twist);
  const colorMode = useTopo((s) => s.colorMode);
  const spin = useTopo((s) => s.spin);
  const spinSpeed = useTopo((s) => s.spinSpeed);

  const src = SURFACE_BY_ID[sourceId];
  const dst = SURFACE_BY_ID[targetId];
  const canMorph = src.domain === dst.domain;

  const mesh = useMemo(
    () => buildTopoMesh(src, canMorph ? dst : null, t, bumps, res, { inflate, twist }),
    [src, dst, canMorph, t, bumps, res, inflate, twist],
  );
  const meshRef = useRef(mesh);
  meshRef.current = mesh;

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) return;
    const solid = makeProgram(gl, FS), line = makeProgram(gl, LINE_FS);
    gl.enable(gl.DEPTH_TEST);
    glRef.current = {
      gl, solid, line,
      uMVP: gl.getUniformLocation(solid, "uMVP")!, uColor: gl.getUniformLocation(solid, "uColor")!, uMode: gl.getUniformLocation(solid, "uMode")!, uMVPl: gl.getUniformLocation(line, "uMVP")!,
      vbo: gl.createBuffer()!, ibo: gl.createBuffer()!, lbo: gl.createBuffer()!, count: 0, lcount: 0,
      ext: gl.getExtension("OES_element_index_uint"),
    };
    upload(); render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function upload() {
    const g = glRef.current; if (!g) return;
    const { gl } = g;
    gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo); gl.bufferData(gl.ARRAY_BUFFER, meshRef.current.interleaved, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshRef.current.indices, gl.DYNAMIC_DRAW);
    const li = lineIndices(meshRef.current.n);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.lbo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, li, gl.DYNAMIC_DRAW);
    g.count = meshRef.current.indices.length; g.lcount = li.length;
  }

  function mvp() {
    const canvas = ref.current!;
    const proj = perspective(Math.PI / 4, (canvas.clientWidth || 1) / (canvas.clientHeight || 1), 0.1, 100);
    const view = multiply(proj, orbitView(cam.current.yaw, cam.current.pitch, cam.current.dist));
    return spinAngle.current ? multiply(view, spinModel(spinAngle.current)) : view;
  }

  function render() {
    const g = glRef.current; if (!g) return;
    const { gl } = g;
    const canvas = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.03, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const m = mvp();
    const type = g.ext ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

    gl.useProgram(g.solid);
    gl.uniformMatrix4fv(g.uMVP, false, m);
    gl.uniform3f(g.uColor, 0.25, 0.7, 0.72);
    gl.uniform1i(g.uMode, useTopo.getState().colorMode);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo);
    const aPos = gl.getAttribLocation(g.solid, "aPos"), aN = gl.getAttribLocation(g.solid, "aNormal");
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ibo);
    gl.drawElements(gl.TRIANGLES, g.count, type, 0);

    if (useTopo.getState().wireframe) {
      gl.useProgram(g.line);
      gl.uniformMatrix4fv(g.uMVPl, false, m);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo);
      const lp = gl.getAttribLocation(g.line, "aPos");
      gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 24, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.lbo);
      gl.drawElements(gl.LINES, g.lcount, type, 0);
    }
  }

  // Re-upload + redraw whenever the mesh changes.
  useEffect(() => { upload(); render(); }, [mesh]); // eslint-disable-line react-hooks/exhaustive-deps
  // Redraw on view-only changes.
  useEffect(() => { render(); }, [wireframe, colorMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-spin: rotate the object in space.
  useEffect(() => {
    if (!spin) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      spinAngle.current += spinSpeed * Math.min((now - last) / 1000, 0.05); last = now;
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spin, spinSpeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Morph animation (ping-pong t between 0 and 1).
  useEffect(() => {
    if (!playing || !canMorph) return;
    let raf = 0, last = performance.now(), dir = useTopo.getState().t < 1 ? 1 : -1;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      let nt = useTopo.getState().t + dir * speed * dt;
      if (nt >= 1) { nt = 1; dir = -1; } else if (nt <= 0) { nt = 0; dir = 1; }
      useTopo.getState().setT(nt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, canMorph]);

  useEffect(() => {
    const ro = new ResizeObserver(() => render());
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick the grid vertex nearest the cursor (screen space).
  function pick(clientX: number, clientY: number): number {
    const canvas = ref.current!;
    const r = canvas.getBoundingClientRect();
    const cx = clientX - r.left, cy = clientY - r.top;
    const m = mvp();
    const { gridPos } = meshRef.current;
    let best = -1, bestD = Infinity;
    for (let k = 0; k < gridPos.length / 3; k++) {
      const p = project(m, gridPos[k * 3], gridPos[k * 3 + 1], gridPos[k * 3 + 2], r.width, r.height);
      if (!p) continue;
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  const onDown = (e: React.PointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId);
    if (mode === "deform") {
      const k = pick(e.clientX, e.clientY);
      if (k >= 0) {
        const st = useTopo.getState();
        st.addBump({ u: meshRef.current.gu[k], v: meshRef.current.gv[k], amp: 0, sigma: 0.5 });
        drag.current = { x: e.clientX, y: e.clientY, startY: e.clientY, deform: true };
      }
    } else {
      drag.current = { x: e.clientX, y: e.clientY, startY: e.clientY, deform: false };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    if (drag.current.deform) {
      useTopo.getState().updateLastBump((drag.current.startY - e.clientY) * 0.012);
    } else {
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      drag.current.x = e.clientX; drag.current.y = e.clientY;
      cam.current.yaw -= dx * 0.01;
      cam.current.pitch = Math.max(-1.5, Math.min(1.5, cam.current.pitch + dy * 0.01));
      render();
    }
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    cam.current.dist = Math.max(3, Math.min(16, cam.current.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
    render();
  };

  return (
    <canvas ref={ref} className="absolute inset-0 h-full w-full touch-none"
      style={{ display: "block", cursor: mode === "deform" ? "crosshair" : "grab" }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} />
  );
}
