// Inspector registry — the capability/registry extension point (spec §65). Each domain
// registers an inspector under its object `kind`; the engine (engine.ts) dispatches by
// looking the kind up here instead of a hard-coded switch, so a new domain ships by adding
// its module plus one `registerInspector` call and touches no existing inspector. React-free.
//
// State is a module-level Map, populated once at load: engine.ts wires the four built-ins,
// and each domain module adds itself. Vitest isolates module state per test file, so a test
// that registers a throwaway kind cannot leak into another file's registry.
import type { MathObject, InspectionResult } from "./types.ts";

/** An inspector receives the whole object and returns its structured inspection. */
export type InspectorFn = (obj: MathObject) => InspectionResult;

const registry = new Map<string, InspectorFn>();

/** Register (or replace) the inspector for an object `kind`. Last registration wins. */
export function registerInspector(kind: string, fn: InspectorFn): void {
  registry.set(kind, fn);
}

/** The inspector registered for `kind`, or undefined when no domain has registered one. */
export function getInspector(kind: string): InspectorFn | undefined {
  return registry.get(kind);
}

/** Every registered kind, in registration order — for self-describing UIs and tests. */
export function registeredKinds(): string[] {
  return [...registry.keys()];
}
