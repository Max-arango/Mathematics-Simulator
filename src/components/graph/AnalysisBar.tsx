import { useMemo } from "react";
import { useGraph, type AnalysisTool } from "../../graph/graphStore.ts";
import { compile1 } from "../../mathlab/core/eval.ts";
import { derivative } from "../../mathlab/calculus/derivative.ts";
import { print } from "../../mathlab/core/print.ts";
import { simpson } from "../../mathlab/analysis/integrate.ts";
import type { Scene } from "../../mathlab/graph/scene.ts";

const TOOLS: { id: AnalysisTool; label: string }[] = [
  { id: "locate", label: "Locate" },
  { id: "derivative", label: "Derivative" },
  { id: "integral", label: "Integral" },
];

const num = "w-20 rounded bg-slate-800/80 px-1.5 py-0.5 text-right font-mono text-cyan-100 tabular-nums outline-none focus:ring-1 focus:ring-cyan-400";

export function AnalysisBar({ scene }: { scene: Scene }) {
  const tool = useGraph((s) => s.tool);
  const setTool = useGraph((s) => s.setTool);
  const a = useGraph((s) => s.a);
  const b = useGraph((s) => s.b);
  const setA = useGraph((s) => s.setA);
  const setB = useGraph((s) => s.setB);

  const body = scene.plots[0]?.body ?? null;

  const readout = useMemo(() => {
    if (!body) return null;
    try {
      const f = compile1(body, "x", scene.env);
      if (tool === "integral") {
        return { kind: "integral" as const, value: simpson(f, a, b) };
      }
      const dBody = derivative(body, "x");
      const df = compile1(dBody, "x", scene.env);
      return { kind: "point" as const, fa: f(a), slope: df(a), dExpr: print(dBody) };
    } catch {
      return null;
    }
  }, [body, scene.env, tool, a, b]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-[#080b14] px-3 py-1.5 text-xs">
      <div className="flex gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`rounded px-2.5 py-1 transition ${
              tool === t.id ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-slate-400 hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tool === "integral" ? (
        <>
          <label className="flex items-center gap-1 text-slate-400">
            a <input type="number" step={0.1} className={num} value={round(a)} onChange={(e) => setA(Number(e.target.value))} />
          </label>
          <label className="flex items-center gap-1 text-slate-400">
            b <input type="number" step={0.1} className={num} value={round(b)} onChange={(e) => setB(Number(e.target.value))} />
          </label>
          <span className="font-mono text-slate-300">
            ∫<sub>a</sub><sup>b</sup> f dx ={" "}
            <span className="text-cyan-300">{readout?.kind === "integral" ? fmt(readout.value) : "—"}</span>
          </span>
        </>
      ) : (
        <>
          <label className="flex items-center gap-1 text-slate-400">
            x = <input type="number" step={0.1} className={num} value={round(a)} onChange={(e) => setA(Number(e.target.value))} />
          </label>
          {readout?.kind === "point" && (
            <span className="flex flex-wrap items-center gap-3 font-mono text-slate-300">
              <span>f(x) = <span className="text-cyan-300">{fmt(readout.fa)}</span></span>
              <span>f'(x) = <span className="text-emerald-300">{fmt(readout.slope)}</span></span>
              {tool === "derivative" && (
                <span className="text-slate-500">f'(x) = {readout.dExpr}</span>
              )}
            </span>
          )}
        </>
      )}

      <span className="ml-auto text-[11px] text-slate-600">
        {tool === "integral" ? "drag the a / b bars" : "drag the point on the x-axis"} · first curve
      </span>
    </div>
  );
}

const round = (v: number) => Number(v.toFixed(4));
function fmt(v: number): string {
  if (!Number.isFinite(v)) return "undefined";
  return String(Number(v.toFixed(5)));
}
