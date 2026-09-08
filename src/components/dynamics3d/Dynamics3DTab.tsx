// Dynamics 3D tab — model selector over the two 3D dynamics models:
//   • Vector field  x′ = F(x)   (mathematical phase-space flow)   → VectorField3DView
//   • Newtonian gravity (N-body / softened Plummer)               → Dynamics3DView
// The two models are deliberately independent (spec: "do not mix vector-field
// semantics with celestial-body rendering"). This wrapper just switches between them.
import { useState } from "react";
import { VectorField3DView } from "./VectorField3DView.tsx";
import { RelativityView } from "./RelativityView.tsx";
import { Dynamics3DView } from "./Dynamics3DView.tsx";

type Model = "vectorfield" | "gravity" | "relativity";

const MODELS: { id: Model; label: string; hint: string }[] = [
  { id: "vectorfield", label: "Vector field  x′ = F(x)", hint: "Define dx/dt, dy/dt, dz/dt — Lorenz, Rössler, …" },
  { id: "gravity", label: "Newtonian gravity", hint: "N-body / softened Plummer, bodies & orbits" },
  { id: "relativity", label: "General Relativity", hint: "Geodesics of Schwarzschild / Minkowski metrics" },
];

export default function Dynamics3DTab() {
  const [model, setModel] = useState<Model>("vectorfield");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 bg-[#070a12] px-3 py-1.5">
        <span className="mr-1 text-[11px] font-semibold tracking-widest text-slate-500">MODEL</span>
        {MODELS.map((m) => (
          <button
            key={m.id}
            onClick={() => setModel(m.id)}
            title={m.hint}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              model === m.id ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-slate-400 hover:bg-white/5"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {model === "vectorfield" ? <VectorField3DView /> : model === "relativity" ? <RelativityView /> : <Dynamics3DView />}
    </div>
  );
}
