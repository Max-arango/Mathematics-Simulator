import { useEffect, useRef } from "react";
import { perspective, multiply, orbitView } from "../graph/mat4.ts";
import { rotate4, project4to3, type Vec4 } from "../../fourd/vec4.ts";
import { useFour } from "../../fourd/fourStore.ts";
import type { Shape } from "../../fourd/shapes.ts";

const VS = `
attribute vec3 aPos; attribute vec3 aColor;
uniform mat4 uMVP; varying vec3 vColor;
void main() { vColor = aColor; gl_Position = uMVP * vec4(aPos, 1.0); gl_PointSize = 6.0; }
`;
const FS = `precision highp float; varying vec3 vColor; void main() { gl_FragColor = vec4(vColor, 1.0); }`;

// Cosine palette: 4th dimension (w) → hue.
function wColor(t: number): [number, number, number] {
  return [
    0.5 + 0.5 * Math.cos(6.28318 * (t + 0.0)),
    0.5 + 0.5 * Math.cos(6.28318 * (t + 0.33)),
    0.5 + 0.5 * Math.cos(6.28318 * (t + 0.67)),
  ];
}

function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

export function Plot4D({ shape }: { shape: Shape }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ yaw: 0.6, pitch: 0.4, dist: 5 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const glRef = useRef<{ gl: WebGLRenderingContext; prog: WebGLProgram; uMVP: WebGLUniformLocation; line: WebGLBuffer; pts: WebGLBuffer } | null>(null);
  const shapeRef = useRef(shape);
  shapeRef.current = shape;

  const angles = useFour((s) => s.angles);
  const dist = useFour((s) => s.dist);
  const playing = useFour((s) => s.anim.playing);
  const speed = useFour((s) => s.anim.speed);

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.enable(gl.DEPTH_TEST);
    glRef.current = { gl, prog, uMVP: gl.getUniformLocation(prog, "uMVP")!, line: gl.createBuffer()!, pts: gl.createBuffer()! };
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function render() {
    const g = glRef.current;
    if (!g) return;
    const { gl, prog } = g;
    const canvas = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.03, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const { vertices, edges } = shapeRef.current;
    if (!vertices.length) return;
    const a = useFour.getState().angles;
    const d = useFour.getState().dist;

    // Rotate in 4D, project to 3D, keep w for coloring.
    const proj: Vec4[] = vertices.map((v) => project4to3(rotate4(v, a), d));
    let wMax = 1e-6;
    for (const p of proj) wMax = Math.max(wMax, Math.abs(p[3]));

    // Edge line buffer (per-vertex color from w).
    const lines = new Float32Array(edges.length * 12);
    let o = 0;
    for (const [i, j] of edges) {
      for (const k of [i, j]) {
        const p = proj[k];
        const col = wColor(p[3] / (2 * wMax) + 0.5);
        lines[o++] = p[0]; lines[o++] = p[1]; lines[o++] = p[2];
        lines[o++] = col[0]; lines[o++] = col[1]; lines[o++] = col[2];
      }
    }

    const proj3 = perspective(Math.PI / 4, w / h || 1, 0.1, 100);
    const mvp = multiply(proj3, orbitView(cam.current.yaw, cam.current.pitch, cam.current.dist));
    gl.useProgram(prog);
    gl.uniformMatrix4fv(g.uMVP, false, mvp);
    const aPos = gl.getAttribLocation(prog, "aPos"), aCol = gl.getAttribLocation(prog, "aColor");
    const bindDraw = (buf: WebGLBuffer, data: Float32Array, mode: number, count: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(mode, 0, count);
    };
    bindDraw(g.line, lines, gl.LINES, edges.length * 2);

    // Vertices as points (only when few — polytopes, not dense grids).
    if (vertices.length <= 64) {
      const pts = new Float32Array(proj.length * 6);
      let q = 0;
      for (const p of proj) {
        const col = wColor(p[3] / (2 * wMax) + 0.5);
        pts[q++] = p[0]; pts[q++] = p[1]; pts[q++] = p[2];
        pts[q++] = col[0]; pts[q++] = col[1]; pts[q++] = col[2];
      }
      bindDraw(g.pts, pts, gl.POINTS, proj.length);
    }
  }

  // Redraw whenever rotation / projection / geometry changes.
  useEffect(render, [angles, dist, shape]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animation: a double rotation (xw + yz) — the classic 4D tumble.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      useFour.getState().bumpAngles(speed * dt, speed * 0.618 * dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  useEffect(() => {
    const ro = new ResizeObserver(() => render());
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; ref.current!.setPointerCapture(e.pointerId); };
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
    cam.current.dist = Math.max(2.5, Math.min(14, cam.current.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
    render();
  };

  return (
    <canvas ref={ref} className="absolute inset-0 h-full w-full touch-none" style={{ display: "block", cursor: "grab" }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} />
  );
}
