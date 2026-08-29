import { useEffect, useState } from "react";
import { BlochSphere } from "./BlochSphere.tsx";
import { ProbabilityBars } from "./ProbabilityBars.tsx";
import { useBloch } from "../../bloch/blochStore.ts";
import { angles, blochVector, ampString, pulseAxisAngle, type State } from "../../bloch/qubit.ts";

const GATE_ROWS = [
  ["X", "Y", "Z", "H"],
  ["S", "Sdg", "T", "Tdg"],
];
const LABEL: Record<string, string> = { X: "X", Y: "Y", Z: "Z", H: "H", S: "S", Sdg: "S†", T: "T", Tdg: "T†" };

const R2 = 1 / Math.SQRT2;
const PRESETS: { name: string; s: State }[] = [
  { name: "|0⟩", s: [{ re: 1, im: 0 }, { re: 0, im: 0 }] },
  { name: "|1⟩", s: [{ re: 0, im: 0 }, { re: 1, im: 0 }] },
  { name: "|+⟩", s: [{ re: R2, im: 0 }, { re: R2, im: 0 }] },
  { name: "|−⟩", s: [{ re: R2, im: 0 }, { re: -R2, im: 0 }] },
  { name: "|i⟩", s: [{ re: R2, im: 0 }, { re: 0, im: R2 }] },
  { name: "|−i⟩", s: [{ re: R2, im: 0 }, { re: 0, im: -R2 }] },
];

const gateBtn = "rounded bg-cyan-500/15 px-0 py-2 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-400/30 hover:bg-cyan-500/30 transition";

