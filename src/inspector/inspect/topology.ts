import { classifySurface } from "../../topo/topology.ts";
import { SURFACE_BY_ID } from "../../topo/surfaces.ts";
import { type InspectionResult, type Capability, prop, section } from "../types.ts";

export function inspectTopology(surfaceId: string): InspectionResult {
  const surf = SURFACE_BY_ID[surfaceId];
  if (!surf) return { kind: "topology", identity: "Unknown surface", sections: [], relations: [], capabilities: [], warnings: [`No surface "${surfaceId}"`] };

  const inv = classifySurface(surfaceId);
  const caps: Capability[] = ["topologyInvariants", "compare"];
  const warnings: string[] = [
    "χ, V, E, F, components, orientability are computed exactly from the triangulated mesh (integer combinatorics; only vertex welding uses a tolerance).",
  ];
  if (inv.genus !== null) warnings.push("Genus is inferred from χ under the closed-orientable-surface assumption (classification theorem).");

  return {
    kind: "topology",
    identity: `Closed surface — ${surf.label}`,
    latex: `\\chi = V - E + F = ${inv.euler}`,
    sections: [
      section("Mesh (computed)", [
        prop("Vertices V", String(inv.V), "exact"),
        prop("Edges E", String(inv.E), "exact"),
        prop("Faces F", String(inv.F), "exact"),
        prop("Boundary edges", String(inv.boundaryEdges), "exact"),
      ]),
      section("Invariants (computed)", [
        prop("Euler χ = V − E + F", String(inv.euler), "exact"),
        prop("Connected components", String(inv.components), "exact"),
        prop("Closed manifold", inv.closedManifold ? "yes" : "no", "exact"),
        prop("Orientable", inv.orientable ? "yes" : "no", "exact"),
        prop("Genus g = (2 − χ)/2", inv.genus === null ? "undefined (assumptions unmet)" : String(inv.genus), inv.genus === null ? "notApplicable" : "inferred"),
      ]),
      section("Catalog metadata", [
        prop("Declared genus", String(surf.genus), "exact", { note: "label — verified against the computed value in tests" }),
      ]),
    ],
    relations: [],
    capabilities: caps,
    warnings,
  };
}
