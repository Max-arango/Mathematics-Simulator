import { useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { inspect, compare } from "../../inspector/engine.ts";
import type { MathObject, Confidence, Property } from "../../inspector/types.ts";
import { SURFACES } from "../../topo/surfaces.ts";

const CONF_COLOR: Record<Confidence, string> = {
  exact: "bg-emerald-500/15 text-emerald-300",
  symbolic: "bg-cyan-500/15 text-cyan-300",
  numerical: "bg-sky-500/15 text-sky-300",
  estimated: "bg-amber-500/15 text-amber-300",
  inferred: "bg-violet-500/15 text-violet-300",
  heuristic: "bg-orange-500/15 text-orange-300",
  unsupported: "bg-red-500/15 text-red-300",
  notApplicable: "bg-slate-600/20 text-slate-400",
};

function Tex({ src, display = false }: { src: string; display?: boolean }) {
  const html = useMemo(() => katex.renderToString(src, { displayMode: display, throwOnError: false, output: "htmlAndMathml" }), [src, display]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function PropRow({ p }: { p: Property }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 py-1 last:border-0">
      <span className="shrink-0 text-xs text-slate-400">{p.label}</span>
      <span className="min-w-0 flex-1 text-right font-mono text-xs text-slate-100">
        {p.latex ? <Tex src={p.latex} /> : p.value}
        {p.note && <span className="ml-1 text-[10px] text-slate-500">({p.note})</span>}
      </span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${CONF_COLOR[p.confidence]}`}>{p.confidence}</span>
    </div>
  );
}

// The kinds this UI offers an input form for. A subset of MathObject["kind"]: newer domain
// kinds (e.g. dynamicalSystem) are inspectable through the engine but have no input panel yet.
type Kind = "expression" | "matrix" | "vector" | "topology";

function parseMatrix(text: string): number[][] {
  return text.trim().split("\n").map((row) => row.trim().split(/[\s,]+/).map(Number));
}
function parseVector(text: string): number[] {
  return text.trim().split(/[\s,]+/).map(Number);
}

export function InspectorView() {
  const [kind, setKind] = useState<Kind>("expression");
  const [exprSrc, setExprSrc] = useState("x^3 - 3x + 1");
  const [matText, setMatText] = useState("2 -1\n1 2");
  const [vecText, setVecText] = useState("3, 4, 12");
  const [surfId, setSurfId] = useState("torus");
  const [history, setHistory] = useState<MathObject[]>([]);
  const [cmpId, setCmpId] = useState("sphere");
  const [cmpExpr, setCmpExpr] = useState("(x-1)*(x^2-2x+1)");

  const obj: MathObject = useMemo(() => {
    switch (kind) {
      case "expression": return { kind: "expression", source: exprSrc };
      case "matrix": return { kind: "matrix", data: parseMatrix(matText) };
      case "vector": return { kind: "vector", data: parseVector(vecText) };
      case "topology": return { kind: "topology", surfaceId: surfId };
    }
  }, [kind, exprSrc, matText, vecText, surfId]);

  const result = useMemo(() => inspect(obj), [obj]);

  const comparison = useMemo(() => {
    if (kind === "topology") return compare(obj, { kind: "topology", surfaceId: cmpId });
    if (kind === "expression") return compare(obj, { kind: "expression", source: cmpExpr });
    return null;
  }, [obj, kind, cmpId, cmpExpr]);

  const inputCls = "w-full rounded bg-slate-800/80 px-2 py-1.5 font-mono text-sm text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400";

  const navigate = (target: MathObject) => {
    setHistory((h) => [...h, obj]);
    if (target.kind === "expression") { setKind("expression"); setExprSrc(target.source); }
    else if (target.kind === "matrix") { setKind("matrix"); setMatText(target.data.map((r) => r.join(" ")).join("\n")); }
    else if (target.kind === "vector") { setKind("vector"); setVecText(target.data.join(", ")); }
  };
  const back = () => setHistory((h) => {
    const prev = h.at(-1); if (!prev) return h;
    if (prev.kind === "expression") { setKind("expression"); setExprSrc(prev.source); }
    else if (prev.kind === "matrix") { setKind("matrix"); setMatText(prev.data.map((r) => r.join(" ")).join("\n")); }
    else if (prev.kind === "vector") { setKind("vector"); setVecText(prev.data.join(", ")); }
    else if (prev.kind === "topology") { setKind("topology"); setSurfId(prev.surfaceId); }
    return h.slice(0, -1);
  });

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left: object input */}
      <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/5 bg-[#080b14] p-3">
        <div>
          <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">Object</h2>
          <div className="grid grid-cols-4 gap-1">
            {(["expression", "matrix", "vector", "topology"] as Kind[]).map((k) => (
              <button key={k} onClick={() => setKind(k)}
                className={`rounded px-1 py-1 text-[11px] capitalize transition ${kind === k ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-slate-400 hover:bg-white/5"}`}>
                {k === "expression" ? "expr" : k}
              </button>
            ))}
          </div>
        </div>

        {kind === "expression" && <input className={inputCls} value={exprSrc} spellCheck={false} onChange={(e) => setExprSrc(e.target.value)} />}
        {kind === "matrix" && <textarea className={`${inputCls} h-24 resize-none`} value={matText} spellCheck={false} onChange={(e) => setMatText(e.target.value)} placeholder="rows: 1 2\n3 4" />}
        {kind === "vector" && <input className={inputCls} value={vecText} spellCheck={false} onChange={(e) => setVecText(e.target.value)} placeholder="3, 4, 12" />}
        {kind === "topology" && (
          <select className={inputCls} value={surfId} onChange={(e) => setSurfId(e.target.value)}>
            {SURFACES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}

        {/* Capabilities */}
        {result.capabilities.length > 0 && (
          <div>
            <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Capabilities</h3>
            <div className="flex flex-wrap gap-1">
              {result.capabilities.map((c) => <span key={c} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300">{c}</span>)}
            </div>
          </div>
        )}

        {/* Compare */}
        {(kind === "topology" || kind === "expression") && (
          <div>
            <h3 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Compare with</h3>
            {kind === "topology"
              ? <select className={inputCls} value={cmpId} onChange={(e) => setCmpId(e.target.value)}>{SURFACES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
              : <input className={inputCls} value={cmpExpr} spellCheck={false} onChange={(e) => setCmpExpr(e.target.value)} />}
            {comparison && (
              <div className="mt-1.5 rounded bg-black/40 p-2 text-[11px] text-slate-300">
                <div className="mb-1"><span className={`rounded px-1 ${CONF_COLOR[comparison.confidence]}`}>{comparison.confidence}</span> {comparison.verdict}</div>
                {comparison.rows.map((r) => (
                  <div key={r.label} className="flex justify-between font-mono text-[10px]">
                    <span className="text-slate-500">{r.label}</span>
                    <span className={r.same ? "text-emerald-300" : "text-red-300"}>{r.a} {r.same ? "=" : "≠"} {r.b}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {history.length > 0 && <button onClick={back} className="mt-auto rounded bg-white/5 px-2 py-1 text-xs text-slate-400 hover:text-cyan-200">← Back ({history.length})</button>}
      </aside>

      {/* Right: inspection result */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <div className="mb-1 text-lg font-semibold text-slate-100">{result.identity}</div>
          {result.latex && <div className="mb-4 rounded bg-black/30 px-4 py-2 text-cyan-100 ring-1 ring-white/5"><Tex src={result.latex} display /></div>}

          {result.sections.map((s) => (
            <section key={s.title} className="mb-4">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">{s.title}</h3>
              <div className="rounded bg-white/[0.02] px-3 py-1 ring-1 ring-white/5">
                {s.properties.map((p, i) => <PropRow key={i} p={p} />)}
              </div>
            </section>
          ))}

          {result.relations.length > 0 && (
            <section className="mb-4">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">Related objects</h3>
              <div className="flex flex-col gap-1">
                {result.relations.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded bg-white/[0.02] px-3 py-1.5 text-xs ring-1 ring-white/5">
                    <span className="min-w-0 text-slate-300">{r.label}{r.description && <span className="ml-2 font-mono text-[11px] text-slate-500">{r.description}</span>}</span>
                    {r.target && <button onClick={() => navigate(r.target!)} className="shrink-0 rounded bg-cyan-500/15 px-2 py-0.5 text-cyan-200 hover:bg-cyan-500/25">inspect →</button>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.warnings.length > 0 && (
            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-amber-300/70">Assumptions & limits</h3>
              <ul className="ml-4 list-disc space-y-0.5 text-[11px] text-slate-400 marker:text-amber-400/60">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
