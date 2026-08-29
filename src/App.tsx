import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { FractalCanvas, type Stats } from "./components/FractalCanvas.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Topbar } from "./components/Topbar.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { GraphView } from "./components/graph/GraphView.tsx";
import { BlochView } from "./components/bloch/BlochView.tsx";
import { FourDView } from "./components/fourd/FourDView.tsx";
import { TopoView } from "./components/topo/TopoView.tsx";
import { useStore, type AppMode } from "./store.ts";

// KaTeX-heavy views are lazy-loaded to keep the initial bundle lean.
const DocsView = lazy(() => import("./components/docs/DocsView.tsx").then((m) => ({ default: m.DocsView })));
const InspectorView = lazy(() => import("./components/inspector/InspectorView.tsx").then((m) => ({ default: m.InspectorView })));

/** Drives parameter animation; animTick no-ops (no set) while paused. */
function useAnimDriver() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      useStore.getState().animTick(Math.min(dt, 0.05));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

function ModeNav() {
  const appMode = useStore((s) => s.appMode);
  const setAppMode = useStore((s) => s.setAppMode);
  const tabs: { id: AppMode; label: string }[] = [
    { id: "calculator", label: "Calculator" },
    { id: "fractal", label: "Fractal Lab" },
    { id: "bloch", label: "Bloch Sphere" },
    { id: "fourd", label: "4D" },
    { id: "topo", label: "Topology" },
    { id: "inspector", label: "Inspector" },
    { id: "docs", label: "Docs" },
  ];
  return (
    <div className="flex items-center gap-1 border-b border-white/5 bg-[#05070d] px-3 py-1.5">
      <span className="mr-3 text-sm font-bold tracking-widest text-cyan-300">MATH·LAB</span>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setAppMode(t.id)}
          className={`rounded px-3 py-1 text-xs font-medium transition ${
            appMode === t.id ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-slate-400 hover:bg-white/5"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function App() {
  useAnimDriver();
  const appMode = useStore((s) => s.appMode);
  const [stats, setStats] = useState<Stats>({ fps: 0, ms: 0, width: 0, height: 0 });
  const onStats = useCallback(
    (s: Stats) => setStats((prev) => (s.ms < 0 ? { ...prev, fps: s.fps, width: s.width, height: s.height } : s)),
    [],
  );

  return (
    <div className="flex h-full flex-col">
      <ModeNav />
      {appMode === "calculator" ? (
        <GraphView />
      ) : appMode === "bloch" ? (
        <BlochView />
      ) : appMode === "fourd" ? (
        <FourDView />
      ) : appMode === "topo" ? (
        <TopoView />
      ) : appMode === "inspector" ? (
        <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
          <InspectorView />
        </Suspense>
      ) : appMode === "docs" ? (
        <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
          <DocsView />
        </Suspense>
      ) : (
        <>
          <Topbar stats={stats} />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="relative min-w-0 flex-1">
              <FractalCanvas onStats={onStats} />
            </main>
          </div>
          <StatusBar />
        </>
      )}
    </div>
  );
}
