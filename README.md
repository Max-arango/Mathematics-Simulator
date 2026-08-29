# Fractal Lab

WebGL fractal exploration laboratory. React + TS + Vite + Tailwind v4.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm test
```

## Two modes (top nav)

- **Calculator** — Desmos-style graphing. Multiple expression lines, per-line
  color/visibility, auto-detected variable sliders. **2D** `y = f(x)` (Canvas2D,
  pan/zoom, grid+axes, live trace of `f(x)` and `f'(x)`) and **3D**
  `z = f(x,y)` (WebGL surface, drag-rotate, wheel-zoom, height+normal shading).
  Both share the one math core below. Scene builder in `mathlab/graph/scene.ts`
  (9 tests).
- **Fractal Lab** — the GPU fractal explorer (below).

## Shared math core (`src/mathlab/`)

One parser/AST feeds both the calculator and the fractal engine — no duplicate
math engines.

- `core/` — `lexer` → `parser` → `ast`, real `eval` (whitelisted functions, **no
  `eval`/`Function`**), `simplify`, `print`, and `complexGlsl` (AST → GLSL complex
  arithmetic).
- `calculus/derivative` — symbolic differentiation (chain/product/quotient/power).
- `analysis/roots` — bracketing + bisection, Newton iteration.

**Function ↔ fractal bridge:** the *Custom f(z,c)* and *Complex f(z)* fractals
compile a typed expression through this same core into a GPU shader
(`webgl/customShader.ts`). Type `z^2 + c`, `sin(z) + c`, `z^2 + conjugate(c)`,
`exp(z)`, `z^p + c` (p = exponent slider) and it renders live; the sidebar shows
the symbolic `∂/∂z` from the same AST. `Complex f(z)` renders domain coloring.
26 unit tests cover parser, evaluator, derivative, roots, and the GLSL compiler.

## Architecture

- `src/fractals/` — fractal registry. Add a fractal = one entry in `registry.ts`
  + a branch in the shader (`shaderType`). No other file changes.
- `src/webgl/` — `shaders.ts` (escape-time GLSL, generalised `z^p + c`) and
  `Renderer.ts` (WebGL1, uniform upload, single full-screen draw).
- `src/store.ts` — zustand state: active fractal, params, viewport, color,
  config export/import. Pure viewport math (`zoomAt`) is unit-tested.
- `src/components/` — `FractalCanvas` (render loop + pointer interaction),
  `Sidebar` (selector/params/color), `Topbar` (stats/export), `StatusBar`
  (viewport readout + float32 precision warning).

## Status

7 fractals: Mandelbrot · Julia · Burning Ship · Tricorn · Celtic · Buffalo ·
Newton (basins of z^n−1). Variable exponent `p` (incl. decimals) ·
cursor-centered wheel zoom · drag pan · iterations · escape radius · 6 palettes
(density/offset/invert) · smooth coloring · Julia-from-click · PNG export ·
config JSON save/load · FPS + render-ms readout.

**Animate panel** — sweep any parameter to watch the fractal morph: pick param,
range, speed (sweeps/sec), step count (0 = smooth), mode (loop / ping-pong /
once), play/pause. The parameter slider tracks the live value.

Rendering is GPU escape-time (WebGL1, `highp float` = 32-bit). Deep zoom is
capped by float32 (~`span 5e-5`, warned in the status bar). Lifting it (WebGL2
f64-emulation / perturbation reference orbits) is Phase 4.

## Next (not built)

- Phase 2: Newton fractal, domain coloring, iteration inspector, comparison view, presets.
- Phase 3: Sierpinski / Koch / Barnsley (IFS + Canvas2D), transform lab.
- Phase 4: custom formula parser (AST, no `eval`), animation timeline, box-counting dimension, deep-zoom precision engine.
