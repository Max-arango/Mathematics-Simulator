import { useMemo } from "react";
import { useStore } from "../store.ts";
import { FRACTAL_BY_ID } from "../fractals/registry.ts";
import { parse } from "../mathlab/core/parser.ts";
import { derivative } from "../mathlab/calculus/derivative.ts";
import { print } from "../mathlab/core/print.ts";

const EXAMPLES_ZC = ["z^2 + c", "z^3 + c", "z^2 + conjugate(c)", "sin(z) + c", "exp(z) + c", "z^p + c"];
const EXAMPLES_Z = ["sin(z)", "z^3 - 1", "1/z", "exp(z)", "(z^2 - 1)/(z^2 + 1)", "z^p"];

/** Symbolic ∂/∂z from the shared math core (same parser the GPU compiler uses). */
function useDerivative(source: string): { text: string; error: string | null } {
  return useMemo(() => {
    try {
      const d = derivative(parse(source), "z");
      return { text: print(d), error: null };
    } catch (e) {
      return { text: "", error: e instanceof Error ? e.message : String(e) };
    }
  }, [source]);
}

export function ExpressionPanel() {
  const activeId = useStore((s) => s.activeId);
  const domain = !!FRACTAL_BY_ID[activeId].domain;
  const source = useStore((s) => (domain ? s.complexExpr : s.customExpr));
  const setExpr = useStore((s) => s.setExpr);
  const exprError = useStore((s) => s.exprError);
  const deriv = useDerivative(source);
  const examples = domain ? EXAMPLES_Z : EXAMPLES_ZC;

  return (
    <div className="border-b border-white/5 px-4 py-3">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-cyan-300/70">
        {domain ? "f(z) =" : "f(z, c) ="}
      </h2>
      <input
        value={source}
        spellCheck={false}
        onChange={(e) => setExpr(e.target.value)}
        className={`w-full rounded bg-slate-800/80 px-2 py-1.5 font-mono text-sm text-cyan-100 outline-none focus:ring-1 ${
          exprError ? "ring-1 ring-red-500/60" : "focus:ring-cyan-400"
        }`}
      />
      {exprError ? (
        <p className="mt-1 text-[11px] text-red-300">{exprError}</p>
      ) : (
        <p className="mt-1 font-mono text-[11px] text-slate-500">
          ∂/∂z = <span className="text-emerald-300">{deriv.error ? "—" : deriv.text}</span>
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => setExpr(ex)}
            className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-400 hover:bg-white/10 hover:text-cyan-200"
          >
            {ex}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-600">
        vars: z, c, i, p · fns: sin cos tan exp ln log sqrt conjugate · p = exponent slider
      </p>
    </div>
  );
}
