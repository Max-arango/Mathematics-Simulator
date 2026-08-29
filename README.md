# Mathematics Simulator

An open-source spin-off project aimed at exploring mathematics — ranging from
trigonometric functions in two-dimensional spaces to topology, fractal geometry,
and many more features to come. The project is **under active development**; if
you'd like to help, contributions are very welcome.

It is a single, coherent **mathematical exploration engine**: every workspace
below shares one math core (lexer → parser → AST → evaluator, complex numbers,
symbolic calculus, and an AST→GLSL compiler). No two engines, no `eval`.

> **🔗 Live demo: [mathematics-simulator.vercel.app](https://mathematics-simulator.vercel.app)**
> — deployed on Vercel, continuously deployed from the `main` branch. No local
> backend; the whole app runs in the browser.

---

## Workspaces

The top navigation switches between six workspaces:

### 📈 Calculator — 2D & 3D graphing (Desmos-style)
- **2D:** plot `y = f(x)`, multiple expressions with color + visibility, pan/zoom,
  live trace of `f(x)` and `f'(x)`.
- **Sliders:** any undefined variable becomes a slider; `min`/`max`/`step` accept
  *expressions* (so a slider can be limited to a set, e.g. `{0, 2, …, n−1}`);
  per-slider animation (loop / ping-pong).
- **Analysis tools:** draggable locator, tangent line with **symbolic derivative**,
  shaded definite **integral** (Simpson's rule).
- **3D:** explicit surfaces `z = f(x, y)` and **implicit surfaces** `F(x, y, z) = 0`
  (marching tetrahedra), multiple surfaces at once, bounding box + numbered axes,
  probe point showing `f`, `∂f/∂x`, `∂f/∂y`, `‖∇f‖`, orbit camera + view presets.

### 🌀 Fractal Lab — GPU escape-time fractals
- Mandelbrot, Julia (pick-from-Mandelbrot), Burning Ship, Tricorn, Celtic,
  Buffalo, Newton.
- Generalised exponent `z^p + c` (incl. decimals), smooth coloring, 6 palettes.
- **Deep zoom** via emulated double precision (double-single, df64).
- **Custom `f(z,c)`** and **Complex `f(z)` domain coloring** — your typed
  expression is compiled through the shared parser into a GPU shader.
- Parameter animation, PNG + config JSON export.

### 🧭 Bloch Sphere — single-qubit simulator
- Gates X, Y, Z, H, S, S†, T, T† and Rx/Ry/Rz rotations.
- **Drive pulses** (Rabi Ω, detuning Δ, phase φ, duration t) with a live preview
  of the effective rotation axis + ghost arc before applying.
- State trajectory, arrow animation, `|ψ⟩` / θ,φ readout, and **measurement
  probability bars** in the X/Y/Z bases.

### 🧊 4D — polytopes & parametric surfaces
- Tesseract, 5-cell, 16-cell, 24-cell, and parametric surfaces `(u,v) → ℝ⁴`
  (Clifford torus, Hopf fibration, …) typed with the shared parser.
- Rotation in all **six 4-space planes**, perspective projection `d/(d−w)`, and
  the 4th dimension mapped to **color**. Auto double-rotation.

### 🍩 Topology — homeomorphisms & deformation
- Everyday objects grouped by **genus** (ball, egg, plate, bowl, vase, cup…;
  donut, mug, teacup, ring, bagel, CD…).
- **Continuous morph** between same-genus shapes (mug ↔ donut, cup ↔ ball) — the
  panel verifies homeomorphism via genus / Euler characteristic `χ = 2 − 2g`.
- **Grab & deform:** pull the surface, inflate, twist, random deform — all
  topology-preserving. Spin in space, wireframe, color modes.

### 📖 Docs — built-in manual
- Bilingual (English / Español) manual explaining every workspace and its
  underlying mathematics, with formulas typeset by **KaTeX**.

---

## Shared math core (`src/mathlab/`)

The correctness-critical layer, unit-tested (112 tests total):

- `core/` — `lexer` → `parser` → `ast`, real `eval` (whitelisted functions,
  **never `eval`/`Function`**), `simplify`, `print`, and `complexGlsl`
  (AST → GLSL complex arithmetic).
- `calculus/derivative` — symbolic differentiation (chain/product/quotient/power).
- `analysis/` — numeric `roots` (bisection + Newton) and `integrate` (Simpson).
- `graph/scene` — turns expression lines into functions, sliders, and plots.

The same parsed AST feeds the graphing calculator **and** the fractal shaders —
that is the core design principle.

---

## Tech stack

- **React 19** + **TypeScript** (strict) + **Vite 7**
- **TailwindCSS v4**
- **WebGL** for fractals, 3D surfaces, the Bloch sphere, and 4D rendering
- **zustand** for state
- **KaTeX** for typeset math (lazy-loaded)
- **Vitest** for tests
- Deployed on **Vercel**

---

## Project structure

```
src/
  mathlab/            shared math core (lexer, parser, AST, eval, calculus, analysis)
  fractals/           fractal registry + types
  webgl/              WebGL renderer + AST→GLSL custom-shader builder
  graph/              graphing state + slider config
  bloch/              qubit math + state
  fourd/              4D vectors, polytopes, parametric surfaces
  topo/               topology surfaces + mesh + morph
  components/         React UI per workspace (graph, bloch, fourd, topo, docs, …)
  App.tsx             top-level workspace switcher
```

---

## Getting started

```bash
git clone https://github.com/Max-arango/Mathematics-Simulator.git
cd Mathematics-Simulator
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build (outputs to dist/)
npm run preview    # preview the production build
npm test           # run the test suite (Vitest)
```

Requires a modern browser with **WebGL**.

---

## Deployment

The app is a fully static single-page application (no backend) and is deployed
on **Vercel** with continuous deployment from `main`:

- Build command: `npm run build`
- Output directory: `dist`

Any push to `main` triggers a new deployment.

---

## Contributing

The project is under development and help is welcome — new fractals, surfaces,
calculator tools, or fixes. A good contribution:

1. Keeps the **shared math core** shared (no duplicate parsers/engines).
2. Adds a **test** for non-trivial math (`npm test` must stay green).
3. Uses no `eval` / `new Function` — everything goes through the parser/AST.

Fork, branch, and open a pull request.

## License

Released under the [MIT License](LICENSE).
