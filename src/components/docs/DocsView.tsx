import { useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { SECTIONS, UI, type Block, type Lang } from "./content.ts";

function Math({ tex }: { tex: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: true, throwOnError: false, output: "htmlAndMathml" }),
    [tex],
  );
  return (
    <div
      className="katex-block mb-3 overflow-x-auto rounded bg-black/40 px-4 py-3 text-slate-100 ring-1 ring-white/5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function BlockView({ block, lang }: { block: Block; lang: Lang }) {
  switch (block.t) {
    case "h":
      return <h3 className="mt-5 mb-1.5 text-sm font-semibold text-cyan-200">{block[lang]}</h3>;
    case "p":
      return <p className="mb-2 text-sm leading-relaxed text-slate-300">{block[lang]}</p>;
    case "math":
      return <Math tex={block.text} />;
    case "code":
      return (
        <pre className="mb-3 overflow-x-auto rounded bg-black/40 px-3 py-2 font-mono text-[12px] leading-relaxed text-cyan-100 ring-1 ring-white/5">
          {block.text}
        </pre>
      );
    case "ul":
      return (
        <ul className="mb-3 ml-4 list-disc space-y-1 text-sm text-slate-300 marker:text-cyan-400/60">
          {block[lang].map((li, i) => <li key={i}>{li}</li>)}
        </ul>
      );
  }
}

export function DocsView() {
  const [lang, setLang] = useState<Lang>("en");

  const scrollTo = (id: string) => document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="flex min-h-0 flex-1">
      {/* Table of contents */}
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-white/5 bg-[#080b14] p-3">
        <div className="mb-3 flex gap-1">
          {(["en", "es"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium uppercase transition ${
                lang === l ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-slate-400 hover:bg-white/5"
              }`}
            >
              {l === "en" ? "English" : "Español"}
            </button>
          ))}
        </div>
        <nav className="space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="block w-full truncate rounded px-2 py-1 text-left text-xs text-slate-400 hover:bg-white/5 hover:text-cyan-200"
            >
              {s.title[lang]}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-6">
          <h1 className="text-2xl font-bold tracking-wide text-cyan-300">MATH·LAB — {UI.title[lang]}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">{UI.subtitle[lang]}</p>
          {SECTIONS.map((s) => (
            <section key={s.id} id={`doc-${s.id}`} className="mb-8 scroll-mt-4 border-t border-white/5 pt-5">
              <h2 className="mb-3 text-lg font-semibold text-slate-100">{s.title[lang]}</h2>
              {s.blocks.map((b, i) => <BlockView key={i} block={b} lang={lang} />)}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
