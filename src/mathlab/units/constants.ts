// Structured registry of scientific constants (spec §42) — mathematical and physical. Each
// constant carries its SI value, display unit, physical Dimension, category, and a source tag,
// so nothing is a bare magic number scattered through the code. Physical values follow the SI
// 2019 redefinition: c, h, e, k_B, N_A are EXACT by definition; measured ones (G, mₑ, mₚ) note
// their source. Access a value+dimension as a Quantity via `constantQuantity(key)`.
import { type Dimension, dim } from "./dimension.ts";
import { type Quantity, quantity } from "./quantity.ts";
import { InvalidInputError } from "../core/errors.ts";

export type ConstantCategory = "mathematical" | "physical";

export interface ScientificConstant {
  name: string;
  symbol: string;
  value: number;      // SI base units (or dimensionless for mathematical)
  unit: string;       // display unit, e.g. "m/s"
  dim: Dimension;
  category: ConstantCategory;
  source: string;     // "SI 2019 (exact)", "CODATA 2018", "definition"
}

const c = (name: string, symbol: string, value: number, unit: string, d: Dimension, category: ConstantCategory, source: string): ScientificConstant =>
  ({ name, symbol, value, unit, dim: d, category, source });

const DIMLESS = dim();

export const CONSTANTS: Record<string, ScientificConstant> = {
  // mathematical (dimensionless)
  pi: c("pi", "π", Math.PI, "", DIMLESS, "mathematical", "definition"),
  e: c("Euler's number", "e", Math.E, "", DIMLESS, "mathematical", "definition"),
  phi: c("golden ratio", "φ", (1 + Math.sqrt(5)) / 2, "", DIMLESS, "mathematical", "definition"),
  tau: c("tau", "τ", 2 * Math.PI, "", DIMLESS, "mathematical", "definition"),
  // physical
  c: c("speed of light", "c", 299792458, "m/s", dim({ length: 1, time: -1 }), "physical", "SI 2019 (exact)"),
  h: c("Planck constant", "h", 6.62607015e-34, "J·s", dim({ mass: 1, length: 2, time: -1 }), "physical", "SI 2019 (exact)"),
  hbar: c("reduced Planck", "ħ", 6.62607015e-34 / (2 * Math.PI), "J·s", dim({ mass: 1, length: 2, time: -1 }), "physical", "derived from h"),
  kB: c("Boltzmann constant", "k_B", 1.380649e-23, "J/K", dim({ mass: 1, length: 2, time: -2, temperature: -1 }), "physical", "SI 2019 (exact)"),
  e_charge: c("elementary charge", "e", 1.602176634e-19, "C", dim({ current: 1, time: 1 }), "physical", "SI 2019 (exact)"),
  NA: c("Avogadro constant", "N_A", 6.02214076e23, "1/mol", dim({ amount: -1 }), "physical", "SI 2019 (exact)"),
  R: c("molar gas constant", "R", 8.314462618, "J/(mol·K)", dim({ mass: 1, length: 2, time: -2, amount: -1, temperature: -1 }), "physical", "derived (N_A·k_B)"),
  G: c("gravitational constant", "G", 6.67430e-11, "m³/(kg·s²)", dim({ length: 3, mass: -1, time: -2 }), "physical", "CODATA 2018"),
  me: c("electron mass", "mₑ", 9.1093837015e-31, "kg", dim({ mass: 1 }), "physical", "CODATA 2018"),
  mp: c("proton mass", "mₚ", 1.67262192369e-27, "kg", dim({ mass: 1 }), "physical", "CODATA 2018"),
  g0: c("standard gravity", "g₀", 9.80665, "m/s²", dim({ length: 1, time: -2 }), "physical", "definition"),
};

/** Look up a constant by key (throws InvalidInputError on unknown key). */
export function constant(key: string): ScientificConstant {
  const k = CONSTANTS[key];
  if (!k) throw new InvalidInputError(`unknown constant "${key}"; known: ${Object.keys(CONSTANTS).join(", ")}`);
  return k;
}

/** The constant as a dimensional Quantity (value already in SI base units). */
export const constantQuantity = (key: string): Quantity => {
  const k = constant(key);
  return quantity(k.value, k.dim);
};
