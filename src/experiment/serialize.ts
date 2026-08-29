import { FORMAT, FORMAT_VERSION, LIMITS, type Experiment, type Cell } from "./types.ts";

// Experiment files / share payloads are UNTRUSTED. Deserialization is purely
// declarative JSON parsing + schema validation + resource limits. Never eval,
// new Function, or dynamic import. Malformed data fails safely with structured
// errors instead of crashing or executing anything.

export function serialize(exp: Experiment): string {
  return JSON.stringify(exp, null, 2);
}

export interface DeserializeResult {
  ok: boolean;
  experiment?: Experiment;
  errors: string[];
}

const isFiniteNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";

function validateCell(c: unknown, i: number, errors: string[], exprNames: Set<string>): void {
  if (typeof c !== "object" || c === null) { errors.push(`cell ${i}: not an object`); return; }
  const cell = c as Record<string, unknown>;
  if (!isStr(cell.id)) errors.push(`cell ${i}: missing id`);
  switch (cell.kind) {
    case "markdown":
      if (!isStr(cell.source)) errors.push(`cell ${i}: markdown source must be a string`);
      else if (cell.source.length > LIMITS.maxSourceLen) errors.push(`cell ${i}: source too long`);
      break;
    case "parameter":
      if (!isStr(cell.name) || (cell.name as string).length > LIMITS.maxNameLen) errors.push(`cell ${i}: invalid parameter name`);
      for (const k of ["value", "min", "max", "step"]) if (!isFiniteNum(cell[k])) errors.push(`cell ${i}: parameter ${k} must be a finite number`);
      if (isFiniteNum(cell.value) && Math.abs(cell.value) > LIMITS.maxParamMagnitude) errors.push(`cell ${i}: parameter value out of bounds`);
      break;
    case "expression":
      if (!isStr(cell.name) || (cell.name as string).length > LIMITS.maxNameLen) errors.push(`cell ${i}: invalid expression name`);
      else if (exprNames.has(cell.name as string)) errors.push(`cell ${i}: duplicate expression name "${cell.name}"`);
      else exprNames.add(cell.name as string);
      if (!isStr(cell.source)) errors.push(`cell ${i}: expression source must be a string`);
      else if ((cell.source as string).length > LIMITS.maxSourceLen) errors.push(`cell ${i}: source too long`);
      break;
    case "analysis":
      if (!isStr(cell.targetName)) errors.push(`cell ${i}: analysis targetName must be a string`);
      break;
    default:
      errors.push(`cell ${i}: unknown kind "${String(cell.kind)}"`);
  }
}

function migrate(obj: Record<string, unknown>): Record<string, unknown> {
  // No migrations yet (only v1 exists). Structure is here for forward compat:
  // e.g. if (obj.version === 1) { ...upgrade to 2...; obj.version = 2 }
  return obj;
}

export function validate(input: unknown): DeserializeResult {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) return { ok: false, errors: ["root is not an object"] };
  const obj = migrate(input as Record<string, unknown>);

  if (obj.format !== FORMAT) errors.push(`format must be "${FORMAT}"`);
  if (!isFiniteNum(obj.version)) errors.push("missing/invalid version");
  else if ((obj.version as number) > FORMAT_VERSION) errors.push(`experiment version ${obj.version} is newer than supported (${FORMAT_VERSION})`);

  const meta = obj.metadata as Record<string, unknown> | undefined;
  if (typeof meta !== "object" || meta === null || !isStr(meta.title)) errors.push("invalid metadata");

  if (!Array.isArray(obj.cells)) errors.push("cells must be an array");
  else {
    if (obj.cells.length > LIMITS.maxCells) errors.push(`too many cells (> ${LIMITS.maxCells})`);
    const exprNames = new Set<string>();
    obj.cells.forEach((c, i) => validateCell(c, i, errors, exprNames));
    // analysis targets must reference an existing expression name
    for (let i = 0; i < obj.cells.length; i++) {
      const c = obj.cells[i] as Record<string, unknown>;
      if (c.kind === "analysis" && isStr(c.targetName) && !exprNames.has(c.targetName)) errors.push(`cell ${i}: analysis references unknown expression "${c.targetName}"`);
    }
  }
  if (typeof obj.settings !== "object" || obj.settings === null || !isFiniteNum((obj.settings as Record<string, unknown>).seed))
    errors.push("invalid settings.seed");

  if (errors.length) return { ok: false, errors };
  return { ok: true, experiment: obj as unknown as Experiment, errors: [] };
}

export function deserialize(json: string): DeserializeResult {
  let parsed: unknown;
  try { parsed = JSON.parse(json); }
  catch (e) { return { ok: false, errors: [`invalid JSON: ${e instanceof Error ? e.message : e}`] }; }
  return validate(parsed);
}

/** Structural diff between two experiments (for snapshot comparison). */
export function diff(a: Experiment, b: Experiment): string[] {
  const out: string[] = [];
  const byId = (e: Experiment) => new Map(e.cells.map((c) => [c.id, c] as const));
  const A = byId(a), B = byId(b);
  for (const [id, ca] of A) {
    const cb = B.get(id);
    if (!cb) out.push(`removed ${ca.kind} cell`);
    else if (JSON.stringify(ca) !== JSON.stringify(cb)) out.push(`changed ${ca.kind} cell${label(ca)}`);
  }
  for (const [id, cb] of B) if (!A.has(id)) out.push(`added ${cb.kind} cell${label(cb)}`);
  return out;
}
const label = (c: Cell) => ("name" in c ? ` "${c.name}"` : c.kind === "analysis" ? ` → ${c.targetName}` : "");
