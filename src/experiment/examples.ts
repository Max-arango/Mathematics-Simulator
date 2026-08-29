import { emptyExperiment, type Experiment } from "./types.ts";

export interface Example { id: string; title: string; description: string; build: () => Experiment }

function make(title: string, description: string, cells: Experiment["cells"]): Experiment {
  const e = emptyExperiment(title);
  e.metadata.description = description;
  e.cells = cells;
  return e;
}

export const EXAMPLES: Example[] = [
  {
    id: "calculus",
    title: "Calculus — cubic",
    description: "Explore f(x) = x³ − 3x: derivative, critical points, extrema.",
    build: () => make("Calculus — cubic", "Explore f(x) = x³ − 3x.", [
      { id: "m0", kind: "markdown", source: "# Exploring a cubic\n\nWe study $f(x)=x^3-3x$ and its critical points." },
      { id: "e0", kind: "expression", name: "f", source: "x^3 - 3x" },
      { id: "a0", kind: "analysis", targetName: "f" },
      { id: "m1", kind: "markdown", source: "The critical points are the roots of $f'$." },
    ]),
  },
  {
    id: "multivariable",
    title: "Multivariable — paraboloid",
    description: "f(x,y) = x² + y²: gradient, Hessian, Laplacian.",
    build: () => make("Multivariable — paraboloid", "Gradient / Hessian / Laplacian of x²+y².", [
      { id: "m0", kind: "markdown", source: "# Paraboloid $f(x,y)=x^2+y^2$" },
      { id: "e0", kind: "expression", name: "f", source: "x^2 + y^2" },
      { id: "a0", kind: "analysis", targetName: "f" },
    ]),
  },
  {
    id: "gaussian",
    title: "Gaussian with a parameter",
    description: "f(x) = e^(−a·x²): change a and watch the analysis update.",
    build: () => make("Gaussian with a parameter", "Parameter-driven Gaussian.", [
      { id: "m0", kind: "markdown", source: "# Gaussian\n\n$f(x)=e^{-a x^2}$ — drag $a$ and the analysis recomputes." },
      { id: "p0", kind: "parameter", name: "a", value: 1, min: 0.1, max: 5, step: 0.1 },
      { id: "e0", kind: "expression", name: "f", source: "exp(-a*x^2)" },
      { id: "a0", kind: "analysis", targetName: "f" },
    ]),
  },
];
