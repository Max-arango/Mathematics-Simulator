import { useBloch } from "../../bloch/blochStore.ts";
import { probabilities } from "../../bloch/qubit.ts";

function Bar({ label, p, color }: { label: string; p: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-slate-300">{label}</span>
      <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-white/5">
        <div className="h-full rounded transition-[width] duration-200" style={{ width: `${p * 100}%`, background: color }} />
      </div>
      <span className="w-11 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-200">{(p * 100).toFixed(1)}%</span>
    </div>
  );
}

export function ProbabilityBars() {
  const state = useBloch((s) => s.state);
  const p = probabilities(state);

  return (
    <div className="w-64 rounded-lg bg-black/70 p-3 backdrop-blur-sm ring-1 ring-white/10">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">Measurement P</h3>

      <div className="mb-2">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Z basis (computational)</div>
        <div className="space-y-1">
          <Bar label="|0⟩" p={p.z0} color="#809eff" />
          <Bar label="|1⟩" p={p.z1} color="#5566cc" />
        </div>
      </div>

      <div className="mb-2">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">X basis</div>
        <div className="space-y-1">
          <Bar label="|+⟩" p={p.xPlus} color="#f2a6a6" />
          <Bar label="|−⟩" p={p.xMinus} color="#c46b6b" />
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Y basis</div>
        <div className="space-y-1">
          <Bar label="|i⟩" p={p.yPlus} color="#a6e8b8" />
          <Bar label="|−i⟩" p={p.yMinus} color="#6bbd85" />
        </div>
      </div>
    </div>
  );
}
