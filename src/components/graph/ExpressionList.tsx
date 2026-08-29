import { useState } from "react";
import { useGraph } from "../../graph/graphStore.ts";
import { resolveSlider, snap } from "../../graph/sliderConfig.ts";
import type { Scene, Slider } from "../../mathlab/graph/scene.ts";

export function ExpressionList({ scene }: { scene: Scene }) {
  const lines = useGraph((s) => s.lines);
  const update = useGraph((s) => s.updateLine);
  const remove = useGraph((s) => s.removeLine);
  const toggle = useGraph((s) => s.toggleLine);
  const add = useGraph((s) => s.addLine);
  const mode = useGraph((s) => s.mode);
  const setMode = useGraph((s) => s.setMode);
  const sliders = scene.sliders;

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-white/5 bg-[#080b14]">
      <div className="flex gap-1 border-b border-white/5 p-2">
        {(["2d", "3d"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded px-3 py-1 text-xs font-medium transition ${
              mode === m ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-slate-400 hover:bg-white/5"
            }`}
          >
            {m === "2d" ? "2D  y = f(x)" : "3D  z = f(x,y)"}
          </button>
        ))}
      </div>

      <div className="flex flex-col">
        {lines.map((l, i) => (
          <div key={l.id} className="flex items-center gap-2 border-b border-white/5 px-2 py-1.5">
            <button
              onClick={() => toggle(l.id)}
              title="Toggle"
              className="h-3.5 w-3.5 shrink-0 rounded-sm"
              style={{ background: l.visible ? l.color : "transparent", border: `1px solid ${l.color}` }}
            />
            <span className="w-5 shrink-0 text-right text-[10px] text-slate-600">{i + 1}</span>
            <input
              value={l.source}
              spellCheck={false}
              placeholder={mode === "3d" ? "x^2 - y^2" : "sin(x)"}
              onChange={(e) => update(l.id, e.target.value)}
              className={`min-w-0 flex-1 bg-transparent font-mono text-sm text-slate-100 outline-none placeholder:text-slate-700 ${
                scene.errors[l.id] ? "text-red-300" : ""
              }`}
            />
            <button onClick={() => remove(l.id)} className="shrink-0 text-slate-600 hover:text-red-300">×</button>
          </div>
        ))}
      </div>

      <button onClick={() => add()} className="border-b border-white/5 px-3 py-2 text-left text-xs text-cyan-300/80 hover:bg-white/5">
        + Add expression
      </button>

      {Object.entries(scene.errors).length > 0 && (
        <div className="px-3 py-2 text-[11px] text-red-300/80">
          {Object.values(scene.errors)[0]}
        </div>
      )}

      {sliders.length > 0 && (
        <div className="border-t border-white/5 px-3 py-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">Sliders</h3>
          {sliders.map((s) => (
            <SliderRow key={s.name} slider={s} env={scene.env} />
          ))}
        </div>
      )}
    </aside>
  );
}

const cfgInput = "w-full rounded bg-slate-800/80 px-1 py-0.5 text-center font-mono text-[11px] text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400";

function SliderRow({ slider, env }: { slider: Slider; env: Scene["env"] }) {
  const setSlider = useGraph((st) => st.setSlider);
  const config = useGraph((st) => st.sliderConfig[slider.name]);
  const setConfig = useGraph((st) => st.setSliderConfig);
  const anim = useGraph((st) => st.anim);
  const setAnim = useGraph((st) => st.setAnim);
  const toggleAnim = useGraph((st) => st.toggleAnim);
  const [open, setOpen] = useState(false);

  const { min, max, step } = resolveSlider(slider, config, env);
  const value = snap(slider.value, min, step);
  const playing = anim.playing && anim.name === slider.name;
  const cfg = config ?? { min: String(min), max: String(max), step: String(step) };

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 text-xs">
        <button
          onClick={() => toggleAnim(slider.name)}
          title={playing ? "Pause" : "Play"}
          className={`h-5 w-5 shrink-0 rounded text-[10px] ${playing ? "bg-fuchsia-500/25 text-fuchsia-200" : "bg-white/5 text-slate-400 hover:text-cyan-200"}`}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="font-mono text-slate-300">{slider.name}</span>
        <span className="ml-auto tabular-nums text-cyan-200">{Number(value.toFixed(4))}</span>
        <button onClick={() => setOpen((o) => !o)} title="Configure" className="text-slate-500 hover:text-cyan-200">⚙</button>
      </div>
      <input
        type="range"
        className="mt-1 w-full"
        min={min}
        max={max}
        step={step > 0 ? step : "any"}
        value={value}
        onChange={(e) => setSlider(slider.name, Number(e.target.value))}
      />
      {open && (
        <div className="mt-1 space-y-1 rounded bg-black/30 p-2">
          <div className="grid grid-cols-3 gap-1">
            <label className="text-[10px] text-slate-500">min<input className={cfgInput} value={cfg.min} onChange={(e) => setConfig(slider.name, { min: e.target.value })} /></label>
            <label className="text-[10px] text-slate-500">max<input className={cfgInput} value={cfg.max} onChange={(e) => setConfig(slider.name, { max: e.target.value })} /></label>
            <label className="text-[10px] text-slate-500">step<input className={cfgInput} value={cfg.step} onChange={(e) => setConfig(slider.name, { step: e.target.value })} /></label>
          </div>
          <p className="font-mono text-[10px] text-slate-600">
            {`{${fmtSet(min, max, step)}}`}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span>speed</span>
            <input type="range" className="flex-1" min={0.05} max={2} step={0.05} value={anim.speed} onChange={(e) => setAnim({ speed: Number(e.target.value) })} />
            <button
              onClick={() => setAnim({ mode: anim.mode === "loop" ? "pingpong" : "loop" })}
              className="rounded bg-white/5 px-1.5 py-0.5 hover:text-cyan-200"
            >
              {anim.mode === "loop" ? "↻ loop" : "⇄ ping"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Preview the discrete set a slider spans, e.g. "0, 2, 4, …, 10".
function fmtSet(min: number, max: number, step: number): string {
  if (!(step > 0) || (max - min) / step > 1e4) return `${round(min)} … ${round(max)}`;
  const n = Math.floor((max - min) / step);
  if (n <= 4) return Array.from({ length: n + 1 }, (_, i) => round(min + i * step)).join(", ");
  return `${round(min)}, ${round(min + step)}, ${round(min + 2 * step)}, …, ${round(min + n * step)}`;
}
const round = (v: number) => Number(v.toPrecision(6));
