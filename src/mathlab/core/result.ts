// Coherent result model for mathematical computation. A math operation can
// legitimately fail to produce a value (divergent, undefined, unsupported)
// WITHOUT throwing — this lets the UI distinguish "the mathematics is undefined"
// from "the implementation crashed". Numerical approximations carry metadata so
// a numerical estimate is never mistaken for an exact/symbolic proof.

export interface ApproxMeta {
  error?: number;      // estimated absolute error
  evals?: number;      // function evaluations used
  iterations?: number;
  converged?: boolean;
  warnings?: string[];
}

export type MathResult<T> =
  | { kind: "exact"; value: T }
  | ({ kind: "approx"; value: T } & ApproxMeta)
  | { kind: "divergent"; reason?: string }
  | { kind: "undefined"; reason?: string }
  | { kind: "notConverged"; value?: T; reason?: string }
  | { kind: "unsupported"; reason?: string }
  | { kind: "domainError"; reason?: string }
  | { kind: "numericalError"; reason?: string };

export const exact = <T>(value: T): MathResult<T> => ({ kind: "exact", value });
export const approx = <T>(value: T, meta: ApproxMeta = {}): MathResult<T> => ({ kind: "approx", value, ...meta });
export const divergent = <T>(reason?: string): MathResult<T> => ({ kind: "divergent", reason });
export const undefinedResult = <T>(reason?: string): MathResult<T> => ({ kind: "undefined", reason });
export const unsupported = <T>(reason?: string): MathResult<T> => ({ kind: "unsupported", reason });
export const domainError = <T>(reason?: string): MathResult<T> => ({ kind: "domainError", reason });

/** True only for exact/approx results that carry a value. */
export const hasValue = <T>(r: MathResult<T>): r is { kind: "exact" | "approx"; value: T } & ApproxMeta =>
  r.kind === "exact" || r.kind === "approx";
