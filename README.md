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

The top navigation switches between nine workspaces:

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

### 🌀 Dynamics — dynamical systems & phase portraits
- Type an autonomous system `ẋ = f(x,y)`, `ẏ = g(x,y)` (or pick a preset:
  rotation, damped oscillator, saddle, Van der Pol, pendulum, spiral sink).
- **Vector field**, pan/zoom navigable plane, and **equilibria colored by
  stability** (stable/unstable node, spiral, saddle, center — from the Jacobian
  spectrum).
- **Trajectory animation:** click a *start point* and a particle flows along the
  field (RK4) to its *end point* — the equilibrium / singularity it converges to.
  Play/pause + speed.

### 🔬 Inspector — mathematical microscope
- Select an object (expression, matrix, vector, topological surface) and get a
  typed report: structure/AST, classification, domain, calculus (`f'`, `f''`,
  `∇`, Hessian, `∇²`), roots & critical points; matrix rank/det/eigenstructure/
  decompositions/conditioning/subspaces + 2×2 geometric action.
- Every value is tagged **exact / symbolic / numerical / estimated / inferred**,
  with navigable related objects and honest assumptions/limits. Capability-driven.

### 📓 Notebook — reproducible experiments
- A document of cells (markdown / parameter / expression / analysis) whose outputs
  are **derived deterministically** from the source; parameters propagate through a
  dependency graph and downstream analyses recompute.
- Undo/redo, snapshots, localStorage autosave, and import/export as
  `.mathsim.json` (declarative, schema-validated, no `eval`). Bundled examples.

### 📖 Docs — built-in manual
- Bilingual (English / Español) manual explaining every workspace and its
  underlying mathematics, with formulas typeset by **KaTeX**.

---

## Shared math core (`src/mathlab/`)

The correctness-critical layer, unit-tested (**860 tests**), all consuming one AST:

- `core/` — `lexer` → `parser` → `ast`, real `eval` (whitelisted functions,
  **never `eval`/`Function`**), `simplify`, `print`, `complexGlsl` (AST → GLSL),
  structured `errors`, seeded `rng`, central tolerances.
- `calculus/` — symbolic differentiation, Taylor, gradient/Hessian/Jacobian/Laplacian.
- `analysis/` + `numeric/` — roots (bisection/Newton), integration (Simpson +
  adaptive), limits.
- `linear/` — matrix ops, LU/QR/Cholesky/**SVD**, eigenvalues/eigenvectors
  (symmetric Jacobi + general QR), least squares, subspaces, conditioning.
- `ode/` — Euler/Heun/RK2/RK4 + adaptive RKF45 with metadata.
- `dynamics/` — systems, equilibria, Jacobian **stability** (continuous & discrete),
  trajectories.
- `optimization/` — golden-section, gradient descent, Newton, critical-point classify.
- `probability/` + `statistics/` — distributions + seeded sampling + Monte Carlo;
  dataset, descriptives, regression.
- `numberTheory/` — exact **bigint** arithmetic, primality, factorization, φ, μ, Collatz.
- `units/` — dimensional quantities, conversion, constants, uncertainty.
- `complex/` — first-class complex scalars, `Node → Complex` eval, Cauchy–Riemann.
- `pde/` — 1D heat & wave, 2D Laplace/Poisson (finite differences).
- `special/` — Gamma, log-Gamma, erf.

The `inspector/` (React-free analysis engine) and `experiment/` (notebook document
model + safe serialization) layers sit above the kernel. The same parsed AST feeds
the calculator, the fractal shaders, and every analysis — that is the core design
principle: **one engine, no duplicates, no `eval`.**

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
  mathlab/     shared math core: core, calculus, analysis, numeric, linear, ode,
               dynamics, optimization, probability, statistics, numberTheory,
               units, complex, pde, special, symbolic
  inspector/   React-free inspection engine (types, capabilities, inspect/*)
  experiment/  notebook document model, execution engine, safe serialization
  fractals/    fractal registry + types
  webgl/       WebGL renderer + AST→GLSL custom-shader builder
  graph/       graphing state + slider config
  bloch/       qubit math + state       fourd/  4D vectors, polytopes, surfaces
  topo/        topology surfaces + mesh + morph
  components/  React UI per workspace (graph, bloch, fourd, topo, dynamics,
               inspector, notebook, docs, …)
  App.tsx      top-level workspace switcher
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
