import { useStore, PALETTES, FRACTALS } from "../store.ts";
import { FRACTAL_BY_ID } from "../fractals/registry.ts";
import type { ParamDef } from "../fractals/types.ts";
import { AnimatePanel } from "./AnimatePanel.tsx";
import { ExpressionPanel } from "./ExpressionPanel.tsx";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/5 px-4 py-3">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">{title}</h2>
      {children}
    </div>
  );
}

function ParamControl({ def }: { def: ParamDef }) {
  const value = useStore((s) => s.params[def.key] ?? def.default);
  const setParam = useStore((s) => s.setParam);
  const decimals = def.step < 1 ? Math.min(4, `${def.step}`.split(".")[1]?.length ?? 2) : 0;

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-300">{def.label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-20 rounded bg-slate-800/80 px-1.5 py-0.5 text-right text-cyan-200 tabular-nums outline-none focus:ring-1 focus:ring-cyan-400"
            value={value}
            min={def.min}
            max={def.max}
            step={def.step}
            onChange={(e) => setParam(def.key, Number(e.target.value))}
          />
          <button
            title="Reset"
            className="text-slate-500 hover:text-cyan-300"
            onClick={() => setParam(def.key, def.default)}
          >
            ↺
          </button>
        </div>
      </div>
      <input
        type="range"
        className="w-full"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => setParam(def.key, Number(e.target.value))}
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-slate-600">
        <span>{def.min}</span>
        <span className="tabular-nums text-slate-400">{value.toFixed(decimals)}</span>
        <span>{def.max}</span>
      </div>
    </div>
  );
}

export function Sidebar() {
  const activeId = useStore((s) => s.activeId);
  const setActive = useStore((s) => s.setActive);
  const resetParams = useStore((s) => s.resetParams);
  const pickMode = useStore((s) => s.pickMode);
  const setPickMode = useStore((s) => s.setPickMode);
  const palette = useStore((s) => s.palette);
  const colorScale = useStore((s) => s.colorScale);
  const colorOffset = useStore((s) => s.colorOffset);
  const invert = useStore((s) => s.invert);
  const setColor = useStore((s) => s.setColor);

  const active = FRACTAL_BY_ID[activeId];

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-white/5 bg-[#080b14]">
      <Section title="Fractal">
        <div className="grid gap-1">
          {FRACTALS.map((f) => (
            <button
              key={f.id}
              onClick={() => setActive(f.id)}
              className={`rounded px-3 py-1.5 text-left text-sm transition ${
                f.id === activeId
                  ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
        {!active.usesJuliaC && (
          <button
            onClick={() => setPickMode(!pickMode)}
            className={`mt-2 w-full rounded px-3 py-1.5 text-xs transition ${
              pickMode ? "bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/50" : "bg-white/5 text-slate-400 hover:text-slate-200"
            }`}
          >
            {pickMode ? "Click plane to spawn Julia…" : "→ Pick Julia from a point"}
          </button>
        )}
      </Section>

      {active.custom && <ExpressionPanel />}

      <Section title="Parameters">
        {active.params.map((p) => (
          <ParamControl key={p.key} def={p} />
        ))}
        <button onClick={resetParams} className="mt-1 text-xs text-slate-500 hover:text-cyan-300">
          Reset all parameters
        </button>
      </Section>

      <AnimatePanel />

      <Section title="Color">
        <div className="mb-2 grid grid-cols-3 gap-1">
          {PALETTES.map((name, i) => (
            <button
              key={name}
              onClick={() => setColor({ palette: i })}
              className={`rounded px-1 py-1 text-[11px] transition ${
                palette === i ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-slate-400 hover:bg-white/5"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="mb-1 flex items-center justify-between text-xs text-slate-300">
          <span>Density</span>
          <input
            type="range"
            className="w-36"
            min={0.1}
            max={5}
            step={0.05}
            value={colorScale}
            onChange={(e) => setColor({ colorScale: Number(e.target.value) })}
          />
        </label>
        <label className="mb-1 flex items-center justify-between text-xs text-slate-300">
          <span>Offset</span>
          <input
            type="range"
            className="w-36"
            min={0}
            max={1}
            step={0.01}
            value={colorOffset}
            onChange={(e) => setColor({ colorOffset: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={invert} onChange={(e) => setColor({ invert: e.target.checked })} />
          Invert colors
        </label>
      </Section>
    </aside>
  );
}
