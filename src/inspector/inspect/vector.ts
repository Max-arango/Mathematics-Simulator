import * as V from "../../mathlab/linear/vector.ts";
import { type InspectionResult, prop, section } from "../types.ts";

export function inspectVector(data: number[]): InspectionResult {
  const n = data.length;
  const norm = V.norm(data);
  const sections = [
    section("Components", [
      prop("Dimension", `ℝ^${n}`, "exact"),
      prop("Components", `(${data.map(round).join(", ")})`, "exact"),
    ]),
    section("Geometry", [
      prop("Norm ‖v‖", String(round(norm)), "numerical", { latex: `\\lVert v\\rVert = ${round(norm)}` }),
      prop("Unit vector", norm > 1e-12 ? `(${V.normalize(data).map(round).join(", ")})` : "undefined (zero vector)", norm > 1e-12 ? "numerical" : "notApplicable"),
      ...(n === 3 ? [] : []),
    ]),
  ];
  const warnings = norm < 1e-12 ? ["Zero vector: no direction / unit vector."] : [];
  return {
    kind: "vector",
    identity: `Vector in ℝ^${n}`,
    latex: `v = (${data.map(round).join(",\\ ")})`,
    sections,
    relations: norm > 1e-12 ? [{ label: "Normalized v̂", target: { kind: "vector", data: V.normalize(data) } }] : [],
    capabilities: [],
    warnings,
  };
}

const round = (v: number) => Number(v.toPrecision(6));
