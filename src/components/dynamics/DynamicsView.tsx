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
  type TrajectoryState, type SimulationLimits, type IntegrationDirection,
} from "../../mathlab/dynamics/lifecycle.ts";
import {
  viewBounds, worldToScreen, screenToWorld, tickInterval, fieldGrid, magnitudeIntensity, type View,
} from "../../mathlab/dynamics/geometry.ts";
import { identifyAttractors } from "../../mathlab/dynamics/attractors.ts";
import {
  createBasinSampler, cellCenter,
  type BasinSampler, type BasinGrid, type BasinLabel, type BasinResolution,
} from "../../mathlab/dynamics/basins.ts";
import { saddleManifolds, type SaddleManifolds } from "../../mathlab/dynamics/manifolds.ts";
import { linearize, type Linearization } from "../../mathlab/dynamics/linearize.ts";
import { compareTrajectories, type SeparationPoint } from "../../mathlab/dynamics/compare.ts";
import { norm, type Vec } from "../../mathlab/linear/vector.ts";

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
  outOfDomain: "#c084fc",  // violet: clipped by explicit domain
  paused: "#cbd5e1",       // neutral: user paused
  limitCycle: "#22d3ee",   // cyan: heuristic periodic orbit
};

// Trail colour by integration direction — backward reads as "where did this come
// from?" so it gets a warm counterpoint to the forward cyan.
const DIR_TRAIL: Record<IntegrationDirection, string> = {
  forward: "rgba(56,224,200,0.85)",   // cyan
  backward: "rgba(251,146,60,0.8)",    // amber
};

// Manifold colours (§10): stable = inflow (green), unstable = outflow (red).
const MANIFOLD_STABLE = "#4ade80";
const MANIFOLD_UNSTABLE = "#f87171";

// Basin cells classified per animation frame — small enough to stay responsive,
// large enough to finish a medium grid in ~1–2 s (§5, §18: not in the render path).
const BASIN_CELLS_PER_FRAME = 20;

// Distinct hues for basin attractors (§6 stable identity → stable colour). Cycled
// if there are more attractors than entries.
const BASIN_ATTRACTOR_HUES = ["#22d3ee", "#f472b6", "#a3e635", "#fbbf24", "#c084fc", "#fb7185", "#38bdf8", "#34d399"];
// Labels for the readout / legend, aligned to attractor index (A, B, C, …).
const attractorTag = (i: number): string => String.fromCharCode(65 + (i % 26));

/** Basin cell fill (secondary layer — kept low-alpha so the field reads through, §20). */
function basinFill(label: BasinLabel): string | null {
  switch (label.kind) {
    case "attractor": {
      const h = BASIN_ATTRACTOR_HUES[label.index % BASIN_ATTRACTOR_HUES.length];
      return hexAlpha(h, 0.30);
    }
    case "limitCycle": return "rgba(217,70,239,0.28)";     // magenta
    case "escape": return "rgba(148,163,184,0.10)";        // faint slate
    case "timeout": return "rgba(251,146,60,0.12)";        // faint amber
    case "numericalFailure": return "rgba(239,68,68,0.16)"; // red
    case "unknown": return null;                            // draw nothing
  }
}

/** #rrggbb + alpha → rgba() string. */
function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Layer toggles (cheap state, recomputed once per render).
interface Layers { field: boolean; trails: boolean; nullclines: boolean; equilibria: boolean; }

// Mode of the cursor: "launch" (click→particle), "probe" (shows F(x,y)),
// "compare" (pick two ICs → Δ(t) separation). Drag always pans.
type Mode = "launch" | "probe" | "compare";

// Axis-aligned ranges (rectangles). Used for the camera, the equilibria-search
// region, and the physical domain — three independent rectangles that all live
// in world coordinates. They DO NOT need to coincide: the camera is what the
// user sees, the search range is where Newton hunts for equilibria, and the
// domain is where trajectories are physically clipped.
interface Rect { xMin: number; xMax: number; yMin: number; yMax: number; }

