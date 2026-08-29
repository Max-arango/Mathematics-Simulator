// Bilingual manual content. Each block carries English + Spanish; formulas and
// code are language-neutral. Kept as data so one renderer serves both languages.
export type Lang = "en" | "es";

export type Block =
  | { t: "p"; en: string; es: string }
  | { t: "h"; en: string; es: string }
  | { t: "math"; text: string }
  | { t: "code"; text: string }
  | { t: "ul"; en: string[]; es: string[] };

export interface Section { id: string; title: { en: string; es: string }; blocks: Block[] }

const p = (en: string, es: string): Block => ({ t: "p", en, es });
const h = (en: string, es: string): Block => ({ t: "h", en, es });
const math = (text: string): Block => ({ t: "math", text });
const code = (text: string): Block => ({ t: "code", text });
const ul = (en: string[], es: string[]): Block => ({ t: "ul", en, es });

export const SECTIONS: Section[] = [
  {
    id: "overview",
    title: { en: "Overview", es: "Visión general" },
    blocks: [
      p(
        "MATH·LAB is a single mathematical engine with four workspaces sharing one parser, AST, complex numbers and numeric core: a Desmos-style 2D/3D graphing calculator, a GPU fractal laboratory, and a Bloch-sphere qubit simulator.",
        "MATH·LAB es un único motor matemático con cuatro espacios que comparten un solo parser, AST, números complejos y núcleo numérico: una calculadora gráfica 2D/3D tipo Desmos, un laboratorio de fractales en GPU y un simulador de qubit en la esfera de Bloch.",
      ),
      p(
        "Switch workspace from the top tabs: Calculator, Fractal Lab, Bloch Sphere, Docs.",
        "Cambia de espacio con las pestañas superiores: Calculator, Fractal Lab, Bloch Sphere, Docs.",
      ),
      h("Expression engine", "Motor de expresiones"),
      p(
        "Everything you type is tokenized (lexer) → parsed into an Abstract Syntax Tree (AST) → evaluated numerically or compiled to GLSL. JavaScript eval / new Function are never used: only whitelisted functions run.",
        "Todo lo que escribes se tokeniza (lexer) → se parsea a un Árbol de Sintaxis Abstracta (AST) → se evalúa numéricamente o se compila a GLSL. Nunca se usa eval / new Function de JavaScript: solo corren funciones en lista blanca.",
      ),
      ul(
        ["Operators: + − * / ^ , unary −, implicit product (2x, x(x+1))", "Functions: sin cos tan asin acos atan sinh cosh tanh sec csc cot exp ln log sqrt cbrt abs floor ceil round sign min max mod pow", "Constants: π (pi), e, φ (phi), τ (tau)"],
        ["Operadores: + − * / ^ , menos unario, producto implícito (2x, x(x+1))", "Funciones: sin cos tan asin acos atan sinh cosh tanh sec csc cot exp ln log sqrt cbrt abs floor ceil round sign min max mod pow", "Constantes: π (pi), e, φ (phi), τ (tau)"],
      ),
    ],
  },
  {
    id: "calc2d",
    title: { en: "2D Calculator", es: "Calculadora 2D" },
    blocks: [
      p(
        "Plot y = f(x). Add several expressions; each has a color and a visibility toggle. Drag to pan, wheel to zoom on the cursor.",
        "Grafica y = f(x). Añade varias expresiones; cada una tiene color y visibilidad. Arrastra para desplazar, rueda para hacer zoom en el cursor.",
      ),
      h("Definitions & references", "Definiciones y referencias"),
      code("f(x) = x^2\ng(x) = sin(x)\nh(x) = f(x) + g(x)"),
      p(
        "Functions can reference each other. y = expr and a bare expr both plot against x.",
        "Las funciones pueden referenciarse entre sí. y = expr y una expresión suelta grafican contra x.",
      ),
      h("Sliders", "Sliders"),
      p(
        "Any undefined variable becomes a slider. A numeric assignment (a = 2) is a slider too. Open ⚙ to set min / max / step — these accept expressions, so a slider can be restricted to a set, e.g. min 0, max n−1, step 2 gives {0, 2, 4, …, n−1}. ▶ animates a slider (speed + loop / ping-pong).",
        "Cualquier variable no definida se vuelve slider. Una asignación numérica (a = 2) también es slider. Abre ⚙ para fijar min / max / step — aceptan expresiones, así un slider se limita a un conjunto, p. ej. min 0, max n−1, step 2 da {0, 2, 4, …, n−1}. ▶ anima un slider (velocidad + loop / ping-pong).",
      ),
      h("Analysis tools", "Herramientas de análisis"),
      ul(
        ["Locate: draggable point on the x-axis with f(x) readout.", "Derivative: tangent line at x=a; shows f'(a) numeric and the symbolic derivative.", "Integral: shaded area between a and b; value by Simpson's rule."],
        ["Locate: punto arrastrable en el eje x con lectura de f(x).", "Derivative: recta tangente en x=a; muestra f'(a) numérica y la derivada simbólica.", "Integral: área sombreada entre a y b; valor por regla de Simpson."],
      ),
      h("The math", "La matemática"),
      p("Symbolic differentiation rules applied over the AST:", "Reglas de derivación simbólica aplicadas sobre el AST:"),
      math(String.raw`\begin{aligned}
(f+g)' &= f' + g' \\[2pt]
(fg)' &= f'g + fg' \\[2pt]
\left(\tfrac{f}{g}\right)' &= \frac{f'g - fg'}{g^{2}} \\[2pt]
\big(f(u)\big)' &= f'(u)\,u' \quad\text{(chain rule)} \\[2pt]
(x^{n})' &= n\,x^{n-1}
\end{aligned}`),
      p("Definite integral by composite Simpson's rule (n even):", "Integral definida por regla de Simpson compuesta (n par):"),
      math(String.raw`\int_{a}^{b} f\,dx \;\approx\; \frac{h}{3}\Big[\, f_{0} + 4\!\sum f_{\text{odd}} + 2\!\sum f_{\text{even}} + f_{n} \,\Big],\qquad h=\frac{b-a}{n}`),
    ],
  },
  {
    id: "calc3d",
    title: { en: "3D Calculator", es: "Calculadora 3D" },
    blocks: [
      p(
        "Two kinds of object. Explicit height surfaces z = f(x, y), and implicit surfaces F(x, y, z) = 0 where z is a genuine coordinate.",
        "Dos tipos de objeto. Superficies de altura explícitas z = f(x, y), y superficies implícitas F(x, y, z) = 0 donde z es una coordenada real.",
      ),
      code("z = sin(x)*cos(y)          → height surface\nx^2 + y^2 + z^2 = 9        → sphere (implicit)\nz^2 - x^2 - y^2 = 1        → hyperboloid"),
      p(
        "Add several expressions to see multiple surfaces at once, each tinted by its color. x and y are the plot axes; z is the output/height axis and is never turned into a slider.",
        "Añade varias expresiones para ver varias superficies a la vez, teñidas por su color. x, y son los ejes del plano; z es el eje de salida/altura y nunca se convierte en slider.",
      ),
      h("Reference frame", "Marco de referencia"),
      ul(
        ["Bounding box, ground grid (1 unit), colored X/Y/Z axes with projected number labels.", "z ∈ ±N control sets the vertical extent (axis, box and surface clamp).", "View presets: Iso / Top / Front / Side; drag to orbit, wheel to zoom.", "Probe point (x, y): shows f(x,y), ∂f/∂x, ∂f/∂y and ‖∇f‖."],
        ["Caja delimitadora, grid del piso (1 unidad), ejes X/Y/Z de color con números proyectados.", "Control z ∈ ±N fija la extensión vertical (eje, caja y recorte de la superficie).", "Vistas: Iso / Top / Front / Side; arrastra para orbitar, rueda para zoom.", "Sonda (x, y): muestra f(x,y), ∂f/∂x, ∂f/∂y y ‖∇f‖."],
      ),
      h("The math", "La matemática"),
      p("Gradient of a surface (used by the probe):", "Gradiente de una superficie (lo usa la sonda):"),
      math(String.raw`\nabla f = \left( \frac{\partial f}{\partial x},\ \frac{\partial f}{\partial y} \right)`),
      p(
        "Explicit surfaces are a regular grid mesh with normals from central differences. Implicit surfaces are extracted with marching tetrahedra: the volume is sampled, each cube split into 6 tetrahedra, and the g = 0 crossing is triangulated. Normals come from the numerical gradient ∇g.",
        "Las superficies explícitas son una malla regular con normales por diferencias centrales. Las implícitas se extraen con marching tetrahedra: se muestrea el volumen, cada cubo se parte en 6 tetraedros y se triangula el cruce g = 0. Las normales vienen del gradiente numérico ∇g.",
      ),
    ],
  },
  {
    id: "fractal",
    title: { en: "Fractal Lab", es: "Laboratorio Fractal" },
    blocks: [
      p(
        "GPU escape-time fractals. For each pixel we iterate a complex map and color by how fast the orbit escapes.",
        "Fractales de tiempo de escape en GPU. Para cada píxel se itera un mapa complejo y se colorea según qué tan rápido escapa la órbita.",
      ),
      math(String.raw`z_{n+1} = z_{n}^{\,p} + c,\qquad \text{escape when } |z_{n}| > R`),
      p("A complex power uses polar form:", "La potencia compleja usa forma polar:"),
      math(String.raw`z = r\,e^{i\theta} \quad\Longrightarrow\quad z^{p} = r^{p}\,e^{i p \theta}`),
      h("Built-in families", "Familias incluidas"),
      ul(
        ["Mandelbrot: z₀ = 0, c = pixel.", "Julia: c fixed, z₀ = pixel. Click a Mandelbrot point to spawn its Julia.", "Burning Ship: z = (|Re z| + i|Im z|)ᵖ + c.", "Tricorn: z = conj(z)ᵖ + c.  Celtic: |Re(zᵖ)| + i·Im(zᵖ) + c.  Buffalo: |Re| + i|Im| of zᵖ.", "Newton: z_{n+1} = z_n − f/f' with f = zⁿ − 1, colored by which root it converges to."],
        ["Mandelbrot: z₀ = 0, c = píxel.", "Julia: c fijo, z₀ = píxel. Haz clic en un punto de Mandelbrot para generar su Julia.", "Burning Ship: z = (|Re z| + i|Im z|)ᵖ + c.", "Tricorn: z = conj(z)ᵖ + c.  Celtic: |Re(zᵖ)| + i·Im(zᵖ) + c.  Buffalo: |Re| + i|Im| de zᵖ.", "Newton: z_{n+1} = z_n − f/f' con f = zⁿ − 1, coloreado por la raíz a la que converge."],
      ),
      h("Smooth coloring", "Coloreado suave"),
      p("Continuous iteration count removes color banding:", "El conteo continuo de iteraciones elimina las bandas de color:"),
      math(String.raw`\nu = n + 1 - \frac{\log\big(\log|z_{n}|\big)}{\log p}`),
      h("Deep zoom (df64)", "Zoom profundo (df64)"),
      p(
        "WebGL floats are 32-bit (~7 digits). Coordinates and the iteration run in emulated double precision (double-single: each number is a hi + lo pair of float32), extending crisp zoom to ~1e-12 for integer exponents.",
        "Los floats de WebGL son de 32 bits (~7 dígitos). Las coordenadas y la iteración corren en doble precisión emulada (double-single: cada número es un par hi + lo de float32), extendiendo el zoom nítido a ~1e-12 para exponentes enteros.",
      ),
      h("Custom expressions → fractal", "Expresiones propias → fractal"),
      p(
        "Custom f(z,c) compiles your typed expression through the SAME parser into a GPU shader: z^2 + c, sin(z) + c, z^2 + conjugate(c), exp(z) + c, z^p + c (p = exponent slider). Complex f(z) renders domain coloring: hue = arg f(z), brightness = |f(z)|. The sidebar shows the symbolic ∂/∂z of your expression.",
        "Custom f(z,c) compila tu expresión con el MISMO parser a un shader de GPU: z^2 + c, sin(z) + c, z^2 + conjugate(c), exp(z) + c, z^p + c (p = slider de exponente). Complex f(z) hace domain coloring: matiz = arg f(z), brillo = |f(z)|. La barra lateral muestra la ∂/∂z simbólica de tu expresión.",
      ),
      p(
        "Palettes, color density/offset/invert, per-parameter animation, and PNG / config JSON export are available for every fractal.",
        "Paletas, densidad/desfase/invertir color, animación por parámetro y exportar PNG / config JSON están disponibles para cada fractal.",
      ),
    ],
  },
  {
    id: "bloch-state",
    title: { en: "Bloch — states", es: "Bloch — estados" },
    blocks: [
      p("A qubit is a normalized complex 2-vector:", "Un qubit es un 2-vector complejo normalizado:"),
      math(String.raw`|\psi\rangle = \alpha|0\rangle + \beta|1\rangle,\qquad |\alpha|^{2} + |\beta|^{2} = 1`),
      p("Written with angles θ (polar) and φ (azimuth):", "Escrito con ángulos θ (polar) y φ (azimutal):"),
      math(String.raw`|\psi\rangle = \cos\tfrac{\theta}{2}\,|0\rangle + e^{i\phi}\sin\tfrac{\theta}{2}\,|1\rangle`),
      p("The Bloch vector (the arrow on the sphere):", "El vector de Bloch (la flecha en la esfera):"),
      math(String.raw`\begin{aligned}
x &= 2\,\operatorname{Re}(\bar\alpha\beta) = \sin\theta\cos\phi \\[2pt]
y &= 2\,\operatorname{Im}(\bar\alpha\beta) = \sin\theta\sin\phi \\[2pt]
z &= |\alpha|^{2} - |\beta|^{2} = \cos\theta
\end{aligned}`),
      p(
        "|0⟩ is the north pole (+z), |1⟩ the south pole (−z), |+⟩/|−⟩ sit on ±x, |i⟩/|−i⟩ on ±y. Set-state buttons jump to these. The gold arrow is the current spin; the fading teal trail is its history (toggle it off if it clutters).",
        "|0⟩ es el polo norte (+z), |1⟩ el polo sur (−z), |+⟩/|−⟩ están en ±x, |i⟩/|−i⟩ en ±y. Los botones de estado saltan a estos. La flecha dorada es el spin actual; la estela teal que se desvanece es su historia (ocúltala si estorba).",
      ),
    ],
  },
  {
    id: "bloch-gates",
    title: { en: "Bloch — gates & rotations", es: "Bloch — compuertas y rotaciones" },
    blocks: [
      p("Gates are 2×2 unitary matrices acting on (α, β):", "Las compuertas son matrices unitarias 2×2 que actúan sobre (α, β):"),
      math(String.raw`X = \begin{pmatrix}0&1\\1&0\end{pmatrix}\quad Y = \begin{pmatrix}0&-i\\ i&0\end{pmatrix}\quad Z = \begin{pmatrix}1&0\\0&-1\end{pmatrix}`),
      math(String.raw`H = \tfrac{1}{\sqrt{2}}\begin{pmatrix}1&1\\1&-1\end{pmatrix}\quad S = \begin{pmatrix}1&0\\0&i\end{pmatrix}\quad T = \begin{pmatrix}1&0\\0&e^{i\pi/4}\end{pmatrix}`),
      p(
        "Every single-qubit gate is a rotation of the Bloch vector about an axis n by an angle:",
        "Toda compuerta de un qubit es una rotación del vector de Bloch alrededor de un eje n por un ángulo:",
      ),
      math(String.raw`R_{\hat{n}}(\theta) = \cos\tfrac{\theta}{2}\,I \;-\; i\,\sin\tfrac{\theta}{2}\,(\hat{n}\cdot\vec{\sigma})`),
      p("where σ = (X, Y, Z) are the Pauli matrices. As axis / angle:", "donde σ = (X, Y, Z) son las matrices de Pauli. Como eje / ángulo:"),
      ul(
        ["X, Y, Z = π rotation about x, y, z.", "H = π rotation about (x+z)/√2.", "S = π/2 about z,  T = π/4 about z (S†, T† negative).", "Rx / Ry / Rz: rotate by the chosen angle about x / y / z."],
        ["X, Y, Z = rotación de π sobre x, y, z.", "H = rotación de π sobre (x+z)/√2.", "S = π/2 sobre z,  T = π/4 sobre z (S†, T† negativos).", "Rx / Ry / Rz: rota el ángulo elegido sobre x / y / z."],
      ),
      p(
        "This axis/angle view is why any gate can be animated as an arc on the sphere — the arrow walks the rotation.",
        "Esta vista eje/ángulo es la razón por la que cualquier compuerta se anima como un arco en la esfera — la flecha recorre la rotación.",
      ),
    ],
  },
  {
    id: "bloch-pulses",
    title: { en: "Bloch — pulses", es: "Bloch — pulsos" },
    blocks: [
      p(
        "A drive pulse evolves the qubit under a Hamiltonian instead of a discrete gate — the physical way rotations happen (NMR / superconducting qubits).",
        "Un pulso de excitación evoluciona el qubit bajo un Hamiltoniano en vez de una compuerta discreta — la forma física en que ocurren las rotaciones (RMN / qubits superconductores).",
      ),
      math(String.raw`H = \frac{\Delta}{2}\,\sigma_{z} \;+\; \frac{\Omega}{2}\big(\cos\phi\,\sigma_{x} + \sin\phi\,\sigma_{y}\big)`),
      ul(
        ["Ω — Rabi frequency (drive amplitude).", "Δ — detuning (how far off resonance).", "φ — pulse phase (0° drives about x, 90° about y).", "t — duration."],
        ["Ω — frecuencia de Rabi (amplitud del drive).", "Δ — detuning (qué tan fuera de resonancia).", "φ — fase del pulso (0° excita sobre x, 90° sobre y).", "t — duración."],
      ),
      p("Evolving for time t is a rotation about the effective axis:", "Evolucionar un tiempo t es una rotación sobre el eje efectivo:"),
      math(String.raw`\begin{aligned}
\text{axis} &\;\propto\; (\,\Omega\cos\phi,\ \Omega\sin\phi,\ \Delta\,) \\[2pt]
\text{angle} &\;=\; \sqrt{\Omega^{2} + \Delta^{2}}\;\cdot\; t
\end{aligned}`),
      p(
        "On resonance (Δ = 0) the axis lies in the equatorial plane and a pulse with Ω·t = π is a π-pulse (a full flip |0⟩ → |1⟩). Detuning tilts the axis toward z and speeds the rotation to Ω_eff = √(Ω²+Δ²), producing the characteristic off-resonance cones/spirals.",
        "En resonancia (Δ = 0) el eje está en el plano ecuatorial y un pulso con Ω·t = π es un π-pulso (volteo completo |0⟩ → |1⟩). El detuning inclina el eje hacia z y acelera la rotación a Ω_eff = √(Ω²+Δ²), produciendo los conos/espirales característicos fuera de resonancia.",
      ),
      p(
        "Move any pulse slider and the sphere shows a live cyan preview: the effective rotation axis plus a ghost arc from the current state to where the pulse would land — before you Apply. Buttons Apply / π pulse / π/2 commit it and animate the arrow.",
        "Mueve cualquier slider del pulso y la esfera muestra un preview cyan en vivo: el eje de rotación efectivo más un arco fantasma desde el estado actual hasta dónde caería el pulso — antes de Apply. Los botones Apply / π pulse / π/2 lo confirman y animan la flecha.",
      ),
    ],
  },
  {
    id: "fourd",
    title: { en: "4D Space", es: "Espacio 4D" },
    blocks: [
      p(
        "You cannot draw 4D directly. The pipeline is: rotate in 4-space → project 4D → 3D → view with the 3D camera. The fourth coordinate w is mapped to color, so position shows three dimensions and hue shows the fourth.",
        "No se puede dibujar 4D directo. El proceso es: rotar en 4-espacio → proyectar 4D → 3D → ver con la cámara 3D. La cuarta coordenada w se mapea a color, así la posición muestra tres dimensiones y el matiz la cuarta.",
      ),
      h("Rotation", "Rotación"),
      p(
        "In 4D you rotate in a plane, not about an axis. There are six independent planes (XY, XZ, XW, YZ, YW, ZW). A rotation in plane (i, j) by θ:",
        "En 4D rotas en un plano, no alrededor de un eje. Hay seis planos independientes (XY, XZ, XW, YZ, YW, ZW). Una rotación en el plano (i, j) por θ:",
      ),
      math(String.raw`\begin{pmatrix} x_i' \\ x_j' \end{pmatrix} = \begin{pmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{pmatrix} \begin{pmatrix} x_i \\ x_j \end{pmatrix}`),
      h("Perspective projection", "Proyección en perspectiva"),
      p("From a viewer at distance d along +w, each point scales by d/(d−w):", "Desde un visor a distancia d sobre +w, cada punto escala por d/(d−w):"),
      math(String.raw`(x, y, z) \;\mapsto\; \frac{d}{\,d - w\,}\,(x, y, z)`),
      p(
        "Points with larger w loom larger — the inner cube of the tesseract grows to the outer cube as it rotates.",
        "Los puntos con w mayor se agrandan — el cubo interno del teseracto crece hasta el externo al rotar.",
      ),
      h("What you can plot", "Qué puedes graficar"),
      ul(
        ["Polytopes: tesseract (8-cell), 5-cell (simplex), 16-cell.", "Parametric surfaces (u, v) → ℝ⁴ typed with the shared parser, e.g. the Clifford torus x=cos u, y=sin u, z=cos v, w=sin v (which lives on the unit 3-sphere).", "Six rotation-plane sliders, projection distance, and an auto double-rotation (XW + YZ)."],
        ["Politopos: teseracto (8-cell), 5-cell (símplex), 16-cell.", "Superficies paramétricas (u, v) → ℝ⁴ escritas con el parser compartido, p. ej. el toro de Clifford x=cos u, y=sin u, z=cos v, w=sin v (que vive en la 3-esfera unidad).", "Seis sliders de plano de rotación, distancia de proyección y una doble rotación automática (XW + YZ)."],
      ),
    ],
  },
  {
    id: "topology",
    title: { en: "Topology", es: "Topología" },
    blocks: [
      p(
        "The topology workspace shows triangulated CLOSED 2-manifolds (surfaces with no boundary, like a sphere or a donut) and lets you continuously deform one into another. Each object is a parametric surface sampled on a (u, v) grid and welded at its seams and poles.",
        "El espacio de topología muestra 2-variedades CERRADAS trianguladas (superficies sin borde, como una esfera o una dona) y permite deformar una en otra de forma continua. Cada objeto es una superficie paramétrica muestreada en una malla (u, v) y soldada en sus costuras y polos.",
      ),
      h("Homeomorphism", "Homeomorfismo"),
      p(
        "Two spaces are homeomorphic when there is a bijection f that is continuous and whose inverse is also continuous. Continuity is the GENERAL topological definition: the preimage of every open set is open — not an epsilon-delta test.",
        "Dos espacios son homeomorfos cuando existe una biyección f continua cuya inversa también es continua. La continuidad es la definición topológica GENERAL: la preimagen de todo abierto es abierta — no un test épsilon-delta.",
      ),
      h("Exact vs numeric verification", "Verificación exacta vs numérica"),
      p(
        "For FINITE spaces the app verifies homeomorphism EXACTLY and exhaustively (finiteSpace.ts): it checks bijectivity and that the preimage of every open set is open, with no floating point. For the SURFACES, it uses the classification theorem: two closed, connected, orientable surfaces are homeomorphic iff they share the same Euler characteristic χ, which is COMPUTED from the mesh (V − E + F) rather than declared.",
        "Para espacios FINITOS la app verifica el homeomorfismo de forma EXACTA y exhaustiva (finiteSpace.ts): comprueba biyectividad y que la preimagen de todo abierto sea abierta, sin coma flotante. Para las SUPERFICIES usa el teorema de clasificación: dos superficies cerradas, conexas y orientables son homeomorfas sii comparten la misma característica de Euler χ, que se CALCULA de la malla (V − E + F) en vez de declararse.",
      ),
      math(String.raw`\chi = V - E + F, \qquad g = \frac{2 - \chi}{2}`),
      h("The morph is a visualization", "El morph es una visualización"),
      p(
        "The animated deformation (morph slider) is a visual homotopy/isotopy — it illustrates the equivalence but is NOT the proof. The proof is the equality of the computed invariants shown in the panel.",
        "La deformación animada (slider de morph) es una homotopía/isotopía visual — ilustra la equivalencia pero NO es la demostración. La demostración es la igualdad de los invariantes calculados que se muestran en el panel.",
      ),
      h("Limitation", "Limitación"),
      p(
        "General continuous-map homeomorphism on ℝⁿ (e.g. showing x ↦ x³ is a homeomorphism of ℝ) is NOT verified here — that is undecidable in general without symbolic analysis. Only finite spaces (exact) and closed orientable surfaces (via χ) are decided.",
        "El homeomorfismo por mapa continuo general en ℝⁿ (p. ej. mostrar que x ↦ x³ es un homeomorfismo de ℝ) NO se verifica aquí — es indecidible en general sin análisis simbólico. Solo se deciden espacios finitos (exacto) y superficies cerradas orientables (vía χ).",
      ),
    ],
  },
  {
    id: "notebook",
    title: { en: "Notebook / Experiments", es: "Notebook / Experimentos" },
    blocks: [
      p(
        "The Notebook turns exploration into a reproducible document. An experiment is a sequence of cells — text, parameters, expressions, and analyses — whose outputs are derived deterministically from the cell source. Save it, reload it, and it reconstructs exactly.",
        "El Notebook convierte la exploración en un documento reproducible. Un experimento es una secuencia de celdas — texto, parámetros, expresiones y análisis — cuyos resultados se derivan de forma determinista del texto de la celda. Guárdalo, recárgalo, y se reconstruye idéntico.",
      ),
      ul(
        ["Expression cells define named objects (e.g. f = a·x² − 4). Analysis cells inspect them (derivatives, roots, critical points, gradient/Hessian).", "Parameters propagate through a dependency graph: change a and every downstream analysis recomputes.", "Undo/redo (slider drags coalesced), snapshots, localStorage autosave, and import/export as .mathsim.json.", "Bundled example experiments double as regression fixtures."],
        ["Las celdas de expresión definen objetos con nombre (p. ej. f = a·x² − 4). Las de análisis los inspeccionan (derivadas, raíces, puntos críticos, gradiente/Hessiano).", "Los parámetros propagan por un grafo de dependencias: cambia a y todo análisis aguas abajo se recalcula.", "Undo/redo (arrastres de slider agrupados), snapshots, autoguardado en localStorage e import/export como .mathsim.json.", "Los experimentos de ejemplo sirven también de fixtures de regresión."],
      ),
      h("Reproducible & safe", "Reproducible y seguro"),
      p(
        "The canonical data is the source, never rendered output; caches can be discarded and regenerated. Experiment files are untrusted input: parsed as declarative JSON, schema-validated with resource limits, with no eval / new Function — malformed files fail with structured errors instead of crashing or executing anything.",
        "El dato canónico es el texto fuente, nunca el resultado renderizado; los cachés se pueden descartar y regenerar. Los archivos de experimento son input no confiable: se parsean como JSON declarativo, se validan contra esquema con límites de recursos, sin eval / new Function — los archivos malformados fallan con errores estructurados en vez de crashear o ejecutar nada.",
      ),
    ],
  },
  {
    id: "inspector",
    title: { en: "Inspector", es: "Inspector" },
    blocks: [
      p(
        "The Inspector is a microscope for mathematical objects. Pick an object — an expression, a matrix, a vector, or a topological surface — and it reports its structure, properties, calculus, and invariants, with each value tagged by how it was obtained.",
        "El Inspector es un microscopio para objetos matemáticos. Elige un objeto — una expresión, una matriz, un vector o una superficie topológica — y reporta su estructura, propiedades, cálculo e invariantes, con cada valor etiquetado según cómo se obtuvo.",
      ),
      ul(
        ["Expression: AST structure, polynomial degree, conservative domain restrictions, f′/f″, gradient/Hessian/Laplacian, numeric roots and critical points classified by f″.", "Matrix: determinant, rank, invertibility, symmetry, and the 2×2 geometric action; related transpose/inverse.", "Vector: norm and unit direction. Topology: V, E, F, χ, components, orientability and genus computed from the mesh.", "Compare mode, capability chips, navigable related objects, and an assumptions/limits list."],
        ["Expresión: estructura del AST, grado polinómico, restricciones de dominio conservadoras, f′/f″, gradiente/Hessiano/Laplaciano, raíces numéricas y puntos críticos clasificados por f″.", "Matriz: determinante, rango, invertibilidad, simetría y acción geométrica 2×2; transpuesta/inversa relacionadas.", "Vector: norma y dirección unitaria. Topología: V, E, F, χ, componentes, orientabilidad y género calculados de la malla.", "Modo comparar, chips de capacidad, objetos relacionados navegables y lista de supuestos/límites."],
      ),
      h("Confidence labels", "Etiquetas de confianza"),
      p(
        "Every value declares its epistemic status: exact (integers/closed form), symbolic, numerical, estimated (sampled), inferred (under stated assumptions), heuristic, or unsupported. A numerical estimate is never shown as a proof; symbolic equivalence is never claimed from numerical sampling alone.",
        "Cada valor declara su estatus: exact (enteros/forma cerrada), symbolic, numerical, estimated (muestreado), inferred (bajo supuestos declarados), heuristic o unsupported. Una estimación numérica nunca se muestra como prueba; nunca se afirma equivalencia simbólica solo por muestreo numérico.",
      ),
    ],
  },
  {
    id: "kernel",
    title: { en: "Math kernel", es: "Núcleo matemático" },
    blocks: [
      p(
        "All workspaces sit on one shared kernel. Phase I added first-class complex scalars, vectors and matrices, vector calculus (gradient / Hessian / Jacobian / Laplacian), numerical limits, adaptive integration, a small symbolic integrator, and Taylor expansion — every result labels itself as EXACT (symbolic) or an APPROXIMATION (numerical, with error metadata).",
        "Todos los espacios se apoyan en un único núcleo. La Fase I añadió escalares complejos, vectores y matrices de primera clase, cálculo vectorial (gradiente / Hessiano / Jacobiano / Laplaciano), límites numéricos, integración adaptativa, un integrador simbólico acotado y expansión de Taylor — cada resultado se etiqueta como EXACTO (simbólico) o APROXIMACIÓN (numérico, con metadatos de error).",
      ),
      h("Differential operators", "Operadores diferenciales"),
      math(String.raw`\nabla f = \Big(\tfrac{\partial f}{\partial x_1},\dots,\tfrac{\partial f}{\partial x_n}\Big),\quad H_{ij}=\tfrac{\partial^2 f}{\partial x_i\partial x_j},\quad J_{ij}=\tfrac{\partial f_i}{\partial x_j},\quad \nabla^2 f=\sum_i \tfrac{\partial^2 f}{\partial x_i^2}`),
      p(
        "These are symbolic (via the shared derivative engine) and also evaluate numerically; symbolic results are cross-validated against finite differences in the test suite.",
        "Son simbólicos (vía el motor de derivadas compartido) y también evalúan numéricamente; los resultados simbólicos se cross-validan contra diferencias finitas en la suite de tests.",
      ),
      h("Linear algebra", "Álgebra lineal"),
      p(
        "Matrix determinant, inverse, rank and linear solving use LU decomposition with partial pivoting (floating-point numerical operations, not exact symbolic). Vectors support dot, cross (ℝ³), norm, projection.",
        "Determinante, inversa, rango y resolución de sistemas usan descomposición LU con pivoteo parcial (operaciones numéricas en punto flotante, no simbólicas exactas). Los vectores soportan producto punto, cruz (ℝ³), norma, proyección.",
      ),
      h("Mathematical honesty", "Honestidad matemática"),
      ul(
        ["Numerical limit / integral / root results are approximations with error metadata — never presented as proofs.", "Symbolic integration covers a small SOUND subset (linearity, powers, sin/cos/exp of the bare variable, 1/x); anything else returns 'unsupported' rather than a wrong answer.", "Complex log / sqrt / inverse-trig use principal branches.", "General ℝⁿ homeomorphism and closed-form limits are not attempted — a numerical estimate is labeled as such."],
        ["Los resultados numéricos de límite / integral / raíz son aproximaciones con metadatos de error — nunca se presentan como pruebas.", "La integración simbólica cubre un subconjunto pequeño y correcto (linealidad, potencias, sin/cos/exp de la variable, 1/x); lo demás devuelve 'unsupported' en vez de una respuesta errónea.", "log / sqrt / trig inversas complejas usan ramas principales.", "No se intenta homeomorfismo general en ℝⁿ ni límites en forma cerrada — una estimación numérica se etiqueta como tal."],
      ),
    ],
  },
  {
    id: "safety",
    title: { en: "Notes & limits", es: "Notas y límites" },
    blocks: [
      ul(
        [
          "Security: no eval / new Function anywhere; only whitelisted functions evaluate. Invalid input while typing draws a gap, never crashes.",
          "Fractal deep zoom is bounded by df64 (~1e-12); fractional exponents use float32 (shallower).",
          "Bloch: one qubit, pure state, no decoherence (T1/T2) yet.",
          "3D implicit surfaces are sampled on a volume grid — very thin sheets may need a finer resolution.",
        ],
        [
          "Seguridad: sin eval / new Function en ningún lado; solo evalúan funciones en lista blanca. La entrada inválida mientras escribes dibuja un hueco, nunca revienta.",
          "El zoom profundo fractal está limitado por df64 (~1e-12); los exponentes fraccionarios usan float32 (menos profundo).",
          "Bloch: un qubit, estado puro, aún sin decoherencia (T1/T2).",
          "Las superficies implícitas 3D se muestrean en una malla de volumen — láminas muy delgadas pueden requerir más resolución.",
        ],
      ),
    ],
  },
];

export const UI = {
  title: { en: "Manual", es: "Manual" },
  subtitle: {
    en: "How every workspace works, with the underlying mathematics.",
    es: "Cómo funciona cada espacio, con la matemática subyacente.",
  },
};
