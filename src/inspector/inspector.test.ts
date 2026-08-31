import { describe, it, expect } from "vitest";
import { inspect, compare } from "./engine.ts";
import type { InspectionResult } from "./types.ts";

const propVal = (r: InspectionResult, section: string, label: string) =>
  r.sections.find((s) => s.title.startsWith(section))?.properties.find((p) => p.label === label)?.value;

describe("expression inspector", () => {
  it("classifies a polynomial and reports degree + structure", () => {
    const r = inspect({ kind: "expression", source: "x^2 + 3x + 2" });
    expect(r.kind).toBe("expression");
    expect(propVal(r, "Classification", "Class")).toBe("Polynomial, degree 2");
    expect(propVal(r, "Structure", "Variables")).toBe("x");
    expect(r.capabilities).toContain("derivative");
    expect(r.capabilities).toContain("criticalPoints");
  });

  it("computes f′ and f″ symbolically", () => {
    const r = inspect({ kind: "expression", source: "x^3" });
    expect(propVal(r, "Calculus", "f′")).toBe("3·x^2");
    expect(propVal(r, "Calculus", "f″")).toBe("6·x");
  });

  it("finds the critical point of x^2 − 4x and classifies it as a minimum", () => {
    const r = inspect({ kind: "expression", source: "x^2 - 4x" });
    const crit = r.sections.find((s) => s.title.startsWith("Roots"))!;
    expect(crit.properties.some((p) => p.label.includes("x = 2") && p.value.includes("local minimum"))).toBe(true);
  });

  it("detects domain restrictions conservatively (heuristic)", () => {
    const r = inspect({ kind: "expression", source: "sqrt(x) + 1/(x-2)" });
    const dom = r.sections.find((s) => s.title === "Domain")!;
    const vals = dom.properties.map((p) => p.value);
    expect(vals).toContain("x ≥ 0");
    expect(vals).toContain("x - 2 ≠ 0");
    expect(dom.properties.every((p) => p.confidence === "heuristic")).toBe(true);
  });

  it("gives vector calculus for multivariable fields", () => {
    const r = inspect({ kind: "expression", source: "x^2 + y^2" });
    expect(r.identity).toContain("ℝ^2");
    expect(r.capabilities).toContain("gradient");
    expect(propVal(r, "Vector calculus", "∇²f (Laplacian)")).toBeDefined();
  });

  it("reports invalid expressions without throwing", () => {
    const r = inspect({ kind: "expression", source: "x +" });
    expect(r.identity).toBe("Invalid expression");
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("matrix inspector", () => {
  it("reports determinant, invertibility, symmetry, and capabilities", () => {
    const r = inspect({ kind: "matrix", data: [[2, 0], [0, 3]] });
    expect(propVal(r, "Invariants", "Determinant")).toBe("6");
    expect(propVal(r, "Invariants", "Invertible")).toBe("yes");
    expect(propVal(r, "Shape", "Symmetric")).toBe("yes");
    expect(r.capabilities).toContain("inverse");
  });
  it("flags a singular matrix and withholds the inverse capability", () => {
    const r = inspect({ kind: "matrix", data: [[1, 2], [2, 4]] });
    expect(propVal(r, "Invariants", "Invertible")).toBe("no");
    expect(r.capabilities).not.toContain("inverse");
    expect(r.warnings.some((w) => w.includes("singular"))).toBe(true);
  });
  it("describes the 2×2 geometric action", () => {
    const r = inspect({ kind: "matrix", data: [[0, -1], [1, 0]] }); // 90° rotation
    const geo = r.sections.find((s) => s.title.startsWith("Geometric"))!;
    expect(geo.properties.some((p) => p.value.includes("rotation"))).toBe(true);
  });

  it("reports eigenstructure, SVD, conditioning and subspaces for a diagonal matrix", () => {
    const r = inspect({ kind: "matrix", data: [[2, 0], [0, 3]] });
    expect(r.capabilities).toContain("eigen");
    expect(propVal(r, "Eigenstructure", "λ1")).toBe("3"); // sorted by descending |λ|
    expect(propVal(r, "Eigenstructure", "λ2")).toBe("2");
    expect(propVal(r, "Conditioning", "Condition number κ₂")).toBe("1.5"); // 3/2
    expect(propVal(r, "Subspaces", "Nullity (right)")).toBe("0");
    expect(propVal(r, "Decompositions", "SVD")).toContain("3, 2"); // singular values
  });

  it("renders a complex conjugate eigenvalue pair for a rotation", () => {
    const r = inspect({ kind: "matrix", data: [[0, -1], [1, 0]] });
    const eig = r.sections.find((s) => s.title === "Eigenstructure")!;
    expect(eig.properties.some((p) => p.value.includes("±") && p.value.includes("i"))).toBe(true);
    expect(eig.properties.find((p) => p.label === "Diagonalizable")?.value).toBe("yes");
  });

  it("reports κ₂ = ∞ and SVD rank 1 for a singular matrix", () => {
    const r = inspect({ kind: "matrix", data: [[1, 2], [2, 4]] });
    expect(propVal(r, "Conditioning", "Condition number κ₂")).toBe("∞");
    expect(propVal(r, "Conditioning", "Rank (SVD, condition-aware)")).toBe("1");
    expect(r.warnings.some((w) => w.includes("singular") || w.includes("ill-conditioned"))).toBe(true);
  });

  it("skips spectral sections above the size cap with a warning", () => {
    const n = 65;
    const big = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    const r = inspect({ kind: "matrix", data: big });
    expect(r.sections.some((s) => s.title === "Eigenstructure")).toBe(false);
    expect(r.warnings.some((w) => w.includes("too large"))).toBe(true);
  });
});

describe("vector inspector", () => {
  it("reports norm and unit vector", () => {
    const r = inspect({ kind: "vector", data: [3, 4] });
    expect(propVal(r, "Geometry", "Norm ‖v‖")).toBe("5");
  });
});

describe("topology inspector", () => {
  it("computes χ and genus from the mesh, labeling confidence", () => {
    const r = inspect({ kind: "topology", surfaceId: "torus" });
    expect(propVal(r, "Invariants", "Euler χ = V − E + F")).toBe("0");
    const genusProp = r.sections.find((s) => s.title.startsWith("Invariants"))!.properties.find((p) => p.label.startsWith("Genus"))!;
    expect(genusProp.value).toBe("1");
    expect(genusProp.confidence).toBe("inferred"); // genus inferred, not exact
  });
});

describe("dynamical-system inspector", () => {
  // The classic linear center: dx/dt = y, dy/dt = -x (rotation), sole equilibrium at (0,0).
  const center = { kind: "dynamicalSystem" as const, vars: ["x", "y"], fieldSource: ["y", "-x"], systemKind: "continuous" as const };

  it("dispatches to the dynamical-system inspector", () => {
    expect(inspect(center).kind).toBe("dynamicalSystem");
  });

  it("Structure reports the state variables, kind and field equations", () => {
    const r = inspect(center);
    expect(propVal(r, "Structure", "State variables")).toBe("x, y");
    expect(propVal(r, "Structure", "Kind")).toBe("continuous");
    expect(propVal(r, "Structure", "dx/dt")).toBe("y");
    expect(propVal(r, "Structure", "dy/dt")).toContain("x"); // "-x" (printer may normalize the sign)
  });

  it("identifies a continuous 2-D system", () => {
    expect(inspect(center).identity).toContain("Continuous");
    expect(inspect(center).identity).toContain("ℝ^2");
  });

  it("Equilibria finds the origin (numerical candidate)", () => {
    const eq = inspect(center).sections.find((s) => s.title.startsWith("Equilibria"))!;
    expect(eq.properties.some((p) => p.value === "(0, 0)")).toBe(true);
    expect(eq.properties.every((p) => p.confidence === "numerical")).toBe(true);
  });

  it("Stability classifies the origin as a center", () => {
    const r = inspect(center);
    expect(propVal(r, "Stability", "Equilibrium 1")).toBe("center");
    expect(r.warnings.some((w) => w.includes("NUMERICAL CANDIDATES"))).toBe(true); // honest note surfaced
  });

  it("emits the new domain capabilities", () => {
    const caps = inspect(center).capabilities;
    expect(caps).toContain("vectorField");
    expect(caps).toContain("equilibria");
    expect(caps).toContain("stability");
  });

  it("handles a discrete map: xₙ₊₁ = 0.5·x → stable fixed point at 0", () => {
    const r = inspect({ kind: "dynamicalSystem", vars: ["x"], fieldSource: ["0.5*x"], systemKind: "discrete" });
    expect(propVal(r, "Structure", "Kind")).toBe("discrete");
    expect(propVal(r, "Structure", "x(n+1)")).toContain("x");
    expect(propVal(r, "Stability", "Equilibrium 1")).toBe("stable-node");
  });

  it("degrades gracefully on a malformed field (unknown symbol) — warning, no throw", () => {
    let r!: InspectionResult;
    expect(() => { r = inspect({ kind: "dynamicalSystem", vars: ["x"], fieldSource: ["y + 1"], systemKind: "continuous" }); }).not.toThrow();
    expect(r.identity).toBe("Invalid dynamical system");
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.sections).toEqual([]);
  });

  it("skips equilibria/stability past the dimension cap with a warning", () => {
    const vars = ["a", "b", "c", "d", "e", "f"];
    const r = inspect({ kind: "dynamicalSystem", vars, fieldSource: vars.map((v) => `-${v}`), systemKind: "continuous" });
    expect(r.sections.some((s) => s.title.startsWith("Equilibria"))).toBe(false);
    expect(r.capabilities).not.toContain("equilibria");
    expect(r.warnings.some((w) => w.includes("exceeds"))).toBe(true);
  });
});

describe("comparison", () => {
  it("topology: sphere vs torus cannot be homeomorphic (exact)", () => {
    const c = compare({ kind: "topology", surfaceId: "sphere" }, { kind: "topology", surfaceId: "torus" })!;
    expect(c.verdict).toContain("cannot be homeomorphic");
    expect(c.confidence).toBe("exact");
  });
  it("expression: x^2+2x+1 vs (x+1)^2 → numerically equivalent, NOT proven symbolic", () => {
    const c = compare({ kind: "expression", source: "x^2+2x+1" }, { kind: "expression", source: "(x+1)^2" })!;
    expect(c.verdict).toContain("Numerically equivalent");
    expect(c.confidence).toBe("estimated");
  });
  it("expression: x^2 vs x^3 not equivalent", () => {
    const c = compare({ kind: "expression", source: "x^2" }, { kind: "expression", source: "x^3" })!;
    expect(c.verdict).toContain("Not equivalent");
  });
});
