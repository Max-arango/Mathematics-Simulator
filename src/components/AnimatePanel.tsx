import { useStore, type AnimMode } from "../store.ts";
import { FRACTAL_BY_ID } from "../fractals/registry.ts";

const MODES: AnimMode[] = ["loop", "pingpong", "once"];
const MODE_LABEL: Record<AnimMode, string> = { loop: "Loop", pingpong: "Ping-pong", once: "Once" };

export function AnimatePanel() {
  const activeId = useStore((s) => s.activeId);
  const anim = useStore((s) => s.anim);
  const setAnim = useStore((s) => s.setAnim);
  const animBind = useStore((s) => s.animBind);
  const animToggle = useStore((s) => s.animToggle);

  const params = FRACTAL_BY_ID[activeId].params;
  const num = "w-20 rounded bg-slate-800/80 px-1.5 py-0.5 text-right text-cyan-200 tabular-nums outline-none focus:ring-1 focus:ring-cyan-400";

  return (
    <div className="border-b border-white/5 px-4 py-3">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">Animate</h2>

      <select
        className="mb-2 w-full rounded bg-slate-800/80 px-2 py-1 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-cyan-400"
        value={anim.key ?? ""}
        onChange={(e) => (e.target.value ? animBind(e.target.value) : setAnim({ key: null, playing: false }))}
      >
        <option value="">— pick a parameter —</option>
        {params.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>

      {anim.key && (
        <>
          <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
            <span>Range</span>
            <div className="flex items-center gap-1">
              <input type="number" className={num} value={anim.from} onChange={(e) => setAnim({ from: Number(e.target.value) })} />
              <span className="text-slate-500">→</span>
              <input type="number" className={num} value={anim.to} onChange={(e) => setAnim({ to: Number(e.target.value) })} />
            </div>
          </div>

          <label className="mb-1 flex items-center justify-between text-xs text-slate-300">
            <span>Speed <span className="text-slate-500">{anim.speed.toFixed(2)}/s</span></span>
            <input type="range" className="w-32" min={0.02} max={2} step={0.01} value={anim.speed} onChange={(e) => setAnim({ speed: Number(e.target.value) })} />
          </label>

          <label className="mb-2 flex items-center justify-between text-xs text-slate-300">
            <span>Steps <span className="text-slate-500">{anim.steps === 0 ? "smooth" : anim.steps}</span></span>
            <input type="range" className="w-32" min={0} max={64} step={1} value={anim.steps} onChange={(e) => setAnim({ steps: Number(e.target.value) })} />
          </label>

          <div className="mb-2 grid grid-cols-3 gap-1">
            {MODES.map((m) => (
              <button
                key={m}
                onClick={() => setAnim({ mode: m })}
                className={`rounded px-1 py-1 text-[11px] transition ${
                  anim.mode === m ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-slate-400 hover:bg-white/5"
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={animToggle}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition ${
                anim.playing ? "bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/50" : "bg-cyan-500/15 text-cyan-200"
              }`}
            >
              {anim.playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <button onClick={() => setAnim({ phase: 0, dir: 1 })} className="rounded bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
              ↺
            </button>
          </div>
        </>
      )}
    </div>
  );
}
