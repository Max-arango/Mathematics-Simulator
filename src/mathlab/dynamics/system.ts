// Dynamical-system representation for the shared math engine.
//
// A dynamical system is a vector field over a set of named state variables. We store
// the field as expression SOURCE strings (one per state variable) plus their parsed
// AST — never as serialized JS functions (spec §47/§81: no functions cross the wire,
// so a system can be saved/loaded/snapshotted like any other document). Named params
// (bifurcation knobs like r, mu, beta) are bound at eval time by merging them into the
// evaluation environment alongside the state variables.
//
//   continuous:  dx_i/dt = field_i(x, params)         → analysed via flow / Re(λ)
//   discrete:    x_i(n+1) = field_i(x, params)         → analysed via map  / |λ|
//
// The `kind` does NOT change how the field is evaluated (both are just f(x)); it only
// selects the downstream stability/fixed-point criterion (see stability.ts, equilibria.ts).
import type { Node } from "../core/ast.ts";
import { freeVars } from "../core/ast.ts";
import { parse } from "../core/parser.ts";
import { evaluate, type Env } from "../core/eval.ts";
import { jacobian } from "../calculus/vectorCalculus.ts";
import { InvalidInputError } from "../core/errors.ts";
import type { Vec } from "../linear/vector.ts";

export type SystemKind = "continuous" | "discrete";

export interface DynamicalSystem {
  /** State variable names, e.g. ["x","y"]. Ordered; positions align to `field`/points. */
  vars: string[];
  /** One expression string per state variable (dx_i/dt or x_i(n+1)). */
  fieldSource: string[];
  /** Parsed `fieldSource`, aligned to `vars`. */
  field: Node[];
  /** Named parameters bound into the eval environment at evaluation time. */
  params: Record<string, number>;
  kind: SystemKind;
}

/**
 * Build a dynamical system from state-variable names and one field expression per
 * variable. Parses every expression and validates it. Throws InvalidInputError when:
 *   • fieldSource.length ≠ vars.length,
 *   • vars is empty or has duplicate names,
 *   • a param name collides with a state-variable name (ambiguous binding),
 *   • an expression references a free variable that is neither a state variable, a
 *     declared param, nor a built-in constant (pi/e/phi/tau, already excluded by
 *     `freeVars`) — i.e. free vars ⊄ (vars ∪ params ∪ constants).
 */
export function makeSystem(
  vars: string[],
  fieldSource: string[],
  params: Record<string, number> = {},
  kind: SystemKind = "continuous",
): DynamicalSystem {
  if (kind !== "continuous" && kind !== "discrete") {
    throw new InvalidInputError(`kind must be "continuous" or "discrete", got "${kind}"`);
  }
  if (vars.length === 0) throw new InvalidInputError("a system needs at least one state variable");
  if (new Set(vars).size !== vars.length) {
    throw new InvalidInputError(`state variable names must be unique: [${vars.join(", ")}]`);
  }
  if (fieldSource.length !== vars.length) {
    throw new InvalidInputError(
      `field has ${fieldSource.length} expression(s) but there are ${vars.length} state variable(s)`,
    );
  }
  for (const p of Object.keys(params)) {
    if (vars.includes(p)) {
      throw new InvalidInputError(`param "${p}" collides with a state variable name`);
    }
  }

  const allowed = new Set([...vars, ...Object.keys(params)]);
  const field = fieldSource.map((src, i) => {
    let node: Node;
    try {
      node = parse(src);
    } catch (e) {
      throw new InvalidInputError(`could not parse field expression #${i} "${src}": ${(e as Error).message}`);
    }
    const unknown = [...freeVars(node)].filter((v) => !allowed.has(v));
    if (unknown.length > 0) {
      throw new InvalidInputError(
        `field expression #${i} "${src}" references unknown symbol(s) [${unknown.join(", ")}]; ` +
          `known state vars [${vars.join(", ")}], params [${Object.keys(params).join(", ")}]`,
      );
    }
    return node;
  });

  return { vars, fieldSource, field, params, kind };
}

// Build the eval environment for a state point: params first, then state variables
// (state binding wins on the — already rejected — name-collision case). Guards the
// point dimension as a trust boundary since evalField/jacobianField are public.
function fieldEnv(sys: DynamicalSystem, point: Vec): Env {
  if (point.length !== sys.vars.length) {
    throw new InvalidInputError(`point has ${point.length} coord(s), expected ${sys.vars.length}`);
  }
  const vars: Record<string, number> = { ...sys.params };
  sys.vars.forEach((v, i) => (vars[v] = point[i]));
  return { vars, funcs: {} };
}

/** Evaluate the field at a state point (binds state vars + params). Returns f(point). */
export function evalField(sys: DynamicalSystem, point: Vec): Vec {
  const env = fieldEnv(sys, point);
  return sys.field.map((f) => evaluate(f, env));
}

/**
 * Numeric Jacobian of the FIELD at a state point, ∂field_i/∂var_j evaluated at `point`.
 * Uses the symbolic Jacobian (calculus/vectorCalculus) then evaluates each entry with
 * params bound — vectorCalculus.jacobianAt cannot, because it only binds the given vars,
 * so a field containing params would throw there. Recomputed per call; cheap for the
 * small systems this lab works with. This is J_f for BOTH kinds; the discrete-vs-continuous
 * difference lives in the callers (Newton residual uses J_f−I; stability uses |λ| vs Re λ).
 */
export function jacobianField(sys: DynamicalSystem, point: Vec): number[][] {
  const env = fieldEnv(sys, point);
  const jsym = jacobian(sys.field, sys.vars);
  return jsym.map((row) => row.map((entry) => evaluate(entry, env)));
}
