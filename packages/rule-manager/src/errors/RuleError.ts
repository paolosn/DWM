import type { RuleErrorCode } from "./RuleErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `RuleError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/rule-manager`, con su propio catálogo cerrado.
 */
export type RuleErrorOrigin =
  "request" | "id" | "directory" | "repository" | "registry" | "validation" | "lifecycle";

export interface RuleErrorOptions {
  code: RuleErrorCode;
  message: string;
  origin: RuleErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class RuleError extends Error {
  public readonly code: RuleErrorCode;
  public readonly origin: RuleErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: RuleErrorOptions) {
    super(options.message);
    this.name = "RuleError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RuleError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<RuleErrorOptions, "cause" | "message"> & { message?: string }
  ): RuleError {
    if (err instanceof RuleError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de reglas");
    return new RuleError({ ...options, message, cause: err });
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      origin: this.origin,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
    };
  }
}

export function createRuleError(options: RuleErrorOptions): RuleError {
  return new RuleError(options);
}
