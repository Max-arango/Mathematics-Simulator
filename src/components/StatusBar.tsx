import { useStore } from "../store.ts";
import { FRACTAL_BY_ID } from "../fractals/registry.ts";

// Coordinates + iteration run in emulated double precision (df64, ~1e-13
// resolution for integer exponents). Below this span even df64 loses pixels.
// ponytail: df64 floor; lift further with perturbation-theory reference
// orbits (Phase 4). Fractional exponents still use the float32 path (~5e-5).
const PRECISION_FLOOR = 2e-12;

export function StatusBar() {
  const view = useStore((s) => s.view);
  const baseSpan = FRACTAL_BY_ID[useStore((s) => s.activeId)].view.span;
  const zoom = baseSpan / view.span;
  const lowPrecision = view.span < PRECISION_FLOOR;

  const fmt = (n: number) => (Math.abs(n) < 1e-3 || Math.abs(n) > 1e6 ? n.toExponential(6) : n.toFixed(9));

  return (
    <footer className="flex items-center gap-6 border-t border-white/5 bg-[#080b14] px-4 py-1.5 text-[11px] tabular-nums text-slate-500">
      <span>Re <b className="text-slate-300">{fmt(view.centerRe)}</b></span>
      <span>Im <b className="text-slate-300">{fmt(view.centerIm)}</b></span>
      <span>Zoom <b className="text-cyan-300">{zoom < 1000 ? `${zoom.toFixed(2)}×` : `${zoom.toExponential(2)}×`}</b></span>
      <span>Width <b className="text-slate-300">{view.span.toExponential(3)}</b></span>
      {lowPrecision && (
        <span className="ml-auto rounded bg-amber-500/15 px-2 py-0.5 text-amber-300">
          ⚠ float32 precision limit — deep-zoom detail degraded
        </span>
      )}
    </footer>
  );
}
