import type { EnvironmentErrorCode } from "./EnvironmentErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `EnvironmentError` reproduce la misma forma (`code`,
 * `message`, `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`)
 * como clase propia de `@dwm/environment-manager`, con su propio
 * catálogo cerrado.
 */
export type EnvironmentErrorOrigin =
  "request" | "registry" | "detector" | "process" | "validation" | "variable" | "inspection";

export interface EnvironmentErrorOptions {
  code: EnvironmentErrorCode;
  message: string;
  origin: EnvironmentErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class EnvironmentError extends Error {
  public readonly code: EnvironmentErrorCode;
  public readonly origin: EnvironmentErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: EnvironmentErrorOptions) {
    super(options.message);
    this.name = "EnvironmentError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EnvironmentError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<EnvironmentErrorOptions, "cause" | "message"> & { message?: string }
  ): EnvironmentError {
    if (err instanceof EnvironmentError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de entorno");
    return new EnvironmentError({ ...options, message, cause: err });
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

export function createEnvironmentError(options: EnvironmentErrorOptions): EnvironmentError {
  return new EnvironmentError(options);
}
