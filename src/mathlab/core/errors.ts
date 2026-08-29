// Structured, typed error model for numerical domains. Foundation for Phase IV
// domains only — existing modules keep their current failure model. Each error
// carries a stable machine-readable `code` (for switch/telemetry) while `message`
// stays human-readable; `name` is the concrete subclass name so stack traces and
// logs identify the failure without inspecting `code`.

export type ErrorCode =
  | "dimension"
  | "convergence"
  | "singularity"
  | "numerical-instability"
  | "resource-limit"
  | "invalid-input"
  | "unsupported-operation"
  | "domain";

export class MathError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message?: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class DimensionError extends MathError {
  constructor(message = "dimension mismatch") { super("dimension", message); }
}
export class ConvergenceError extends MathError {
  constructor(message = "failed to converge") { super("convergence", message); }
}
export class SingularityError extends MathError {
  constructor(message = "singularity encountered") { super("singularity", message); }
}
export class NumericalInstabilityError extends MathError {
  constructor(message = "numerical instability") { super("numerical-instability", message); }
}
export class ResourceLimitError extends MathError {
  constructor(message = "resource limit exceeded") { super("resource-limit", message); }
}
export class InvalidInputError extends MathError {
  constructor(message = "invalid input") { super("invalid-input", message); }
}
export class UnsupportedOperationError extends MathError {
  constructor(message = "unsupported operation") { super("unsupported-operation", message); }
}
export class DomainError extends MathError {
  constructor(message = "outside domain") { super("domain", message); }
}