export function BlochView() {
  const state = useBloch((s) => s.state);
  const gate = useBloch((s) => s.gate);
  const rotate = useBloch((s) => s.rotate);
  const reset = useBloch((s) => s.reset);
  const undo = useBloch((s) => s.undo);
  const setState = useBloch((s) => s.setState);
  const applyAxis = useBloch((s) => s.applyAxis);
  const setPreview = useBloch((s) => s.setPreview);
  const showTrail = useBloch((s) => s.showTrail);
  const toggleTrail = useBloch((s) => s.toggleTrail);
  const log = useBloch((s) => s.log);
  const [angle, setAngle] = useState(90);

  // Pulse parameters: Rabi Ω, detuning Δ, phase φ (deg), duration t.
  const [pulse, setPulse] = useState({ rabi: 1, detuning: 0, phase: 0, dur: Math.PI });
  const { axis, angle: pAngle } = pulseAxisAngle(pulse.rabi, pulse.detuning, (pulse.phase * Math.PI) / 180, pulse.dur);
  // Live preview on the sphere whenever the pulse changes.
  useEffect(() => { setPreview({ axis, angle: pAngle }); }, [axis[0], axis[1], axis[2], pAngle, setPreview]);
  const setP = (patch: Partial<typeof pulse>) => setPulse((p) => ({ ...p, ...patch }));
  const applyPulse = (overrideAngle?: number) =>
    applyAxis(axis, overrideAngle ?? pAngle, `pulse Ω${pulse.rabi} Δ${pulse.detuning} φ${pulse.phase}° θ${((overrideAngle ?? pAngle) * 180 / Math.PI).toFixed(0)}°`);

  const [x, y, z] = blochVector(state);
  const { theta, phi } = angles(state);
  const deg = (r: number) => `${((r * 180) / Math.PI).toFixed(1)}°`;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-white/5 bg-[#080b14]">
        <Section title="Quantum gates">
          <div className="grid grid-cols-4 gap-1.5">
            {GATE_ROWS.flat().map((g) => (
              <button key={g} className={gateBtn} onClick={() => gate(g)}>{LABEL[g]}</button>
            ))}
          </div>
        </Section>

        <Section title="Rotations">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
            <span>angle</span>
            <div className="flex items-center gap-0.5">
              <input
                type="number"
                step={5}
                value={angle}
                onChange={(e) => setAngle(Math.max(-360, Math.min(360, Number(e.target.value) || 0)))}
                className="w-16 rounded bg-slate-800/80 px-1 py-0.5 text-right font-mono text-[11px] text-cyan-200 tabular-nums outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <span className="text-slate-500">°</span>
            </div>
          </div>
          <input type="range" className="mb-2 w-full" min={-360} max={360} step={5} value={angle} onChange={(e) => setAngle(Number(e.target.value))} />
          <div className="grid grid-cols-3 gap-1.5">
            {(["x", "y", "z"] as const).map((ax) => (
              <button key={ax} className="rounded bg-white/5 py-1.5 text-sm text-slate-200 hover:bg-white/10" onClick={() => rotate(ax, angle)}>
                R{ax}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Pulse (drive)">
          <PulseSlider label="Ω Rabi" value={pulse.rabi} min={0} max={2} step={0.05} onChange={(v) => setP({ rabi: v })} />
          <PulseSlider label="Δ detuning" value={pulse.detuning} min={-2} max={2} step={0.05} onChange={(v) => setP({ detuning: v })} />
          <PulseSlider label="φ phase" value={pulse.phase} min={0} max={360} step={5} unit="°" onChange={(v) => setP({ phase: v })} />
          <PulseSlider label="t duration" value={pulse.dur} min={0} max={2 * Math.PI} step={0.05} onChange={(v) => setP({ dur: v })} />
          <p className="mb-2 font-mono text-[10px] text-cyan-300/80">
            → rotate {((pAngle * 180) / Math.PI).toFixed(0)}° about ({axis.map((a) => a.toFixed(2)).join(", ")})
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            <button className="rounded bg-cyan-500/20 py-1.5 text-xs font-medium text-cyan-100 ring-1 ring-cyan-400/40 hover:bg-cyan-500/30" onClick={() => applyPulse()}>Apply</button>
            <button className="rounded bg-white/5 py-1.5 text-xs text-slate-200 hover:bg-white/10" onClick={() => applyPulse(Math.PI)}>π pulse</button>
            <button className="rounded bg-white/5 py-1.5 text-xs text-slate-200 hover:bg-white/10" onClick={() => applyPulse(Math.PI / 2)}>π/2</button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-600">cyan axis + ghost arc = live preview</p>
        </Section>

        <Section title="Set state">
          <div className="grid grid-cols-3 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.name} className="rounded bg-white/5 py-1.5 text-xs text-slate-200 hover:bg-white/10" onClick={() => setState(p.s, `set ${p.name}`)}>
                {p.name}
              </button>
            ))}
          </div>
        </Section>

        <Section title="History">
          <div className="flex gap-2">
            <button className="flex-1 rounded bg-white/5 py-1.5 text-xs text-slate-300 hover:bg-white/10" onClick={undo}>↶ Undo</button>
            <button className="flex-1 rounded bg-white/5 py-1.5 text-xs text-slate-300 hover:bg-white/10" onClick={reset}>⟲ Reset |0⟩</button>
          </div>
          <button
            onClick={toggleTrail}
            className={`mt-2 w-full rounded py-1.5 text-xs transition ${showTrail ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30" : "bg-white/5 text-slate-500 hover:text-slate-300"}`}
          >
            {showTrail ? "✓ Trail visible" : "Trail hidden"}
          </button>
          <div className="mt-2 max-h-24 overflow-y-auto font-mono text-[11px] text-slate-500">
            {log.length ? log.slice(-12).map((l, i) => <div key={i}>{l}</div>) : <span>no operations</span>}
          </div>
        </Section>
      </aside>

      <main className="relative min-w-0 flex-1">
        <BlochSphere />
        <div className="absolute left-2 top-2">
          <ProbabilityBars />
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-3 py-2 font-mono text-[11px] text-slate-300">
          <div>|ψ⟩ = <span className="text-cyan-300">{ampString(state[0])}</span> |0⟩ + <span className="text-cyan-300">{ampString(state[1])}</span> |1⟩</div>
          <div className="mt-1 text-slate-400">θ = {deg(theta)} &nbsp; φ = {deg(phi)}</div>
          <div className="text-slate-400">Bloch = ({x.toFixed(3)}, {y.toFixed(3)}, {z.toFixed(3)})</div>
        </div>
        <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-slate-500">
          drag rotate · wheel zoom
        </div>
      </main>
    </div>
  );
}

function PulseSlider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  const clamp = (v: number) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min);
  return (
    <div className="mb-1.5">
      <div className="mb-0.5 flex items-center justify-between text-[11px] text-slate-300">
        <span>{label}</span>
        <div className="flex items-center gap-0.5">
          <input
            type="number"
            step={step}
            value={Number(value.toFixed(unit === "°" ? 0 : 3))}
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
            className="w-16 rounded bg-slate-800/80 px-1 py-0.5 text-right font-mono text-[11px] text-cyan-200 tabular-nums outline-none focus:ring-1 focus:ring-cyan-400"
          />
          {unit && <span className="text-slate-500">{unit}</span>}
        </div>
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
