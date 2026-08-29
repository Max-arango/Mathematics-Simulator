import { useMemo, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useNotebook } from "../../experiment/notebookStore.ts";
import { runAll, type CellOutput } from "../../experiment/engine.ts";
import { serialize, deserialize } from "../../experiment/serialize.ts";
import { EXAMPLES } from "../../experiment/examples.ts";
import type { Cell } from "../../experiment/types.ts";

function tex(src: string, display = false): string {
  return katex.renderToString(src, { displayMode: display, throwOnError: false, output: "htmlAndMathml" });
}
function Markdown({ src }: { src: string }) {
  const html = useMemo(() => src.split("\n").map((line) => {
    const inline = (t: string) => t.replace(/\$([^$]+)\$/g, (_, m) => tex(m));
    if (line.startsWith("# ")) return `<h3 class="text-base font-semibold text-slate-100">${inline(line.slice(2))}</h3>`;
    if (line.startsWith("## ")) return `<h4 class="text-sm font-semibold text-cyan-200">${inline(line.slice(3))}</h4>`;
    if (!line.trim()) return "<div class='h-2'></div>";
    return `<p class="text-sm text-slate-300">${inline(line)}</p>`;
  }).join(""), [src]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function Output({ o }: { o: CellOutput }) {
  if (o.kind === "none") return null;
  if (o.kind === "error") return <div className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">⚠ {o.message}</div>;
  if (o.kind === "parameter") return <div className="text-xs text-slate-400">value = <span className="text-cyan-300">{o.value}</span></div>;
  if (o.kind === "expression")
    return <div className="text-xs text-slate-400">resolved: <span className="font-mono text-slate-200">{o.printed}</span> · <span className="text-slate-500">{o.note}</span></div>;
  // analysis
  const r = o.result;
  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-300">{r.identity}</div>
      {r.sections.slice(0, 3).map((s) => (
        <div key={s.title} className="rounded bg-white/[0.02] px-2 py-1 ring-1 ring-white/5">
          <div className="text-[10px] uppercase tracking-wide text-cyan-300/60">{s.title}</div>
          {s.properties.slice(0, 4).map((p, i) => (
            <div key={i} className="flex justify-between gap-2 text-[11px]">
              <span className="text-slate-400">{p.label}</span>
              <span className="text-right font-mono text-slate-200">{p.latex ? <span dangerouslySetInnerHTML={{ __html: tex(p.latex) }} /> : p.value}
                <span className={`ml-1 text-[9px] ${p.confidence === "exact" || p.confidence === "symbolic" ? "text-emerald-400/70" : "text-amber-400/70"}`}>{p.confidence}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const input = "rounded bg-slate-800/80 px-2 py-1 font-mono text-sm text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400";

function CellEditor({ cell, out }: { cell: Cell; out: CellOutput }) {
  const { updateCell, deleteCell, moveCell, duplicateCell } = useNotebook();
  return (
    <div className="rounded-lg border border-white/5 bg-[#0a0e18]">
      <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1">
        <span className="mr-auto text-[10px] uppercase tracking-widest text-slate-500">{cell.kind}</span>
        <button onClick={() => moveCell(cell.id, -1)} className="px-1 text-slate-500 hover:text-cyan-300" title="Up">↑</button>
        <button onClick={() => moveCell(cell.id, 1)} className="px-1 text-slate-500 hover:text-cyan-300" title="Down">↓</button>
        <button onClick={() => duplicateCell(cell.id)} className="px-1 text-slate-500 hover:text-cyan-300" title="Duplicate">⧉</button>
        <button onClick={() => deleteCell(cell.id)} className="px-1 text-slate-500 hover:text-red-300" title="Delete">×</button>
      </div>
      <div className="space-y-2 p-2">
        {cell.kind === "markdown" && (
          <>
            <textarea className={`${input} h-16 w-full resize-none`} value={cell.source} onChange={(e) => updateCell(cell.id, { source: e.target.value }, `md-${cell.id}`)} />
            <Markdown src={cell.source} />
          </>
        )}
        {cell.kind === "expression" && (
          <>
            <div className="flex items-center gap-2">
              <input className={`${input} w-16`} value={cell.name} onChange={(e) => updateCell(cell.id, { name: e.target.value })} />
              <span className="text-slate-500">=</span>
              <input className={`${input} flex-1`} value={cell.source} spellCheck={false} onChange={(e) => updateCell(cell.id, { source: e.target.value }, `ex-${cell.id}`)} />
            </div>
            <Output o={out} />
          </>
        )}
        {cell.kind === "parameter" && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <input className={`${input} w-16`} value={cell.name} onChange={(e) => updateCell(cell.id, { name: e.target.value })} />
              <span className="text-slate-500">=</span>
              <span className="w-16 text-right font-mono text-cyan-200">{cell.value}</span>
              <input type="range" className="flex-1" min={cell.min} max={cell.max} step={cell.step}
                value={cell.value} onChange={(e) => updateCell(cell.id, { value: Number(e.target.value) }, `pv-${cell.id}`)} />
            </div>
            <div className="flex gap-2 text-[10px] text-slate-500">
              min <input type="number" className={`${input} w-16`} value={cell.min} onChange={(e) => updateCell(cell.id, { min: Number(e.target.value) })} />
              max <input type="number" className={`${input} w-16`} value={cell.max} onChange={(e) => updateCell(cell.id, { max: Number(e.target.value) })} />
              step <input type="number" className={`${input} w-16`} value={cell.step} onChange={(e) => updateCell(cell.id, { step: Number(e.target.value) })} />
            </div>
          </>
        )}
        {cell.kind === "analysis" && (
          <>
            <div className="flex items-center gap-2 text-sm text-slate-400">inspect <input className={`${input} w-24`} value={cell.targetName} onChange={(e) => updateCell(cell.id, { targetName: e.target.value })} /></div>
            <Output o={out} />
          </>
        )}
      </div>
    </div>
  );
}

export function NotebookView() {
  const s = useNotebook();
  const fileRef = useRef<HTMLInputElement>(null);
  const outputs = useMemo(() => runAll(s.exp), [s.exp]);

  const exportFile = () => {
    const blob = new Blob([serialize(s.exp)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${s.exp.metadata.title.replace(/\s+/g, "-").toLowerCase()}.mathsim.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const importFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    f.text().then((t) => { const r = deserialize(t); if (r.ok && r.experiment) s.load(r.experiment); else alert("Invalid experiment:\n" + r.errors.join("\n")); });
    e.target.value = "";
  };

  const btn = "rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-1 border-b border-white/5 bg-[#080b14] px-3 py-1.5">
        <input className="mr-2 rounded bg-transparent px-1 text-sm font-semibold text-slate-100 outline-none focus:bg-slate-800/60" value={s.exp.metadata.title} onChange={(e) => s.setTitle(e.target.value)} />
        <button className={btn} onClick={() => s.addCell("markdown")}>+ Text</button>
        <button className={btn} onClick={() => s.addCell("parameter")}>+ Param</button>
        <button className={btn} onClick={() => s.addCell("expression")}>+ Expr</button>
        <button className={btn} onClick={() => s.addCell("analysis")}>+ Analysis</button>
        <span className="mx-1 text-slate-700">|</span>
        <button className={btn} onClick={s.undo} disabled={!s.undoStack.length}>↶ Undo</button>
        <button className={btn} onClick={s.redo} disabled={!s.redoStack.length}>↷ Redo</button>
        <button className={btn} onClick={() => s.snapshot(`snap ${s.snapshots.length + 1}`)}>⎘ Snapshot</button>
        <span className="mx-1 text-slate-700">|</span>
        <select className={`${btn} bg-slate-800/60`} value="" onChange={(e) => e.target.value && s.loadExample(e.target.value)}>
          <option value="">Examples…</option>
          {EXAMPLES.map((ex) => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
        </select>
        <button className={btn} onClick={exportFile}>⭳ Export</button>
        <button className={btn} onClick={() => fileRef.current?.click()}>⭱ Import</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importFile} />
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-3 px-6 py-4">
            {s.exp.metadata.description && <p className="text-xs text-slate-500">{s.exp.metadata.description}</p>}
            {s.exp.cells.map((c) => <CellEditor key={c.id} cell={c} out={outputs[c.id]} />)}
            {!s.exp.cells.length && <div className="text-sm text-slate-500">Empty notebook — add a cell or load an example.</div>}
          </div>
        </main>
        {s.snapshots.length > 0 && (
          <aside className="w-48 shrink-0 overflow-y-auto border-l border-white/5 bg-[#080b14] p-2">
            <h3 className="mb-1 text-[10px] uppercase tracking-widest text-cyan-300/70">Snapshots</h3>
            {s.snapshots.map((snap, i) => (
              <button key={i} onClick={() => s.restoreSnapshot(i)} className="block w-full rounded px-2 py-1 text-left text-xs text-slate-400 hover:bg-white/5 hover:text-cyan-200">{snap.label}</button>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}