// ─── component ────────────────────────────────────────────────────────────────
export function DynamicsView() {
  const ref = useRef<HTMLCanvasElement>(null);

  // System definition.
  const [fx, setFx] = useState("y");
  const [fy, setFy] = useState("-x - 0.3*y");
  const [error, setError] = useState<string | null>(null);

  // Camera.
  const [view, setView] = useState<View>({ cx: 0, cy: 0, span: 12 });

  // Search range for findEquilibria + grid density. Initially a wide default;
  // the user can narrow it to focus on a region of state space.
  const [searchRange, setSearchRange] = useState<Rect>({ xMin: -14, xMax: 14, yMin: -14, yMax: 14 });
  const [searchGrid, setSearchGrid] = useState(11); // gridPoints per dim → 11² = 121 seeds

  // Physical domain for trajectories. Default = wide so behaviour matches the
  // pre-domain build. Toggle `enforceDomain` to clip trajectories here.
  const [domain, setDomain] = useState<Rect>({ xMin: -50, xMax: 50, yMin: -50, yMax: 50 });
  const [enforceDomain, setEnforceDomain] = useState(false);

  // Simulation controls.
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(3);             // 1..10 sub-steps per frame
  const [trailLen, setTrailLen] = useState(800);     // samples retained per trajectory
  const [showTrails, _setShowTrails] = useState(true);

  // Display layers.
  const [layers, setLayers] = useState<Layers>({ field: true, trails: true, nullclines: false, equilibria: true });
  const [mode, setMode] = useState<Mode>("launch");
  const [selectedEq, setSelectedEq] = useState<number | null>(null);

  // Integration direction for new trajectories (§2); bidirectional launches a
  // backward←IC→forward pair (§3).
  const [direction, setDirection] = useState<IntegrationDirection>("forward");
  const [bidirectional, setBidirectional] = useState(false);

  // Analysis overlays (§19: optional layers, off by default).
  const [showManifolds, setShowManifolds] = useState(false);
  const [showBasins, setShowBasins] = useState(false);
  const [basinRes, setBasinRes] = useState<BasinResolution>("medium");
  const [basinInfo, setBasinInfo] = useState<{ done: number; total: number } | null>(null);

  // Trajectory comparison (§13): two picked ICs and the computed separation.
  const [comparePts, setComparePts] = useState<{ p1: Vec | null; p2: Vec | null }>({ p1: null, p2: null });
  const [compareData, setCompareData] = useState<{ a: Vec[]; b: Vec[]; separation: SeparationPoint[] } | null>(null);

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
      const { points, note } = findEquilibria(sys, {
        range: [searchRange.xMin, searchRange.xMax], // equilibria.ts only uses range[0..1] as a per-dim interval
        gridPoints: searchGrid,
        // NOTE: equilibria.findEquilibria takes ONE per-dim range and uses it for BOTH axes.
        // For asymmetric boxes the caller should pass `seeds` directly. We accept
        // the y-axis using the same interval; if xMin/xMax differ from yMin/yMax
        // significantly, the user can drive Newton via the asymmetry by passing
        // explicit seeds — see inspector. (ponytail: keep the simple UI shape,
        // upgrade when per-axis ranges matter.)
        seeds: undefined,
      });
      // Honour a different y-range by filtering on yMin/yMax — Newton found
      // roots in the per-dim range, we keep only those inside the user's box.
      const filtered = points.filter((p) =>
        p[0] >= searchRange.xMin && p[0] <= searchRange.xMax &&
        p[1] >= searchRange.yMin && p[1] <= searchRange.yMax
      );
      if (note) console.debug("[dynamics] equilibria:", note);
      return filtered.map((p) => ({ point: p, stab: classifyEquilibrium(sys, p) }));
    } catch { return []; }
  }, [sys, searchRange.xMin, searchRange.xMax, searchRange.yMin, searchRange.yMax, searchGrid]);

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

  // Saddle manifolds (§10) — one W^s/W^u pair per saddle. Numerical approximation;
  // recomputed only when the system / equilibria / zoom scale change (NOT per frame).
  const manifoldsData = useMemo<SaddleManifolds[]>(() => {
    if (!sys || !showManifolds) return [];
    const span = Math.max(16, view.span * 2);
    const out: SaddleManifolds[] = [];
    for (const e of equilibria) {
      if (e.stab.type !== "saddle") continue;
      const m = saddleManifolds(sys, e.point, { span });
      if (m) out.push(m);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sys, showManifolds, equilibria, view.span]);

  // Linearization of the selected equilibrium (§11/§12) — eigenpairs + directions.
  const selectedLin = useMemo<Linearization | null>(() => {
    if (!sys || selectedEq === null || !equilibria[selectedEq]) return null;
    try { return linearize(sys, equilibria[selectedEq].point); } catch { return null; }
  }, [sys, selectedEq, equilibria]);

  // Attractor identity for the basin legend (§6) — stable ordering ⇒ stable A/B/C.
  const basinAttractors = useMemo(
    () => (sys ? identifyAttractors(sys, { equilibria: equilibria.map((e) => e.point) }) : []),
    [sys, equilibria],
  );

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
  const domainRef = useRef(domain); domainRef.current = domain;
  const enforceDomainRef = useRef(enforceDomain); enforceDomainRef.current = enforceDomain;
  const trajectories = useRef<TrajectoryState[]>([]);
  // Analysis overlays read by the (once-captured) draw loop — refs, not state.
  const selectedEqRef = useRef(selectedEq); selectedEqRef.current = selectedEq;
  const selectedLinRef = useRef(selectedLin); selectedLinRef.current = selectedLin;
  const showManifoldsRef = useRef(showManifolds); showManifoldsRef.current = showManifolds;
  const manifoldsRef = useRef(manifoldsData); manifoldsRef.current = manifoldsData;
  const showBasinsRef = useRef(showBasins); showBasinsRef.current = showBasins;
  const basinGridRef = useRef<BasinGrid | null>(null);
  const basinSamplerRef = useRef<BasinSampler | null>(null);
  const comparePtsRef = useRef(comparePts); comparePtsRef.current = comparePts;
  const compareDataRef = useRef(compareData); compareDataRef.current = compareData;
  const directionRef = useRef(direction); directionRef.current = direction;
  const bidirectionalRef = useRef(bidirectional); bidirectionalRef.current = bidirectional;

  // Reset camera / simulation. Keep these distinct so they never get conflated.
  const resetView = () => setView({ cx: 0, cy: 0, span: 12 });
  const resetSimulation = () => { trajectories.current = []; };

  // ── Basins (§4–6): build a sampler over the CURRENT viewport + attractors.
  //    The rAF loop drives it incrementally; draw() paints the grid. ──────────
  const startBasins = (res: BasinResolution = basinRes) => {
    const s = sysRef.current, canvas = ref.current;
    if (!s || !canvas) return;
    const b = viewBounds(viewRef.current, canvas.clientWidth, canvas.clientHeight);
    const eqs = eqRef.current.map((e) => e.point);
    const attractors = identifyAttractors(s, { equilibria: eqs });
    const sampler = createBasinSampler(s, b, attractors, eqs, { resolution: res });
    basinSamplerRef.current = sampler;
    basinGridRef.current = sampler.grid;
    setBasinInfo({ done: 0, total: sampler.total });
  };
  const clearBasins = () => {
    basinSamplerRef.current = null;
    basinGridRef.current = null;
    setBasinInfo(null);
  };
  // A stale basin (from another system) must never linger over a new field —
  // recompute for the new system if the layer is on, else clear.
  useEffect(() => {
    if (showBasins) startBasins(); else clearBasins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sys]);

  // ── Comparison (§13): integrate the two picked ICs on a shared clock. ──────
  const runComparison = (p1: Vec, p2: Vec) => {
    const s = sysRef.current; if (!s) return;
    try {
      const { a, b, separation } = compareTrajectories(s, p1, p2, { t1: 20, h: 0.02 });
      setCompareData({ a, b, separation });
    } catch { setCompareData(null); }
  };

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

    // Basins layer (§4, §20) — SECONDARY: painted first, low-alpha, so the field,
    // trajectories and equilibria all read on top of it.
    if (showBasinsRef.current && basinGridRef.current) {
      const g = basinGridRef.current;
      const cw = (g.bounds.xMax - g.bounds.xMin) / g.cols;
      const chh = (g.bounds.yMax - g.bounds.yMin) / g.rows;
      for (let idx = 0; idx < g.labels.length; idx++) {
        const label = g.labels[idx];
        if (!label) continue;
        const fill = basinFill(label);
        if (!fill) continue;
        const col = idx % g.cols, row = Math.floor(idx / g.cols);
        const [cx, cy] = cellCenter(g, col, row);
        const [x0, y0] = worldToScreen(cx - cw / 2, cy + chh / 2, w, h, v);
        const [x1, y1] = worldToScreen(cx + cw / 2, cy - chh / 2, w, h, v);
        ctx.fillStyle = fill;
        ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1); // +1 avoids seams between cells
      }
    }

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

    // Saddle manifolds (§10) — stable (green) drawn dashed, unstable (red) solid.
    // Labelled a numerical approximation in the readout, not asserted analytic.
    if (showManifoldsRef.current) {
      for (const m of manifoldsRef.current) {
        ctx.setLineDash([4, 3]);
        for (const branch of m.stable) drawPolyline(ctx, branch, MANIFOLD_STABLE, bounds, w, h, v);
        ctx.setLineDash([]);
        for (const branch of m.unstable) drawPolyline(ctx, branch, MANIFOLD_UNSTABLE, bounds, w, h, v);
      }
    }

    // Domain rectangle — solid violet when enforced, faint when merely configured.
    {
      const dom = domainRef.current;
      const enforced = enforceDomainRef.current;
      const [x0, y0] = worldToScreen(dom.xMin, dom.yMax, w, h, v);
      const [x1, y1] = worldToScreen(dom.xMax, dom.yMin, w, h, v);
      ctx.strokeStyle = enforced ? "rgba(192,132,252,0.7)" : "rgba(192,132,252,0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash(enforced ? [] : [4, 4]);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
    }

    // Trails + status markers.
    if (showTrailsRef.current) {
      for (const tr of trajectories.current) {
        // Samples are aligned (t, x); the renderer only needs the geometry.
        const pts: Vec[] = tr.samples.map((s) => s.x);
        if (pts.length < 2) continue;
        ctx.strokeStyle = DIR_TRAIL[tr.direction];
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
        if (norm(tr.velocity) > 0) {
          ctx.strokeStyle = STATUS_COLOR[tr.status];
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx + tr.velocity[0] * 10, hy - tr.velocity[1] * 10);
          ctx.stroke();
        }
      } else if (tr.termination) {
        const [ex, ey] = worldToScreen(tr.termination.at[0], tr.termination.at[1], w, h, v);
        ctx.strokeStyle = STATUS_COLOR[tr.status];
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.stroke();

        // Visual link to the destination equilibrium (when status === "equilibrium")
        // — a thin dashed segment from the trajectory end to the equilibrium dot.
        const dest = tr.termination.destination;
        if (tr.status === "equilibrium" && dest?.kind === "equilibrium" && dest.equilibriumIndex !== undefined) {
          const eq = eqRef.current[dest.equilibriumIndex];
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

    // Comparison overlay (§13) — the two picked ICs and their orbits (P₁ blue, P₂ orange).
    {
      const cd = compareDataRef.current;
      if (cd) {
        drawPolyline(ctx, cd.a, "#60a5fa", bounds, w, h, v);
        drawPolyline(ctx, cd.b, "#fb923c", bounds, w, h, v);
      }
      const cp = comparePtsRef.current;
      const dot = (p: Vec | null, color: string, tag: string) => {
        if (!p) return;
        const [px, py] = worldToScreen(p[0], p[1], w, h, v);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e2e8f0"; ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(tag, px + 6, py - 6);
      };
      dot(cp.p1, "#60a5fa", "P₁");
      dot(cp.p2, "#fb923c", "P₂");
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
        if (selectedEqRef.current === i) {
          ctx.strokeStyle = "#f8fafc";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    // Linearized eigen-directions at the selected equilibrium (§12) — short arrows
    // along each real eigenvector: green = stable (inflow), red = unstable (outflow).
    const lin = selectedLinRef.current;
    if (lin) {
      const [ex, ey] = worldToScreen(lin.point[0], lin.point[1], w, h, v);
      const arrow = (vec: Vec, color: string) => {
        const n = Math.hypot(vec[0], vec[1]) || 1;
        const ux = vec[0] / n, uy = vec[1] / n;
        for (const s2 of [1, -1] as const) {
          const tx = ex + s2 * ux * 34, ty = ey - s2 * uy * 34;
          ctx.strokeStyle = color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(tx, ty); ctx.stroke();
        }
      };
      for (const vDir of lin.unstableDirections) arrow(vDir, MANIFOLD_UNSTABLE);
      for (const vDir of lin.stableDirections) arrow(vDir, MANIFOLD_STABLE);
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
    let lastBasin = 0;
    const loop = (now: number) => {
      const s = sysRef.current;
      if (s && playRef.current) {
        const dt = 0.02, sub = Math.max(1, Math.round(speedRef.current));
        const vp = viewBounds(viewRef.current, 1, 1); // aspect doesn't matter for bounds here
        const dom = domainRef.current;
        const limits: SimulationLimits = {
          viewport: { xMin: vp.xMin, xMax: vp.xMax, yMin: vp.yMin, yMax: vp.yMax },
          domain: dom,
          enforceDomain: enforceDomainRef.current,
          tMax: 200,
          equilibria: eqRef.current.map((e) => e.point),
        };
        for (const tr of trajectories.current) {
          if (tr.status !== "running") continue;
          for (let k = 0; k < sub; k++) stepTrajectory(s, tr, dt, limits);
          trimTrail(tr, trailLenRef.current);
        }
        // Sidebar readout throttled to ~10 Hz to avoid thrash.
        if (now - lastSidebar > 100) { forceSidebar((n) => n + 1); lastSidebar = now; }
      }
      // Incremental basin sampling (§5, §18) — independent of play/pause; a few
      // cells per frame, progress reported at ~10 Hz (and once on completion).
      const sampler = basinSamplerRef.current;
      if (sampler && showBasinsRef.current && sampler.done < sampler.total) {
        const complete = sampler.step(BASIN_CELLS_PER_FRAME);
        if (complete || now - lastBasin > 100) { setBasinInfo({ done: sampler.done, total: sampler.total }); lastBasin = now; }
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
    if (!d || d.moved || !sysRef.current || modeRef.current === "probe") return;
    const r = ref.current!.getBoundingClientRect();
    const start = screenToWorld(e.clientX - r.left, e.clientY - r.top, r.width, r.height, viewRef.current);

    // Compare mode: click 1 sets P₁, click 2 sets P₂ and computes Δ(t); click 3 restarts.
    if (modeRef.current === "compare") {
      const cur = comparePtsRef.current;
      if (!cur.p1 || cur.p2) {
        setCompareData(null);
        setComparePts({ p1: start, p2: null });
      } else {
        setComparePts({ p1: cur.p1, p2: start });
        runComparison(cur.p1, start);
      }
      return;
    }

    // Launch mode. Click-to-equilibrium selection: within snap radius → select it.
    let bestEq = -1, bestD = 0.4;
    for (let i = 0; i < eqRef.current.length; i++) {
      const D = Math.hypot(eqRef.current[i].point[0] - start[0], eqRef.current[i].point[1] - start[1]);
      if (D < bestD) { bestD = D; bestEq = i; }
    }
    if (bestEq !== -1) { setSelectedEq(bestEq); return; }
    // Otherwise launch trajectory(ies): one in the chosen direction, or a
    // backward←IC→forward pair when bidirectional is on (§3).
    const s = sysRef.current;
    if (bidirectionalRef.current) {
      trajectories.current.push(createTrajectory(s, start, 0.02, "forward"));
      trajectories.current.push(createTrajectory(s, start, 0.02, "backward"));
    } else {
      trajectories.current.push(createTrajectory(s, start, 0.02, directionRef.current));
    }
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
            {([["launch", "Launch"], ["probe", "Probe"], ["compare", "Compare"]] as [Mode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`${btn} flex-1 ${mode === m ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Integration direction for launched trajectories (§2, §3). */}
          <h3 className="mb-1 mt-2 text-[10px] uppercase tracking-wide text-slate-500">Direction</h3>
          <div className="flex gap-1">
            {([["forward", "Forward"], ["backward", "Backward"]] as [IntegrationDirection, string][]).map(([dir, label]) => (
              <button key={dir} onClick={() => setDirection(dir)} disabled={bidirectional}
                className={`${btn} flex-1 ${direction === dir && !bidirectional ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-400 hover:bg-white/10"} ${bidirectional ? "opacity-40" : ""}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="mt-1 flex items-center gap-2 text-[11px] text-slate-300">
            <input type="checkbox" checked={bidirectional} onChange={(e) => setBidirectional(e.target.checked)} />
            <span>Bidirectional (backward ← IC → forward)</span>
          </label>
        </div>

        {/* ── Analysis overlays (§19: optional layers). ── */}
        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Analysis</h3>
          <label className="flex items-center gap-2 text-[11px] text-slate-300">
            <input type="checkbox" checked={showManifolds} onChange={(e) => setShowManifolds(e.target.checked)} />
            <span>Saddle manifolds <span className="text-slate-500">(W<sup>s</sup> green · W<sup>u</sup> red)</span></span>
          </label>
          <label className="mt-1 flex items-center gap-2 text-[11px] text-slate-300">
            <input
              type="checkbox"
              checked={showBasins}
              onChange={(e) => { setShowBasins(e.target.checked); if (e.target.checked) startBasins(); else clearBasins(); }}
            />
            <span>Basins of attraction</span>
          </label>
          {showBasins && (
            <div className="mt-1 space-y-1 rounded bg-black/30 p-1.5">
              <div className="flex items-center gap-1">
                <span className="w-14 text-[10px] text-slate-500">resolution</span>
                {(["low", "medium", "high"] as BasinResolution[]).map((rres) => (
                  <button key={rres} onClick={() => { setBasinRes(rres); startBasins(rres); }}
                    className={`${btn} flex-1 capitalize ${basinRes === rres ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
                    {rres}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startBasins()} className={`${btn} flex-1 bg-white/5 text-slate-300 hover:bg-white/10`}>Recompute (this view)</button>
              </div>
              {basinInfo && (
                <div>
                  <div className="h-1 overflow-hidden rounded bg-white/10">
                    <div className="h-full bg-cyan-400" style={{ width: `${(100 * basinInfo.done) / Math.max(1, basinInfo.total)}%` }} />
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {basinInfo.done}/{basinInfo.total} cells · numerical approximation
                  </p>
                </div>
              )}
              <BasinLegend attractors={basinAttractors} />
            </div>
          )}
        </div>

        <RangeBox
          label="Equilibria search range"
          rect={searchRange}
          onChange={setSearchRange}
          syncFrom={() => {
            const b = viewBounds(view, 1, 1);
            setSearchRange({ xMin: b.xMin, xMax: b.xMax, yMin: b.yMin, yMax: b.yMax });
          }}
        >
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-16">grid (per axis)</span>
            <input
              type="range" className="flex-1" min={3} max={21} step={2}
              value={searchGrid}
              onChange={(e) => setSearchGrid(Number(e.target.value))}
            />
            <span className="w-6 text-right font-mono">{searchGrid}</span>
          </label>
          <p className="mt-0.5 text-[10px] text-slate-500">{searchGrid ** 2} Newton seeds</p>
        </RangeBox>

        <RangeBox
          label="Trajectory domain"
          rect={domain}
          onChange={setDomain}
          syncFrom={() => {
            const b = viewBounds(view, 1, 1);
            setDomain({ xMin: b.xMin, xMax: b.xMax, yMin: b.yMin, yMax: b.yMax });
          }}
        >
          <label className="mt-1 flex items-center gap-2 text-[11px] text-slate-300">
            <input
              type="checkbox"
              checked={enforceDomain}
              onChange={(e) => setEnforceDomain(e.target.checked)}
            />
            <span>Clip trajectories to domain</span>
          </label>
          <p className="text-[10px] text-slate-500">
            When off, the violet box is a hint; trajectories may roam until they hit another wall.
          </p>
        </RangeBox>

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
          <EquilibriumPanel info={selectedEqInfo} sys={sys} lin={selectedLin} />
        )}

        {(mode === "compare" || compareData) && (
          <div className="rounded bg-black/30 p-2 text-[11px] text-slate-300">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold text-cyan-200">Comparison Δ(t)</span>
              <button onClick={() => { setComparePts({ p1: null, p2: null }); setCompareData(null); }}
                className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/10">clear</button>
            </div>
            <p className="font-mono text-[10px] text-slate-400">
              <span className="text-sky-300">P₁</span> {comparePts.p1 ? `(${comparePts.p1[0].toFixed(2)}, ${comparePts.p1[1].toFixed(2)})` : "— click plane"}<br />
              <span className="text-orange-300">P₂</span> {comparePts.p2 ? `(${comparePts.p2[0].toFixed(2)}, ${comparePts.p2[1].toFixed(2)})` : "— click plane"}
            </p>
            {compareData
              ? <Sparkline data={compareData.separation} />
              : <p className="mt-1 text-[10px] text-slate-500">Pick two initial conditions on the plane to plot ‖X₁(t) − X₂(t)‖.</p>}
          </div>
        )}

        <div className="mt-auto space-y-1 text-[10px] text-slate-500">
          <p><b className="text-slate-300">Launch</b> → click plane (forward/backward/pair). <b className="text-slate-300">Drag</b> → pan · <b className="text-slate-300">Wheel</b> → zoom.</p>
          <p><b className="text-slate-300">Probe</b> → inspect F(x,y). <b className="text-slate-300">Compare</b> → click two ICs for Δ(t).</p>
          <p><b className="text-slate-300">Click</b> near an equilibrium → select it (Jacobian, λ, eigenvectors, manifolds).</p>
          <p>Trails — <span style={{ color: "#38e0c8" }}>cyan=forward</span> · <span style={{ color: "#fb923c" }}>amber=backward</span>. Ends — pink=eq · slate=escaped · violet=out of domain · amber=timeout · red=fail.</p>
          <p>Analysis — <span style={{ color: MANIFOLD_STABLE }}>Wˢ</span>/<span style={{ color: MANIFOLD_UNSTABLE }}>Wᵘ</span> manifolds · basins tint by attractor (all numerical approximations).</p>
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

// ── Equilibrium inspection panel (§11/§12). Pure presentational; reads the
//    StabilityResult + a Linearization (eigenvectors, stable/unstable dirs). ──
function EquilibriumPanel(
  { info, sys, lin }: { info: { point: number[]; stab: StabilityResult }; sys: DynamicalSystem | null; lin: Linearization | null },
) {
  const { point, stab } = info;
  const J = sys ? jacobianField(sys, point) : null;
  const round = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(4)) : v);
  const fmtVec = (v: Vec) => `(${v[0].toFixed(3)}, ${v[1].toFixed(3)})`;
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
      {/* Eigenvectors + stable/unstable directions (real eigenvalues only). */}
      {lin && lin.eigenpairs.some((p) => p.vector) && (
        <div className="mt-1.5 border-t border-white/5 pt-1.5 font-mono text-[10px]">
          {lin.eigenpairs.map((p, i) => p.vector && (
            <div key={i} className="flex justify-between">
              <span className="text-slate-500">v ({round(p.value.re)})</span>
              <span className="text-slate-300">{fmtVec(p.vector)}</span>
            </div>
          ))}
          {lin.unstableDirections.map((v, i) => (
            <div key={`u${i}`} style={{ color: MANIFOLD_UNSTABLE }}>unstable dir {fmtVec(v)}</div>
          ))}
          {lin.stableDirections.map((v, i) => (
            <div key={`s${i}`} style={{ color: MANIFOLD_STABLE }}>stable dir {fmtVec(v)}</div>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{stab.reason}</p>
      <p className="mt-1 text-[10px] text-slate-600">Linearization F(x) ≈ J(x₀)(x−x₀) · numerical</p>
    </div>
  );
}

// ── Basin legend: attractor identity → colour swatch (§6). ───────────────────
function BasinLegend({ attractors }: { attractors: { kind: string; point?: Vec }[] }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
      {attractors.map((a, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: BASIN_ATTRACTOR_HUES[i % BASIN_ATTRACTOR_HUES.length] }} />
          <span className="text-slate-400">{attractorTag(i)}{a.kind === "limit-cycle" ? " (cycle)" : a.point ? ` ${a.point[0].toFixed(1)},${a.point[1].toFixed(1)}` : ""}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "rgba(217,70,239,0.6)" }} /><span className="text-slate-400">cycle</span></span>
      <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "rgba(148,163,184,0.4)" }} /><span className="text-slate-400">escape</span></span>
    </div>
  );
}

// ── Δ(t) sparkline for trajectory comparison (§13). Inline SVG, log-safe. ────
function Sparkline({ data }: { data: SeparationPoint[] }) {
  if (data.length < 2) return null;
  const W = 240, H = 46;
  const tMax = data[data.length - 1].t || 1;
  const dMax = Math.max(...data.map((d) => d.delta), 1e-9);
  const pts = data.map((d) => {
    const x = (d.t / tMax) * W;
    const y = H - (d.delta / dMax) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div className="mt-1">
      <svg width={W} height={H} className="w-full rounded bg-black/40" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke="#f472b6" strokeWidth={1.2} />
      </svg>
      <p className="mt-0.5 flex justify-between font-mono text-[10px] text-slate-500">
        <span>Δ₀ = {data[0].delta.toExponential(2)}</span>
        <span>Δ_max = {dMax.toExponential(2)}</span>
        <span>t ≤ {tMax.toFixed(1)}</span>
      </p>
    </div>
  );
}

// ── RangeBox: a 4-input rectangle editor with a "sync from view" button. ─────
function RangeBox({
  label, rect, onChange, syncFrom, children,
}: {
  label: string;
  rect: Rect;
  onChange: (r: Rect) => void;
  syncFrom: () => void;
  children?: React.ReactNode;
}) {
  const numCls = "w-16 rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[11px] text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400";
  const set = (key: keyof Rect) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    onChange({ ...rect, [key]: v });
  };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-wide text-slate-500">{label}</h3>
        <button onClick={syncFrom} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/10 hover:text-cyan-200">sync from view</button>
      </div>
      <div className="grid grid-cols-2 gap-x-1.5 gap-y-1">
        <span className="text-[10px] text-slate-500">x min</span><input className={numCls} type="number" step="any" value={rect.xMin} onChange={set("xMin")} />
        <span className="text-[10px] text-slate-500">x max</span><input className={numCls} type="number" step="any" value={rect.xMax} onChange={set("xMax")} />
        <span className="text-[10px] text-slate-500">y min</span><input className={numCls} type="number" step="any" value={rect.yMin} onChange={set("yMin")} />
        <span className="text-[10px] text-slate-500">y max</span><input className={numCls} type="number" step="any" value={rect.yMax} onChange={set("yMax")} />
      </div>
      {children}
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