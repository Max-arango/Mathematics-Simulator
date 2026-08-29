import { TopoSurface } from "./TopoSurface.tsx";
import { useTopo } from "../../topo/topoStore.ts";
import { SURFACES, SURFACE_BY_ID } from "../../topo/surfaces.ts";
import { homeomorphicSurfaces, classifySurface } from "../../topo/topology.ts";

export function TopoView() {
  const s = useTopo();
  const src = SURFACE_BY_ID[s.sourceId];
  const dst = SURFACE_BY_ID[s.targetId];
  const verdict = homeomorphicSurfaces(s.sourceId, s.targetId);
  const homeo = verdict.homeomorphic;
  const inv = classifySurface(s.sourceId);

  const sel = "w-full rounded bg-slate-800/80 px-2 py-1.5 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-cyan-400";

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-white/5 bg-[#080b14]">
        <Section title="Object">
          <label className="mb-1 block text-[11px] text-slate-400">shape</label>
          <select className={sel} value={s.sourceId} onChange={(e) => s.setSource(e.target.value)}>
            {SURFACES.map((x) => <option key={x.id} value={x.id}>{x.label} (genus {x.genus})</option>)}
          </select>
        </Section>

        <Section title="Isotopy visualization (morph →)">
          <div className="mb-2 flex flex-wrap gap-1">
            {[
              ["Mug ↔ Donut", "torus", "mug"],
              ["Cup ↔ Ball", "cup", "sphere"],
              ["Plate ↔ Bowl", "plate", "bowl"],
              ["CD ↔ Donut", "cd", "torus"],
            ].map(([label, a, b]) => (
              <button key={label} onClick={() => s.setPair(a, b)} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-cyan-200">{label}</button>
            ))}
          </div>
          <label className="mb-1 block text-[11px] text-slate-400">deform into</label>
          <select className={sel} value={s.targetId} onChange={(e) => s.setTarget(e.target.value)}>
            {SURFACES.map((x) => <option key={x.id} value={x.id}>{x.label} (genus {x.genus})</option>)}
          </select>

          <div className={`mt-2 rounded px-2 py-1.5 text-xs ${homeo ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30" : "bg-red-500/10 text-red-300 ring-1 ring-red-400/30"}`}>
            {homeo
              ? "✓ Homeomorphic — verified: same Euler characteristic χ (computed from the mesh), so by the classification theorem of closed surfaces one is a continuous deformation of the other."
              : "✗ Not homeomorphic — computed invariants differ (χ_a ≠ χ_b): no homeomorphism exists (would require tearing/gluing)."}
          </div>

          {homeo && (
            <>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
                <span>morph t</span>
                <span className="tabular-nums text-cyan-200">{s.t.toFixed(2)}</span>
              </div>
              <input type="range" className="w-full" min={0} max={1} step={0.01} value={s.t} onChange={(e) => s.setT(Number(e.target.value))} />
              <p className="mt-1 text-[10px] text-slate-600">The animation is a visual homotopy/isotopy — NOT the proof. The proof is the equality of the computed invariants below.</p>
              <div className="mt-1 flex items-center gap-2">
                <button onClick={s.togglePlay} className={`flex-1 rounded py-1.5 text-xs font-medium ${s.playing ? "bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/50" : "bg-cyan-500/15 text-cyan-200"}`}>
                  {s.playing ? "❚❚ Pause" : "▶ Morph"}
                </button>
                <input type="range" className="flex-1" min={0.05} max={1} step={0.05} value={s.speed} onChange={(e) => s.setSpeed(Number(e.target.value))} />
              </div>
            </>
          )}
        </Section>

        <Section title="Invariants (computed from mesh)">
          <table className="w-full text-xs">
            <tbody className="[&_td]:py-0.5 [&_td]:tabular-nums">
              <tr><td className="text-slate-400">V (vertices)</td><td className="text-right text-cyan-200">{inv.V}</td></tr>
              <tr><td className="text-slate-400">E (edges)</td><td className="text-right text-cyan-200">{inv.E}</td></tr>
              <tr><td className="text-slate-400">F (faces)</td><td className="text-right text-cyan-200">{inv.F}</td></tr>
              <tr><td className="text-slate-400">Euler χ = V − E + F</td><td className="text-right text-cyan-200">{inv.euler}</td></tr>
              <tr><td className="text-slate-400">genus g = (2 − χ)/2</td><td className="text-right text-cyan-200">{inv.genus ?? "—"}</td></tr>
              <tr><td className="text-slate-400">components</td><td className="text-right text-cyan-200">{inv.components}</td></tr>
              <tr><td className="text-slate-400">closed manifold</td><td className="text-right text-cyan-200">{inv.closedManifold ? "yes" : "no"}</td></tr>
            </tbody>
          </table>
          <p className="mt-1.5 text-[10px] text-slate-600">Homeomorphic ⇔ same χ (closed connected orientable surfaces).</p>
        </Section>

        <Section title="Grab & deform">
          <div className="mb-2 flex gap-1">
            {(["orbit", "deform"] as const).map((m) => (
              <button key={m} onClick={() => s.setMode(m)}
                className={`flex-1 rounded py-1.5 text-xs capitalize transition ${s.mode === m ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-slate-400 hover:bg-white/5"}`}>
                {m}
              </button>
            ))}
          </div>
          <p className="mb-2 text-[10px] text-slate-500">
            In <b>deform</b> mode, drag on the surface to pull/push a bump. Every deformation here is continuous — it never changes the genus.
          </p>
          <Slider label="Inflate" value={s.inflate} min={-0.5} max={0.8} step={0.02} onChange={s.setInflate} />
          <Slider label="Twist" value={s.twist} min={-2} max={2} step={0.05} onChange={s.setTwist} />
          <div className="mt-1 flex gap-2">
            <button onClick={s.randomDeform} className="flex-1 rounded bg-white/5 py-1.5 text-xs text-slate-300 hover:bg-white/10">🎲 Random pull</button>
            <button onClick={s.resetDeforms} className="flex-1 rounded bg-white/5 py-1.5 text-xs text-slate-300 hover:bg-white/10">Reset deforms</button>
          </div>
        </Section>

        <Section title="Motion & color">
          <div className="mb-2 flex items-center gap-2">
            <button onClick={s.toggleSpin} className={`flex-1 rounded py-1.5 text-xs font-medium ${s.spin ? "bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/50" : "bg-cyan-500/15 text-cyan-200"}`}>
              {s.spin ? "❚❚ Spinning" : "⟳ Spin in space"}
            </button>
            <input type="range" className="flex-1" min={0.1} max={2} step={0.1} value={s.spinSpeed} onChange={(e) => s.setSpinSpeed(Number(e.target.value))} />
          </div>
          <div className="mb-2 grid grid-cols-3 gap-1">
            {["Solid", "Normal", "Height"].map((m, i) => (
              <button key={m} onClick={() => s.setColorMode(i)} className={`rounded py-1 text-[11px] ${s.colorMode === i ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-slate-400 hover:bg-white/5"}`}>{m}</button>
            ))}
          </div>
          <button onClick={s.toggleWireframe} className={`w-full rounded py-1.5 text-xs ${s.wireframe ? "bg-cyan-500/15 text-cyan-200" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>Wireframe</button>
          <label className="mt-2 flex items-center justify-between text-xs text-slate-300">
            <span>resolution</span>
            <input type="range" className="w-40" min={12} max={80} step={4} value={s.res} onChange={(e) => s.setRes(Number(e.target.value))} />
          </label>
        </Section>
      </aside>

      <main className="relative min-w-0 flex-1">
        <TopoSurface />
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-3 py-1.5 font-mono text-[11px] text-slate-400">
          {src.label} {homeo && dst.id !== src.id ? `→ ${dst.label}` : ""} · genus {inv.genus ?? "—"} · χ = {inv.euler} · {s.mode} · drag {s.mode === "deform" ? "to pull" : "to rotate"}
        </div>
      </main>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[11px] text-slate-300">
        <span>{label}</span>
        <span className="tabular-nums text-cyan-200">{value.toFixed(2)}</span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/5 px-4 py-3">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">{title}</h2>
      {children}
    </div>
  );
}
